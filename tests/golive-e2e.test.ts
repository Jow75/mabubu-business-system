// Go-live from a worker's phone, end to end: the real app store (in-memory
// IndexedDB) talking through fetch to the real Worker (in-memory database).
// Jijo's phone reported "nothing waiting", then went offline and saved a take.
// Meanwhile the owner went live. When the phone reconnects, its take from the
// testing period must not reach the real records — and must not vanish
// silently either: it is kept aside on the phone for the person to download.

import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { handle } from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { createD1 } from './d1-shim';
import { ENGINE_VERSION, parseOp, type AnyOp, type OpType, type PayloadOf } from '../src/shared/ops';
import { randomToken, uuidv7 } from '../src/shared/ids';
import type { LoginResponse, PushResponse } from '../src/shared/api';
import { workerHolding, stockByLocation } from '../src/shared/queries';
import { GOLIVE_PHRASE, accessChoice, type GoLivePreview, type GoLiveStatus } from '../src/shared/golive';
import { businessDate } from '../src/shared/time';

vi.setConfig({ testTimeout: 30_000 });

const SETUP_TOKEN = 'setup-token-for-tests-123';
const env: Env & { DB: ReturnType<typeof createD1> } = { DB: createD1(), PIN_PEPPER: 'test-pepper-0123456789-abcdefghijklmnop', SETUP_TOKEN };
let offline = false;

type StoreModule = typeof import('../src/client/lib/store');
let store: StoreModule['store'];

const ownerDev = { deviceId: uuidv7(), deviceSecret: randomToken(32), deviceLabel: 'Owner laptop' };
let owner = { token: '', id: '' };
let jijo = '';
let ledger: string | undefined;

async function api<T>(method: string, path: string, body?: unknown, token = owner.token): Promise<T> {
  const res = await handle(new Request(`https://mabubu.test/api${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  return (await res.json()) as T;
}
let clock = Date.now() - 3600_000;
function mk<T extends OpType>(type: T, payload: PayloadOf<T>): AnyOp {
  clock += 1000;
  const r = parseOp({ id: uuidv7(clock), type, payload, actorId: owner.id, deviceId: ownerDev.deviceId, deviceTime: new Date(clock).toISOString(), tzOffsetMin: 180, createdOnline: true, v: ENGINE_VERSION });
  if (!r.ok) throw new Error(r.error);
  return r.op!;
}
const push = (ops: AnyOp[]) => api<PushResponse>('POST', '/sync/push', { ops, clientNow: new Date().toISOString(), ...(ledger ? { ledger } : {}) });
const setOnline = (on: boolean) => {
  offline = !on;
  Object.defineProperty(globalThis.navigator, 'onLine', { value: on, configurable: true });
};
const snap = () => store.getSnapshot();
const holding = () => workerHolding(snap().ledger, jijo).get('gt-haf') ?? 0;
const today = businessDate();
const count = (sql: string, ...p: string[]) => (env.DB.raw.prepare(sql).get(...p) as { n: number }).n;

beforeAll(async () => {
  setOnline(true);
  const events = { addEventListener: () => {}, removeEventListener: () => {} };
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', { ...events, visibilityState: 'hidden' });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (offline) throw new TypeError('offline');
    return handle(new Request(`https://mabubu.test${input}`, init), env);
  });
  const setup = await api<LoginResponse>('POST', '/setup', { setupToken: SETUP_TOKEN, name: 'George', pin: '470915', ...ownerDev }, '');
  if (setup.status !== 'ok') throw new Error('setup failed');
  owner = { token: setup.token, id: setup.user.id };
  await push([
    mk('location.upsert', { id: 'loc-com', name: 'Comoros', kind: 'selling', currency: 'KMF', active: true }),
    mk('vendor.upsert', { id: 'ven-hafsa', name: 'Hafsa', phone: '', notes: '', active: true }),
    mk('garment.upsert', { id: 'gt-haf', code: 'HAF-EN80', name: 'Elastic-neck', sizeCategoryId: null, vendorId: 'ven-hafsa', description: '', swatch: '#c2410c', active: true }),
    mk('price.set', { id: 'pr-haf', garmentTypeId: 'gt-haf', locationId: 'loc-com', currency: 'KMF', retail: 1000, wholesale: 850, effectiveFrom: '2026-01-01' }),
    mk('stock.adjust', { locationId: 'loc-com', date: today, reason: 'found', lines: [{ garmentTypeId: 'gt-haf', delta: 20 }], note: 'Opening stock (test)' }),
  ]);
  jijo = (await api<{ id: string }>('POST', '/admin/people', { name: 'Jijo', role: 'worker', pin: '4826', locationId: 'loc-com', grants: [], revokes: [], allowOnDeviceId: null })).id;
  ({ store } = await import('../src/client/lib/store'));
  await store.boot();
  expect(await store.signIn('Jijo', '4826')).toMatchObject({ status: 'pending' });
  await api('POST', '/admin/access', { deviceId: snap().device!.deviceId, userId: jijo, decision: 'approve' });
  expect(await store.signIn('Jijo', '4826')).toMatchObject({ status: 'ok' });
  await store.syncNow();
});

