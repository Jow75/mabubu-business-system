// A late record end to end, as the worker's phone lives it: the real app
// store (in-memory IndexedDB) talking through fetch to the real Worker
// (in-memory database). The owner acts from another device over the API.
// Statuses checked: saved on the phone → waiting to send → reached the server
// but waiting for a manager → accepted, or not accepted with the reason.
// Quantities are worked out by hand in the comments.

import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { handle } from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { createD1 } from './d1-shim';
import { ENGINE_VERSION, parseOp, type AnyOp, type OpType, type PayloadOf } from '../src/shared/ops';
import { randomToken, uuidv7 } from '../src/shared/ids';
import type { LoginResponse, PushResponse } from '../src/shared/api';
import { workerHolding } from '../src/shared/queries';
import { lateRecords } from '../src/shared/late';

vi.setConfig({ testTimeout: 30_000 });

const SETUP_TOKEN = 'setup-token-for-tests-123';
const env: Env & { DB: ReturnType<typeof createD1> } = { DB: createD1(), PIN_PEPPER: 'test-pepper-0123456789-abcdefghijklmnop', SETUP_TOKEN };
let offline = false;

type StoreModule = typeof import('../src/client/lib/store');
let store: StoreModule['store'];

const ownerDev = { deviceId: uuidv7(), deviceSecret: randomToken(32), deviceLabel: 'Owner laptop' };
let owner = { token: '', id: '' };
let jijo = '';
const DAY = '2026-10-17';

async function api<T>(method: string, path: string, body?: unknown, token = owner.token): Promise<T> {
  const res = await handle(new Request(`https://mabubu.test/api${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  return (await res.json()) as T;
}
let clock = Date.now() - 3600_000;
function mk<T extends OpType>(type: T, payload: PayloadOf<T>, actorId = owner.id): AnyOp {
  clock += 1000;
  const r = parseOp({ id: uuidv7(clock), type, payload, actorId, deviceId: ownerDev.deviceId, deviceTime: new Date(clock).toISOString(), tzOffsetMin: 180, createdOnline: true, v: ENGINE_VERSION });
  if (!r.ok) throw new Error(r.error);
  return r.op!;
}
const push = (ops: AnyOp[]) => api<PushResponse>('POST', '/sync/push', { ops, clientNow: new Date().toISOString() });
const setOnline = (on: boolean) => {
  offline = !on;
  Object.defineProperty(globalThis.navigator, 'onLine', { value: on, configurable: true });
};
const snap = () => store.getSnapshot();
const rec = (id: string) => snap().records.get(id)!;
const holding = () => workerHolding(snap().ledger, jijo).get('gt-haf') ?? 0;
const day = () => ({ workerId: jijo, locationId: 'loc-com', workDate: DAY });

beforeAll(async () => {
  setOnline(true);
  const events = { addEventListener: () => {}, removeEventListener: () => {} };
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', { ...events, visibilityState: 'hidden' });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (offline) throw new TypeError('offline');
    return handle(new Request(`https://mabubu.test${input}`, init), env);
  });
  // The owner, on their own laptop: first setup, catalogue, 20 pieces on the Comoros shelf, and Jijo.
  const setup = await api<LoginResponse>('POST', '/setup', { setupToken: SETUP_TOKEN, name: 'George', pin: '470915', ...ownerDev }, '');
  if (setup.status !== 'ok') throw new Error('setup failed');
  owner = { token: setup.token, id: setup.user.id };
  await push([
    mk('location.upsert', { id: 'loc-msa', name: 'Mombasa', kind: 'purchasing', currency: 'KES', active: true }),
    mk('location.upsert', { id: 'loc-com', name: 'Comoros', kind: 'selling', currency: 'KMF', active: true }),
    mk('vendor.upsert', { id: 'ven-hafsa', name: 'Hafsa', phone: '', notes: '', active: true }),
    mk('garment.upsert', { id: 'gt-haf', code: 'HAF-EN80', name: 'Elastic-neck', sizeCategoryId: null, vendorId: 'ven-hafsa', description: '', swatch: '#c2410c', active: true }),
    mk('price.set', { id: 'pr-haf', garmentTypeId: 'gt-haf', locationId: 'loc-com', currency: 'KMF', retail: 1000, wholesale: 850, effectiveFrom: '2026-01-01' }),
    mk('stock.adjust', { locationId: 'loc-com', date: '2026-10-12', reason: 'found', lines: [{ garmentTypeId: 'gt-haf', delta: 20 }], note: 'Opening stock (test)' }),
  ]);
  const person = await api<{ id: string }>('POST', '/admin/people', { name: 'Jijo', role: 'worker', pin: '4826', locationId: 'loc-com', grants: [], revokes: [], allowOnDeviceId: null });
  jijo = person.id;
  // Jijo's phone: the real app store.
  ({ store } = await import('../src/client/lib/store'));
  await store.boot();
  expect(await store.signIn('Jijo', '4826')).toMatchObject({ status: 'pending' });
  await api('POST', '/admin/access', { deviceId: snap().device!.deviceId, userId: jijo, decision: 'approve' });
  expect(await store.signIn('Jijo', '4826')).toMatchObject({ status: 'ok' });
  await store.syncNow();
});

afterAll(() => store?.lock());

