// The owner's temporary sign-in on a computer that is not one of their
// devices (ADR-006), and people taken off a device's sign-in list once they
// may no longer sign in there — end to end: the real app store on an
// in-memory IndexedDB, talking through fetch to the real Worker on an
// in-memory database. The owner's own laptop is played by direct API calls.

import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { handle } from '../src/worker/index';
import type { Env } from '../src/worker/env';
import type { LoginResponse, PersonRow } from '../src/shared/api';
import { createD1 } from './d1-shim';
import { randomToken, uuidv7 } from '../src/shared/ids';
import { ENGINE_VERSION, parseOp } from '../src/shared/ops';

vi.setConfig({ testTimeout: 30_000 });

const SETUP_TOKEN = 'setup-token-for-tests-123';
const env: Env & { DB: ReturnType<typeof createD1> } = { DB: createD1(), PIN_PEPPER: 'test-pepper-0123456789-abcdefghijklmnop', SETUP_TOKEN };
const n = (sql: string, ...params: string[]) => (env.DB.raw.prepare(sql).get(...params) as { n: number }).n;
const liveTemporary = () => n('SELECT COUNT(*) AS n FROM sessions WHERE temporary = 1 AND revoked_at IS NULL');

/** Simulated upload trouble: the server cannot be reached for uploads. */
let pushMode: 'ok' | 'fail' = 'ok';

/** What a browser tab's sessionStorage gives the page: kept across a reload of the tab, nothing more. */
class TabStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
const tab = new TabStorage();

type StoreModule = typeof import('../src/client/lib/store');
let store: StoreModule['store'];

/** A reload of this tab: new module instances, same browser and tab storage. The old page simply stops. */
async function reload() {
  if (store) {
    // The old page is gone: its timers, and its line to the other tabs.
    const old = store as unknown as { stopTimer(): void; epoch: number; channel: BroadcastChannel | null };
    old.stopTimer();
    old.epoch++;
    old.channel?.close();
  }
  vi.resetModules();
  ({ store } = await import('../src/client/lib/store'));
  await store.boot();
  return store.getSnapshot();
}

/** A computer that has never opened Mabubu: no IndexedDB databases at all. */
async function freshComputer() {
  if (store) store.lock();
  await new Promise((r) => setTimeout(r, 50));
  const { deviceDb } = await import('../src/client/lib/db');
  deviceDb.close();
  for (const d of await indexedDB.databases()) {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.deleteDatabase(d.name!);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }
}

const dbNames = async () => (await indexedDB.databases()).map((d) => d.name).sort();

/** The owner's own laptop (trusted), driven straight through the API. */
const laptop = { deviceId: uuidv7(), deviceSecret: randomToken(32), deviceLabel: 'Owner laptop' };
let owner: { id: string; token: string };
async function asOwner<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await handle(
    new Request(`https://mabubu.test/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.token}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    env,
  );
  return { status: res.status, body: (await res.json()) as T };
}

beforeAll(async () => {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  const events = { addEventListener: () => {}, removeEventListener: () => {} };
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', { ...events, visibilityState: 'hidden' });
  vi.stubGlobal('sessionStorage', tab);
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (input.startsWith('/api/sync/push') && pushMode === 'fail') return new Response(JSON.stringify({ error: 'server_error', message: 'Down.' }), { status: 500 });
    return handle(new Request(`https://mabubu.test${input}`, init), env);
  });
  // The business, set up on the owner's laptop, with one place.
  const setup = await handle(
    new Request('https://mabubu.test/api/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ setupToken: SETUP_TOKEN, name: 'George', pin: '470915', ...laptop }) }),
    env,
  );
  const body = (await setup.json()) as LoginResponse;
  if (body.status !== 'ok') throw new Error('setup failed');
  owner = { id: body.user.id, token: body.token };
  const record = (type: string, payload: unknown) =>
    parseOp({ id: uuidv7(), type, payload, actorId: owner.id, deviceId: laptop.deviceId, deviceTime: new Date().toISOString(), tzOffsetMin: 180, createdOnline: true, v: ENGINE_VERSION }).op;
  const ops = [
    record('location.upsert', { id: 'loc-com', name: 'Comoros', kind: 'selling', currency: 'KMF', active: true }),
    record('garment.upsert', { id: 'gt-test', code: 'TST-01', name: 'Test dera', sizeCategoryId: null, vendorId: null, description: '', swatch: '#c2410c', active: true }),
  ];
  const pushed = await asOwner<{ results: { status: string }[] }>('POST', '/sync/push', { ops, clientNow: new Date().toISOString() });
  expect(pushed.body.results.map((r) => r.status)).toEqual(['applied', 'applied']);
});

