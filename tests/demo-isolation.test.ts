// Demo mode must never touch the production sync API or the real on-device
// databases. This test drives the real store on an in-memory IndexedDB with
// fetch wired to throw: if any demo operation reached the network the test
// would fail. It also asserts that resetting the demo leaves a real user's
// database untouched.

import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DEMO_USERS } from '../src/shared/demo-data';
import { UserDb, userDbName } from '../src/client/lib/db';
import { businessDate } from '../src/shared/time';

type StoreModule = typeof import('../src/client/lib/store');
let store: StoreModule['store'];
// Any network call must blow up, so demo operations that reach it fail loudly.
const fetchSpy = vi.fn(async () => {
  throw new TypeError('demo mode must not reach the network');
});

beforeAll(async () => {
  // Offline at boot so startup itself attempts no network (it would otherwise
  // check /setup/status); demo mode never depends on connectivity anyway.
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
  const events = { addEventListener: () => {}, removeEventListener: () => {} };
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', { ...events, visibilityState: 'visible' });
  vi.stubGlobal('fetch', fetchSpy);
  ({ store } = await import('../src/client/lib/store'));
  await store.boot();
});

describe('demo isolation', () => {
  it('stays on the device: no network, and resetDemo spares the real database', async () => {
    const owner = DEMO_USERS[0]!;

    // A real user's database with one record, exactly as a signed-in account would have.
    const realName = userDbName('real-user', false); // mabubu-u-real-user
    const real = new UserDb(realName);
    await real.ops.put({
      id: 'op-real-1',
      op: { id: 'op-real-1', type: 'vendor.upsert', payload: {}, actorId: 'real-user', deviceId: 'd', deviceTime: '', tzOffsetMin: 0, createdOnline: true, v: 1 } as never,
      status: 'applied',
      seq: 1,
      serverTime: null,
      actorName: 'Real',
      clockSkewMs: 0,
      error: null,
      flags: [],
      localOrder: 1,
    });
    await real.close();

    // Open demo and record a payment; demo "sync" applies it locally only.
    await store.openDemo(owner);
    const r = await store.submit('vendor.payment', {
      vendorId: 'ven-yasmin',
      purchaseId: null,
      date: businessDate(),
      amount: 500_000,
      currency: 'KES',
      method: 'mpesa',
      reference: 'DEMOCHK',
      note: '',
    });
    expect(r.ok).toBe(true);
    await vi.waitFor(() => expect(store.getSnapshot().sync.pending).toBe(0), { timeout: 3000 });
    expect(store.getSnapshot().sync.state).toBe('demo');
    expect(store.getSnapshot().records.get(r.ok ? r.op.id : '')?.status).toBe('applied');
    expect(await new UserDb('mabubu-demo').ops.count()).toBeGreaterThan(0);

    // Reset the demo: its database is emptied…
    await store.resetDemo();
    expect(await new UserDb('mabubu-demo').ops.count()).toBe(0);
    // …but the real user's database is untouched.
    const realAfter = new UserDb(realName);
    expect(await realAfter.ops.count()).toBe(1);
    expect((await realAfter.ops.get('op-real-1'))?.actorName).toBe('Real');

    // Nothing in demo or reset ever reached the network.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