afterAll(() => store?.lock());

describe('go-live seen from a worker phone that was offline', () => {
  let offlineTake = '';

  it('before go-live: a take syncs normally and the phone reports nothing waiting', async () => {
    const r = await store.submit('worker.issue', { workerId: jijo, locationId: 'loc-com', workDate: today, lines: [{ garmentTypeId: 'gt-haf', qty: 5 }] });
    expect(r.ok).toBe(true);
    await store.syncNow();
    expect(snap().sync.pending).toBe(0);
    expect(holding()).toBe(5);
    const report = env.DB.raw.prepare('SELECT pending FROM device_sync WHERE device_id = ?').get(snap().device!.deviceId) as { pending: number };
    expect(report.pending).toBe(0);
  });

  it('offline, the phone saves another take; meanwhile the owner goes live', async () => {
    setOnline(false);
    const r = await store.submit('worker.issue', { workerId: jijo, locationId: 'loc-com', workDate: today, lines: [{ garmentTypeId: 'gt-haf', qty: 3 }] });
    expect(r.ok).toBe(true);
    offlineTake = r.ok ? r.op.id : '';
    expect(snap().sync.pending).toBe(1);

    // The owner (laptop online) reports, backs up and runs the cutover. Jijo's
    // phone last reported "0 waiting", which is exactly the risk the ledger id covers.
    await api('GET', '/sync/pull?since=0&proto=2&pending=0');
    const backup = await handle(new Request('https://mabubu.test/api/admin/golive/backup', { method: 'POST', headers: { authorization: `Bearer ${owner.token}` } }), env);
    expect(backup.status).toBe(200);
    const p = (await api<GoLiveStatus>('GET', '/admin/golive')) as GoLivePreview;
    const done = await api<GoLiveStatus>('POST', '/admin/golive/execute', {
      pin: '470915',
      phrase: GOLIVE_PHRASE,
      fx: 'keep',
      backupSha256: p.backup!.sha256,
      fingerprint: p.fingerprint,
      acceptUnknownDevices: true,
      access: accessChoice(p.access),
    });
    expect(done.phase).toBe('live');
    ledger = done.phase === 'live' ? done.cutover!.ledger : undefined;
    expect(count('SELECT COUNT(*) AS n FROM ops WHERE actor_id = ?', jijo)).toBe(0);
  });

  it('back online: the phone refreshes to the real ledger and keeps its unsent test take aside, not sent', async () => {
    setOnline(true);
    await store.syncNow();
    await vi.waitFor(() => expect(snap().preGoLive).toBe(1), { timeout: 5000 });
    // Only the real set-up a worker may see (never vendors) is on the phone now: no test takes, no test stock.
    await vi.waitFor(() => expect(snap().records.size).toBe(3), { timeout: 5000 });
    expect([...snap().records.values()].map((r) => r.op.type).sort()).toEqual(['garment.upsert', 'location.upsert', 'price.set']);
    expect(holding()).toBe(0);
    expect(stockByLocation(snap().ledger).get('loc-com')?.get('gt-haf') ?? 0).toBe(0);
    expect(snap().sync.pending).toBe(0);
    // The take saved offline never reached the server…
    expect(count('SELECT COUNT(*) AS n FROM ops WHERE id = ?', offlineTake)).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM ops_trial WHERE id = ?', offlineTake)).toBe(0);
    // …but it is not lost: the person can download it.
    const held = await store.preGoLiveRecords();
    expect(held.map((r) => r.op.id)).toEqual([offlineTake]);
  });

  it('real business continues: opening stock from the owner, then a take from the phone', async () => {
    const r = await push([mk('stock.adjust', { locationId: 'loc-com', date: today, reason: 'count_correction', lines: [{ garmentTypeId: 'gt-haf', delta: 12 }], note: 'Real opening count' })]);
    expect(r.results[0]!.status).toBe('applied');
    await store.syncNow();
    const take = await store.submit('worker.issue', { workerId: jijo, locationId: 'loc-com', workDate: today, lines: [{ garmentTypeId: 'gt-haf', qty: 2 }] });
    expect(take.ok).toBe(true);
    await store.syncNow();
    expect(snap().sync.pending).toBe(0);
    expect(holding()).toBe(2);
    expect(count('SELECT COUNT(*) AS n FROM ops WHERE actor_id = ?', jijo)).toBe(1);
  });

  it('the person removes the kept-aside record after downloading it', async () => {
    await store.discardPreGoLive();
    expect(snap().preGoLive).toBe(0);
    expect(await store.preGoLiveRecords()).toEqual([]);
  });
});
