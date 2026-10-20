// Sign-in, reload, cleared browser data and owner recovery, end to end: the
// real app store on an in-memory IndexedDB, talking through fetch to the real
// Worker on an in-memory database. A returning ACCOUNT (kept on the server) is
// not a returning DEVICE (kept only in this browser's IndexedDB).

import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { handle } from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { createD1 } from './d1-shim';

// Real PBKDF2 (310,000 rounds) and Worker crypto run here; under a full parallel
// test run they compete for CPU, so allow more than the 5 s default. The waits
// below are upper bounds, not delays.
vi.setConfig({ testTimeout: 30_000 });

const SETUP_TOKEN = 'setup-token-for-tests-123';
const env: Env & { DB: ReturnType<typeof createD1> } = { DB: createD1(), PIN_PEPPER: 'test-pepper-0123456789-abcdefghijklmnop', SETUP_TOKEN };
const n = (sql: string) => (env.DB.raw.prepare(sql).get() as { n: number }).n;

/** While set, downloads wait: lets a test keep a sync "running". */
let holdPull: Promise<void> | null = null;

type StoreModule = typeof import('../src/client/lib/store');
let store: StoreModule['store'];

/** A fresh page load: new module instances, same browser storage. */
async function reload() {
  // A real reload ends the old page's work; here the old store lives on in the
  // same process, so retire it explicitly (lock ends its session generation).
  store?.lock();
  vi.resetModules();
  ({ store } = await import('../src/client/lib/store'));
  await store.boot();
  return store.getSnapshot();
}

/** What clearing this site's data in the browser does to the app's storage. */
async function clearSiteData() {
  store.lock();
  // lock() reloads the profile list in the background; let it finish first.
  await vi.waitFor(() => expect(store.getSnapshot().phase).toBe('welcome'));
  await new Promise((r) => setTimeout(r, 100));
  const { deviceDb } = await import('../src/client/lib/db');
  deviceDb.close();
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase('mabubu-device');
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

beforeAll(() => {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  const events = { addEventListener: () => {}, removeEventListener: () => {} };
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', { ...events, visibilityState: 'hidden' });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (holdPull && input.startsWith('/api/sync/pull')) await holdPull;
    return handle(new Request(`https://mabubu.test${input}`, init), env);
  });
});

afterAll(() => store?.lock());

describe('owner: first setup, routine sign-in, reload, cleared data, recovery', () => {
  let firstDeviceId = '';

  it('first launch on an empty server opens first setup, and creates the one owner with the starter step', async () => {
    const s = await reload();
    expect(s.phase).toBe('setup');
    await store.setup(SETUP_TOKEN, 'George', '470915');
    const after = store.getSnapshot();
    expect(after.phase).toBe('ready');
    expect(after.user?.role).toBe('owner');
    expect(after.firstRun).toBe(true);
    firstDeviceId = after.device!.deviceId;
    // Record something, as the starter step would, and let it reach the server.
    const r = await store.submit('location.upsert', { id: 'loc-com', name: 'Comoros', kind: 'selling', currency: 'KMF', active: true });
    expect(r.ok).toBe(true);
    store.dismissFirstRun();
    await vi.waitFor(() => expect(n('SELECT COUNT(*) AS n FROM ops'), JSON.stringify(store.getSnapshot().sync)).toBe(1), { timeout: 10_000 });
  });

  it('after a reload the device and profile are remembered; the code unlocks without a new device or approval', async () => {
    const s = await reload();
    expect(s.phase).toBe('welcome');
    expect(s.device?.deviceId).toBe(firstDeviceId);
    const owner = s.profiles.find((p) => !p.demo)!;
    expect(owner.role).toBe('owner');
    // Wrong code: refused on the device.
    await expect(store.unlock(owner, '111111')).rejects.toThrow(/Wrong code/);
    expect(await store.unlock(store.getSnapshot().profiles[0]!, '470915')).toBeNull();
    expect(store.getSnapshot().phase).toBe('ready');
    expect(n('SELECT COUNT(*) AS n FROM devices')).toBe(1);
  });

  it('after site data is cleared: the account is still there, the device is new, and first setup is NOT offered', async () => {
    await clearSiteData();
    const s = await reload();
    expect(s.device?.deviceId).not.toBe(firstDeviceId);
    expect(s.profiles).toHaveLength(0);
    // The server, not the browser, decides: the business exists, so sign-in, not setup.
    expect(s.phase).toBe('welcome');
    const r = await store.signIn('george', '470915');
    expect(r).toMatchObject({ status: 'pending', role: 'owner' });
    expect(n('SELECT COUNT(*) AS n FROM users')).toBe(1);
  });

  it('owner recovery with the setup key approves this device, keeps one owner, and never re-offers the starter step', async () => {
    store.goTo('setup', { name: 'George', pin: '470915' });
    expect(store.getSnapshot().recoverFor).toEqual({ name: 'George', pin: '470915' });
    await expect(store.setup('not-the-right-key-000', 'George', '470915')).rejects.toThrow(/not correct/);
    await store.setup(SETUP_TOKEN, 'George', '470915');
    const s = store.getSnapshot();
    expect(s.phase).toBe('ready');
    expect(s.user?.role).toBe('owner');
    expect(s.firstRun).toBe(false);
    expect(s.recoverFor).toBeNull();
    expect(n("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'")).toBe(1);
    expect(n("SELECT COUNT(*) AS n FROM device_access WHERE status = 'approved'")).toBe(2);
    // The business records came back from the server; nothing was re-seeded.
    await store.syncNow();
    expect([...store.getSnapshot().records.values()].map((r) => r.op.type)).toEqual(['location.upsert']);
    expect(n('SELECT COUNT(*) AS n FROM ops')).toBe(1);
  });

  it('signing out on this device keeps the account and the device approval', async () => {
    const owner = store.getSnapshot().profiles.find((p) => !p.demo)!;
    await store.removeProfile(owner.userId);
    const s = await reload();
    expect(s.profiles).toHaveLength(0);
    expect(s.phase).toBe('welcome');
    // Same device, already approved: straight in.
    expect(await store.signIn('George', '470915')).toMatchObject({ status: 'ok' });
  });

  it('a record saved while a sync is running is uploaded right after it, not at the next 30-second tick', async () => {
    let release!: () => void;
    holdPull = new Promise((r) => (release = r));
    const running = store.syncNow(); // a sync that is stuck downloading (slow network)
    const r = await store.submit('location.upsert', { id: 'loc-msa', name: 'Mombasa', kind: 'purchasing', currency: 'KES', active: true });
    expect(r.ok ? 'saved' : r.error).toBe('saved');
    // Saving asks for an upload 300 ms later; that request arrives while the
    // slow sync is still running, so it must not simply be dropped.
    await new Promise((res) => setTimeout(res, 700));
    holdPull = null;
    release();
    await running;
    await vi.waitFor(() => expect(n("SELECT COUNT(*) AS n FROM ops WHERE type = 'location.upsert'")).toBe(2), { timeout: 10_000 });
    await vi.waitFor(() => expect(store.getSnapshot().sync.pending).toBe(0), { timeout: 10_000 });
  });

  it('removing a person while their sync is still running does not bring the profile back', async () => {
    let release!: () => void;
    holdPull = new Promise((r) => (release = r));
    const running = store.syncNow();
    const me = store.getSnapshot().user!;
    // The server's copy of this person changes meanwhile, so the finishing sync
    // would want to save an updated profile.
    env.DB.raw.prepare("UPDATE users SET name = 'George M.' WHERE id = ?").run(me.id);
    expect(await store.unsentCount(me.id)).toBe(0);
    await store.removeProfile(me.id);
    holdPull = null;
    release();
    await running;
    await new Promise((res) => setTimeout(res, 300));
    expect(store.getSnapshot().profiles).toHaveLength(0);
    expect(store.getSnapshot().user).toBeNull();
    const s = await reload();
    expect(s.profiles).toHaveLength(0);
    expect(await store.signIn('George', '470915')).toMatchObject({ status: 'ok' });
  });

});

