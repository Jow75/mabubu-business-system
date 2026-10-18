// The app's real state store, on an in-memory IndexedDB, in demo mode (no
// server). Checks that a saved record updates every derived view at once —
// purchases, vendor balance, sales days and stock — without reloading or
// navigating away, and that the result survives reopening the app.

import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DEMO_USERS } from '../src/shared/demo-data';
import { purchaseBalances, stockByLocation, vendorAccounts } from '../src/shared/queries';
import { dayTotals, selectDays } from '../src/shared/reports';
import { businessDate } from '../src/shared/time';

type StoreModule = typeof import('../src/client/lib/store');
let store: StoreModule['store'];

beforeAll(async () => {
  // Just enough of a browser for the store to boot as the real app does.
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  const events = { addEventListener: () => {}, removeEventListener: () => {} };
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', { ...events, visibilityState: 'visible' });
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('offline in tests');
  });
  ({ store } = await import('../src/client/lib/store'));
  await store.boot();
});

const owner = DEMO_USERS[0]!;
const yasmin = () => purchaseBalances(store.getSnapshot().ledger).get('pur-yasmin-1')!;

describe('saving a record refreshes every view straight away (Bug D)', () => {
  it('a vendor-page payment updates the purchase, the vendor and the pending count in the same update', async () => {
    await store.openDemo(owner);
    expect(yasmin().balance).toBe(1_700_000);
    let notified = 0;
    const unsub = store.subscribe(() => notified++);
    const before = store.getSnapshot().version;

    const r = await store.submit('vendor.payment', { vendorId: 'ven-yasmin', purchaseId: null, date: businessDate(), amount: 1_700_000, currency: 'KES', method: 'mpesa', reference: 'UPKUIJ', note: '' });
    expect(r.ok ? 'saved' : r.error).toBe('saved');
    const snap = store.getSnapshot();
    // Right after saving — no navigation, no reload:
    expect(snap.version).toBeGreaterThan(before);
    expect(notified).toBeGreaterThan(0);
    expect(yasmin().balance).toBe(0);
    expect(vendorAccounts(snap.ledger).find((a) => a.vendorId === 'ven-yasmin')!.balance).toBe(0);
    // Saved on the device, honestly marked as not yet synced.
    expect(snap.records.get(r.ok ? r.op.id : '')?.status).toBe('pending');
    expect(snap.sync.pending).toBe(1);

    // Demo "sync" confirms it; the views keep the same numbers.
    await vi.waitFor(() => expect(store.getSnapshot().sync.pending).toBe(0), { timeout: 3000 });
    expect(store.getSnapshot().records.get(r.ok ? r.op.id : '')?.status).toBe('applied');
    expect(yasmin().balance).toBe(0);
    unsub();
  });

  it('a closed sales day shows in sales days and stock at once', async () => {
    const today = businessDate();
    const L0 = store.getSnapshot().ledger;
    const soldBefore = stockByLocation(L0).get('loc-com')?.get('gt-yas-pl80')?.sold ?? 0;
    const salesBefore = dayTotals(selectDays(L0, { from: today, to: today, workerId: null, locationId: null, review: 'all' })).find((t) => t.currency === 'KMF')?.sales ?? 0;
    const lines = [{ garmentTypeId: 'gt-yas-pl80', qty: 5 }];
    expect((await store.submit('worker.issue', { workerId: 'demo-said', locationId: 'loc-com', workDate: today, lines })).ok).toBe(true);
    const settle = await store.submit('worker.settle', {
      workerId: 'demo-said',
      locationId: 'loc-com',
      workDate: today,
      currency: 'KMF',
      lines: [{ garmentTypeId: 'gt-yas-pl80', held: 5, sold: 5, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 }],
      cash: 5000,
      mobile: 0,
      expenses: [],
      note: '',
    });
    expect(settle.ok).toBe(true);
    const L = store.getSnapshot().ledger;
    expect(stockByLocation(L).get('loc-com')!.get('gt-yas-pl80')!.sold).toBe(soldBefore + 5);
    const after = dayTotals(selectDays(L, { from: today, to: today, workerId: null, locationId: null, review: 'all' })).find((t) => t.currency === 'KMF')!.sales;
    expect(after).toBe(salesBefore + 5000);
    await vi.waitFor(() => expect(store.getSnapshot().sync.pending).toBe(0), { timeout: 3000 });
  });

  it('reopening the app does not bring the old balance back', async () => {
    store.lock();
    await vi.waitFor(() => expect(store.getSnapshot().phase).toBe('welcome'));
    await store.openDemo(owner);
    expect(yasmin().balance).toBe(0);
    const pay = [...store.getSnapshot().records.values()].filter((x) => x.op.type === 'vendor.payment' && (x.op.payload as { reference: string }).reference === 'UPKUIJ');
    expect(pay).toHaveLength(1);
  });
});
