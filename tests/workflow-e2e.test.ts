// End-to-end worker day through the real store (demo mode, no network):
// take → return → close, then the closed-day restriction and a manager reopen.
// Expected numbers are reasoned by hand, not read back from the engine.

import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DEMO_USERS } from '../src/shared/demo-data';
import { stockByLocation } from '../src/shared/queries';
import { dayTotals, selectDays } from '../src/shared/reports';
import { businessDate } from '../src/shared/time';

type StoreModule = typeof import('../src/client/lib/store');
let store: StoreModule['store'];

beforeAll(async () => {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
  const events = { addEventListener: () => {}, removeEventListener: () => {} };
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', { ...events, visibilityState: 'visible' });
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('offline in tests');
  });
  ({ store } = await import('../src/client/lib/store'));
  await store.boot();
});

const GT = 'gt-yas-pl80'; // Plain dera, retail KMF 1000 at Comoros
const LOC = 'loc-com';
const WORKER = 'demo-said';
const soldNow = () => stockByLocation(store.getSnapshot().ledger).get(LOC)?.get(GT)?.sold ?? 0;
const salesNow = (today: string) =>
  dayTotals(selectDays(store.getSnapshot().ledger, { from: today, to: today, workerId: null, locationId: null, review: 'all' })).find((t) => t.currency === 'KMF')?.sales ?? 0;

describe('worker day end to end (take, return, close, closed-day block, reopen)', () => {
  it('reconciles sold against take minus return, blocks a closed day, then reopens on void', async () => {
    const owner = DEMO_USERS.find((u) => u.id === 'demo-owner')!;
    await store.openDemo(owner);
    const today = businessDate();
    const soldBefore = soldNow();
    const salesBefore = salesNow(today);

    // Take 10, return 2 → the worker holds 8.
    expect((await store.submit('worker.issue', { workerId: WORKER, locationId: LOC, workDate: today, lines: [{ garmentTypeId: GT, qty: 10 }] })).ok).toBe(true);
    expect((await store.submit('worker.return', { workerId: WORKER, locationId: LOC, workDate: today, lines: [{ garmentTypeId: GT, qty: 2 }] })).ok).toBe(true);

    // Close: of the 8 held, 6 sold (retail), 1 carried to tomorrow, 1 lost. 6+1+1 = 8.
    const settle = await store.submit('worker.settle', {
      workerId: WORKER,
      locationId: LOC,
      workDate: today,
      currency: 'KMF',
      lines: [{ garmentTypeId: GT, held: 8, sold: 6, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 1, lost: 1 }],
      cash: 6000, // 6 × KMF 1000, no wholesale, so the cash matches exactly
      mobile: 0,
      expenses: [],
      note: '',
    });
    expect(settle.ok).toBe(true);

    // Only the 6 sold count as sold (not the 10 taken, not the 8 held); cash = 6 × 1000.
    expect(soldNow()).toBe(soldBefore + 6);
    expect(salesNow(today)).toBe(salesBefore + 6000);

    // Closed day: a further take for the same worker/day is refused by the rules.
    const blocked = await store.submit('worker.issue', { workerId: WORKER, locationId: LOC, workDate: today, lines: [{ garmentTypeId: GT, qty: 3 }] });
    expect(blocked.ok).toBe(false);

    // Manager reopens by voiding the closing: sales reverse and the day reopens.
    const settleId = settle.ok ? settle.op.id : '';
    expect((await store.submit('op.void', { targetId: settleId, reason: 'manager reopened to fix the count' })).ok).toBe(true);
    expect(soldNow()).toBe(soldBefore); // the 6 sales are reversed
    expect(salesNow(today)).toBe(salesBefore);

    // With the day reopened, a take is allowed again.
    expect((await store.submit('worker.issue', { workerId: WORKER, locationId: LOC, workDate: today, lines: [{ garmentTypeId: GT, qty: 3 }] })).ok).toBe(true);

    await store.resetDemo();
  });
});