describe('switching session while a sync is running', () => {
  it('opening the demo mid-sync never shows the real person or their records in the demo', async () => {
    expect(await store.signIn('George', '470915')).toMatchObject({ status: 'ok' });
    await vi.waitFor(() => expect(store.getSnapshot().records.size).toBeGreaterThan(0), { timeout: 10_000 });
    const realIds = new Set(store.getSnapshot().records.keys());
    let release!: () => void;
    holdPull = new Promise((r) => (release = r));
    const running = store.syncNow();
    store.lock();
    const { DEMO_USERS } = await import('../src/shared/demo-data');
    await store.openDemo(DEMO_USERS[0]!);
    holdPull = null;
    release();
    await running;
    await new Promise((res) => setTimeout(res, 300));
    const s = store.getSnapshot();
    expect(s.demo).toBe(true);
    expect(s.user?.id).toBe(DEMO_USERS[0]!.id);
    expect([...s.records.keys()].filter((id) => realIds.has(id))).toEqual([]);
    store.lock();
    await vi.waitFor(() => expect(store.getSnapshot().phase).toBe('welcome'));
    expect(await store.signIn('George', '470915')).toMatchObject({ status: 'ok' });
  });
});

describe('worker on a new device', () => {
  it('waits for approval as a worker, cannot use owner recovery, and gets in once approved', async () => {
    const ownerToken = store.token!;
    const person = await (await fetch('/api/admin/people', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: 'Jijo', role: 'worker', pin: '4826', locationId: 'loc-com', grants: [], revokes: [], allowOnDeviceId: null }),
    })).json() as { id: string };
    expect(person.id, JSON.stringify(person)).toBeTruthy();

    await clearSiteData();
    await reload();
    const deviceId = store.getSnapshot().device!.deviceId;
    expect(await store.signIn('Jijo', '4826')).toMatchObject({ status: 'pending', role: 'worker' });
    await expect(store.setup(SETUP_TOKEN, 'Jijo', '482613')).rejects.toThrow(/owner/);
    expect(n("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'")).toBe(1);

    await fetch('/api/admin/access', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ deviceId, userId: person.id, decision: 'approve' }),
    });
    const ok = await store.signIn('Jijo', '4826');
    expect(ok).toMatchObject({ status: 'ok' });
    expect(store.getSnapshot().user?.role).toBe('worker');
    expect(store.can('users.manage')).toBe(false);
    // A worker cannot record management data, even from the device.
    const vendor = await store.submit('vendor.upsert', { id: 'v-x', name: 'X', phone: '', notes: '', active: true });
    expect(vendor.ok).toBe(false);
  });
});