describe('a take saved offline that reaches the server after the day was closed', () => {
  let lateTake = '';
  let closing = '';

  it('on time, online: the take reaches the server (Sent)', async () => {
    const r = await store.submit('worker.issue', { ...day(), lines: [{ garmentTypeId: 'gt-haf', qty: 5 }] });
    expect(r.ok).toBe(true);
    await store.syncNow();
    expect(rec(r.ok ? r.op.id : '').status).toBe('applied');
    expect(holding()).toBe(5);
  });

  it('offline: saved on the phone and waiting to send; counted on the phone at once', async () => {
    setOnline(false);
    const r = await store.submit('worker.issue', { ...day(), lines: [{ garmentTypeId: 'gt-haf', qty: 3 }] });
    expect(r.ok).toBe(true);
    lateTake = r.ok ? r.op.id : '';
    await store.syncNow();
    expect(rec(lateTake).status).toBe('pending');
    expect(snap().sync).toMatchObject({ state: 'offline', pending: 1, held: 0 });
    expect(holding()).toBe(8);
  });

  it('meanwhile the owner closes Jijo’s day from the laptop: 5 held, 5 sold', async () => {
    const close = mk('worker.settle', { ...day(), currency: 'KMF', lines: [{ garmentTypeId: 'gt-haf', held: 5, sold: 5, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 }], cash: 5000, mobile: 0, expenses: [], note: '' });
    closing = close.id;
    expect((await push([close])).results[0]!.status).toBe('applied');
  });

  it('back online: the take reached the server but waits for a manager — not refused, not counted, not lost', async () => {
    setOnline(true);
    await store.syncNow();
    expect(rec(lateTake)).toMatchObject({ status: 'rejected', review: 'waiting' });
    expect(snap().sync).toMatchObject({ pending: 0, held: 1, rejected: 0 });
    // The phone now shows what the server counts: the closing sold all 5; the 3 wait.
    expect(holding()).toBe(0);
    expect(lateRecords(snap().ledger, { review: 'waiting' }).map((l) => l.rec.op.id)).toEqual([lateTake]);
    // A second upload attempt changes nothing (the server already has it).
    await store.syncNow();
    expect((env.DB.raw.prepare('SELECT COUNT(*) AS n FROM ops WHERE id = ?').get(lateTake) as { n: number }).n).toBe(1);
  });

  it('the owner reopens the day and accepts it: the phone shows “accepted” and Jijo holds the 3', async () => {
    const res = await push([mk('op.void', { targetId: closing, reason: 'Reopened to accept a late take' }), mk('op.resolve', { targetId: lateTake, decision: 'accept', reason: '' })]);
    expect(res.results.map((r) => r.status)).toEqual(['applied', 'applied']);
    await store.syncNow();
    expect(rec(lateTake)).toMatchObject({ review: 'accepted' });
    expect(snap().ledger.getOp(lateTake)).toMatchObject({ status: 'applied', review: 'accepted' });
    expect(snap().sync).toMatchObject({ held: 0, rejected: 0 });
    // Reopened: the 5 come back to Jijo plus the 3 accepted = 8.
    expect(holding()).toBe(8);
  });

  it('a late record the owner rejects shows the reason and needs Jijo’s attention', async () => {
    // Jijo closes the reopened day properly: all 8 sold.
    const close = await store.submit('worker.settle', { ...day(), currency: 'KMF', lines: [{ garmentTypeId: 'gt-haf', held: 8, sold: 8, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 }], cash: 8000, mobile: 0, expenses: [], note: '' });
    expect(close.ok).toBe(true);
    await store.syncNow();
    // His phone was then offline when he wrongly recorded 2 more for the closed day: the phone knows it is
    // closed and refuses at once (nothing saved), so there is nothing late to decide.
    setOnline(false);
    const refused = await store.submit('worker.issue', { ...day(), lines: [{ garmentTypeId: 'gt-haf', qty: 2 }] });
    expect(refused.ok).toBe(false);
    setOnline(true);
    // A late record the owner rejects (a take saved by the owner's own offline laptop for Jijo, arriving after the closing).
    const late = mk('worker.issue', { ...day(), lines: [{ garmentTypeId: 'gt-haf', qty: 2 }] });
    expect((await push([late])).results[0]).toMatchObject({ status: 'rejected', review: 'waiting' });
    expect((await push([mk('op.resolve', { targetId: late.id, decision: 'reject', reason: 'Never left the shelf' })])).results[0]!.status).toBe('applied');
    await store.syncNow();
    // Jijo is the subject: his phone receives the late record and the decision.
    expect(rec(late.id)).toMatchObject({ review: 'rejected' });
    const decision = [...snap().records.values()].find((r) => r.op.type === 'op.resolve' && r.op.payload.targetId === late.id);
    expect(decision?.op.payload).toMatchObject({ decision: 'reject', reason: 'Never left the shelf' });
    expect(holding()).toBe(0);
  });

  it('after a reload the phone still knows every decision (kept on the device)', async () => {
    store.lock();
    await vi.waitFor(() => expect(snap().phase).toBe('welcome'));
    vi.resetModules();
    ({ store } = await import('../src/client/lib/store'));
    await store.boot();
    expect(await store.unlock(snap().profiles.find((p) => !p.demo)!, '4826')).toBeNull();
    expect(rec(lateTake)).toMatchObject({ review: 'accepted' });
    expect(snap().ledger.getOp(lateTake)).toMatchObject({ status: 'applied', review: 'accepted' });
    expect(holding()).toBe(0);
  });
});