afterAll(() => store?.lock());

describe('the owner on a computer that is not theirs: temporary sign-in (ADR-006)', () => {
  it('name and code give a temporary sign-in: records in memory only, nothing remembered on the computer', async () => {
    await freshComputer();
    const s = await reload();
    expect(s.phase).toBe('welcome');
    expect(s.profiles).toHaveLength(0);
    expect(await store.signIn('George', '470915')).toMatchObject({ status: 'pending', role: 'owner' });
    await store.signInTemporary('George', '470915');
    const after = store.getSnapshot();
    expect(after.phase).toBe('ready');
    expect(after.user).toMatchObject({ role: 'owner', temporary: true });
    expect(after.user!.caps).not.toContain('users.manage');
    expect(after.tempUntil).not.toBeNull();
    await store.syncNow();
    expect([...store.getSnapshot().records.values()].map((r) => r.op.type)).toEqual(['location.upsert', 'garment.upsert']);
    // Nothing of the owner on this computer's disk: no saved profile, no copy of the records.
    const { deviceDb } = await import('../src/client/lib/db');
    expect(await deviceDb.profiles.count()).toBe(0);
    expect(await dbNames()).toEqual(['mabubu-device']);
    expect(tab.getItem('mabubu.temporary')).not.toBeNull();
    // On the server: one temporary session, and this computer approved for nobody.
    expect(liveTemporary()).toBe(1);
    expect(n("SELECT COUNT(*) AS n FROM device_access WHERE device_id = ? AND status = 'approved'", after.device!.deviceId)).toBe(0);
    // Records saved here reach the server.
    const r = await store.submit('vendor.upsert', { id: 'ven-temp', name: 'Saved on the cybercafe computer', phone: '', notes: '', active: true });
    expect(r.ok).toBe(true);
    await store.syncNow();
    expect(n("SELECT COUNT(*) AS n FROM ops WHERE type = 'vendor.upsert'")).toBe(1);
  });

  it('a reload of the tab keeps it, with no new device or session on the server', async () => {
    const devices = n('SELECT COUNT(*) AS n FROM devices');
    const sessions = n('SELECT COUNT(*) AS n FROM sessions');
    const s = await reload();
    expect(s.phase).toBe('ready');
    expect(s.user?.temporary).toBe(true);
    await store.syncNow();
    expect(store.getSnapshot().records.size).toBe(3);
    expect(n('SELECT COUNT(*) AS n FROM devices')).toBe(devices);
    expect(n('SELECT COUNT(*) AS n FROM sessions')).toBe(sessions);
    expect(await dbNames()).toEqual(['mabubu-device']);
  });

  it('signing out asks first while a record is unsent; then ends it on the server and leaves nothing', async () => {
    pushMode = 'fail';
    const r = await store.submit('vendor.upsert', { id: 'ven-wait', name: 'Waiting to send', phone: '', notes: '', active: true });
    expect(r.ok).toBe(true);
    await store.syncNow();
    expect(store.getSnapshot().sync.pending).toBe(1);
    expect(store.signOut()).toBe(false);
    expect(store.reloadUnsafe()).toBe(true);
    pushMode = 'ok';
    await store.syncNow();
    expect(store.getSnapshot().sync.pending).toBe(0);
    expect(store.signOut()).toBe(true);
    await vi.waitFor(() => expect(store.getSnapshot().phase).toBe('welcome'));
    expect(store.getSnapshot().tempEnded).toMatchObject({ message: null, unsent: 0 });
    expect(tab.getItem('mabubu.temporary')).toBeNull();
    await vi.waitFor(() => expect(liveTemporary()).toBe(0));
    expect(store.getSnapshot().profiles).toHaveLength(0);
    expect(await dbNames()).toEqual(['mabubu-device']);
  });

  it('ended by the owner while a record is unsent: the record waits in the page and is sent once on the next temporary sign-in', async () => {
    await store.signInTemporary('George', '470915');
    await store.syncNow();
    pushMode = 'fail';
    const r = await store.submit('vendor.upsert', { id: 'ven-carry', name: 'Carried over', phone: '', notes: '', active: true });
    expect(r.ok).toBe(true);
    await store.syncNow();
    const deviceId = store.getSnapshot().device!.deviceId;
    // From the owner's laptop: sign that computer out.
    expect((await asOwner('POST', '/admin/temporary/end', { deviceId, userId: owner.id })).status).toBe(200);
    pushMode = 'ok';
    await store.syncNow();
    await vi.waitFor(() => expect(store.getSnapshot().phase).toBe('welcome'));
    expect(store.getSnapshot().tempEnded).toEqual({ message: 'Your temporary sign-in has ended. Sign in again.', unsent: 1, name: 'George' });
    expect(store.reloadUnsafe()).toBe(true);
    expect(n("SELECT COUNT(*) AS n FROM ops WHERE payload LIKE '%ven-carry%'")).toBe(0);
    await store.signInTemporary('George', '470915');
    await vi.waitFor(() => expect(store.getSnapshot().sync.pending).toBe(0), { timeout: 10_000 });
    await store.syncNow();
    expect(n("SELECT COUNT(*) AS n FROM ops WHERE payload LIKE '%ven-carry%'")).toBe(1);
    expect(store.reloadUnsafe()).toBe(false);
  });

  it('a link opened in another tab continues the same sign-in; Sign out there ends it in both tabs', async () => {
    await store.signInTemporary('George', '470915');
    await store.syncNow();
    const tabA = store;
    const logins = n("SELECT COUNT(*) AS n FROM auth_events WHERE kind = 'login_temporary'");
    const sessions = n('SELECT COUNT(*) AS n FROM sessions');
    // A second tab of the same browser: its own (empty) tab storage, same computer.
    vi.stubGlobal('sessionStorage', new TabStorage());
    vi.resetModules();
    const tabB = (await import('../src/client/lib/store')).store;
    await tabB.boot();
    try {
      expect(tabB.getSnapshot().phase).toBe('ready');
      expect(tabB.getSnapshot().user).toMatchObject({ role: 'owner', temporary: true });
      // No second sign-in on the server, so the first tab was not signed out by it.
      expect(n("SELECT COUNT(*) AS n FROM auth_events WHERE kind = 'login_temporary'")).toBe(logins);
      expect(n('SELECT COUNT(*) AS n FROM sessions')).toBe(sessions);
      expect(liveTemporary()).toBe(1);
      await tabB.syncNow();
      expect(tabA.getSnapshot().phase).toBe('ready');
      // Signing out in the second tab ends it everywhere in this browser.
      expect(tabB.signOut()).toBe(true);
      await vi.waitFor(() => expect(tabA.getSnapshot().phase).toBe('welcome'));
      await vi.waitFor(() => expect(liveTemporary()).toBe(0));
    } finally {
      (tabB as unknown as { channel: BroadcastChannel | null }).channel?.close();
      vi.stubGlobal('sessionStorage', tab);
    }
    // In a browser each tab has its own tab storage, and the first tab's sign-out
    // emptied its own; here both tabs share one global, so do that by hand.
    tab.removeItem('mabubu.temporary');
    // A tab opened when no other tab has it starts at the sign-in screen.
    const s = await reload();
    expect(s.phase).toBe('welcome');
    await store.signInTemporary('George', '470915');
  });

  it('left alone, it signs itself out (never while a record is unsent)', async () => {
    pushMode = 'fail';
    await store.submit('vendor.upsert', { id: 'ven-idle', name: 'Idle test', phone: '', notes: '', active: true });
    await store.syncNow();
    store.idle();
    expect(store.getSnapshot().phase).toBe('ready');
    pushMode = 'ok';
    await store.syncNow();
    store.idle();
    await vi.waitFor(() => expect(store.getSnapshot().phase).toBe('welcome'));
    await vi.waitFor(() => expect(liveTemporary()).toBe(0));
    expect(tab.getItem('mabubu.temporary')).toBeNull();
  });
});

describe('people who may no longer sign in on a device leave its sign-in list', () => {
  let jijo: PersonRow;
  let jijo2: PersonRow;

  async function approveHere(person: PersonRow, pin: string) {
    expect(await store.signIn(person.name, pin)).toMatchObject({ status: 'pending' });
    await asOwner('POST', '/admin/access', { deviceId: store.getSnapshot().device!.deviceId, userId: person.id, decision: 'approve' });
    expect(await store.signIn(person.name, pin)).toMatchObject({ status: 'ok' });
    await store.syncNow();
    store.lock();
    await vi.waitFor(() => expect(store.getSnapshot().phase).toBe('welcome'));
  }

  it('an archived person is taken off the phone when someone else signs in there', async () => {
    await freshComputer();
    await reload();
    const add = (name: string, pin: string) =>
      asOwner<PersonRow>('POST', '/admin/people', { name, role: 'worker', pin, locationId: 'loc-com', grants: [], revokes: [], allowOnDeviceId: null }).then((r) => r.body);
    jijo = await add('Jijo', '4826');
    jijo2 = await add('Jijo 2', '5937');
    await approveHere(jijo, '4826');
    await approveHere(jijo2, '5937');
    expect(store.getSnapshot().profiles.map((p) => p.name).sort()).toEqual(['Jijo', 'Jijo 2']);
    expect(await dbNames()).toContain(`mabubu-u-${jijo.id}`);
    // The owner archives Jijo from the laptop.
    expect((await asOwner('PATCH', `/admin/people/${jijo.id}`, { active: false })).status).toBe(200);
    // Jijo 2 signs in on the same phone and syncs.
    const p2 = store.getSnapshot().profiles.find((p) => p.userId === jijo2.id)!;
    expect(await store.unlock(p2, '5937')).toBeNull();
    await store.syncNow();
    await vi.waitFor(() => expect(store.getSnapshot().profiles.map((p) => p.name)).toEqual(['Jijo 2']));
    expect(store.getSnapshot().removedNames).toEqual(['Jijo']);
    expect(await dbNames()).not.toContain(`mabubu-u-${jijo.id}`);
    // The server kept everything: the person, the device, the history.
    expect(n('SELECT COUNT(*) AS n FROM users WHERE id = ?', jijo.id)).toBe(1);
    store.lock();
    await vi.waitFor(() => expect(store.getSnapshot().phase).toBe('welcome'));
    expect(store.getSnapshot().profiles.map((p) => p.name)).toEqual(['Jijo 2']);
  });

  it('someone with records here that never reached the server stays listed and marked, so nothing is lost silently', async () => {
    const amina = (
      await asOwner<PersonRow>('POST', '/admin/people', { name: 'Amina', role: 'worker', pin: '6048', locationId: 'loc-com', grants: [], revokes: [], allowOnDeviceId: null })
    ).body;
    await approveHere(amina, '6048');
    const pa = store.getSnapshot().profiles.find((p) => p.userId === amina.id)!;
    expect(await store.unlock(pa, '6048')).toBeNull();
    // Amina takes garments with no connection to the server: the take waits on the phone.
    pushMode = 'fail';
    const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
    const take = await store.submit('worker.issue', { workerId: amina.id, locationId: 'loc-com', workDate: today, lines: [{ garmentTypeId: 'gt-test', qty: 3 }] });
    expect(take.ok ? 'saved' : take.error).toBe('saved');
    await store.syncNow();
    expect(store.getSnapshot().sync.pending).toBe(1);
    pushMode = 'ok';
    store.lock();
    await vi.waitFor(() => expect(store.getSnapshot().phase).toBe('welcome'));
    // The owner archives Amina; then Jijo 2 signs in on the same phone and syncs.
    expect((await asOwner('PATCH', `/admin/people/${amina.id}`, { active: false })).status).toBe(200);
    const p2 = store.getSnapshot().profiles.find((p) => p.userId === jijo2.id)!;
    expect(await store.unlock(p2, '5937')).toBeNull();
    await store.syncNow();
    await vi.waitFor(() => expect(store.getSnapshot().profiles.find((p) => p.userId === amina.id)?.blocked).toBe(true));
    // Kept, with her unsent take: never deleted without anyone seeing it.
    expect(await dbNames()).toContain(`mabubu-u-${amina.id}`);
    expect(await store.unsentCount(amina.id)).toBe(1);
    expect(store.getSnapshot().removedNames).toEqual([]);
    store.lock();
    await vi.waitFor(() => expect(store.getSnapshot().phase).toBe('welcome'));
  });

  it('a new code given by the owner works on the phone at once: the server decides, not the old code the phone remembers', async () => {
    expect((await asOwner('POST', `/admin/people/${jijo2.id}/pin`, { pin: '7159' })).status).toBe(200);
    const p2 = store.getSnapshot().profiles.find((p) => p.userId === jijo2.id)!;
    // The phone still remembers 5937; the new code goes to the server and gets in.
    expect(await store.unlock(p2, '7159')).toMatchObject({ status: 'ok' });
    expect(store.getSnapshot().phase).toBe('ready');
    store.lock();
    await vi.waitFor(() => expect(store.getSnapshot().phase).toBe('welcome'));
    // From now on the phone knows the new code, offline too.
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
    const again = store.getSnapshot().profiles.find((p) => p.userId === jijo2.id)!;
    expect(await store.unlock(again, '7159')).toBeNull();
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
    store.lock();
    await vi.waitFor(() => expect(store.getSnapshot().phase).toBe('welcome'));
  });
});
