// Unfinished purchases (drafts, owner request 27 Oct 2026): the real app store
// on an in-memory IndexedDB, in demo mode (no server). A draft keeps exactly
// what was typed across leaving the page, a refresh or a restart of the app;
// it is never a record — no stock, no balance, no activity, nothing to send —
// and drafts never overwrite each other. Saving one records one purchase.

import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DEMO_USERS } from '../src/shared/demo-data';
import { K, type Purchase } from '../src/shared/model';
import { parseMoney } from '../src/shared/money';
import { purchaseBalances, stockByLocation, vendorAccounts } from '../src/shared/queries';
import { businessDate } from '../src/shared/time';
import type { PurchaseForm } from '../src/client/screens/manage/Purchases';

type StoreModule = typeof import('../src/client/lib/store');
let store: StoreModule['store'];

beforeAll(async () => {
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
const manager = DEMO_USERS[1]!;
const ready = () => vi.waitFor(() => expect(store.getDrafts().ready).toBe(true));
const ids = () => store.getDrafts().list.map((d) => d.id).sort();

/** What the New purchase form holds after typing — amounts as the field parses them (with thousands separators). */
function typed(id: string, vendorId: string, over: Partial<PurchaseForm> = {}): PurchaseForm {
  return {
    id,
    vendorId,
    locationId: 'loc-msa',
    date: businessDate(),
    intake: 'collected',
    currency: 'KES',
    lines: [
      { garmentTypeId: 'gt-haf-en80', qty: 261, unitCost: parseMoney('KES', '80') },
      { garmentTypeId: 'gt-haf-bb60', qty: 348, unitCost: parseMoney('KES', '60') },
    ],
    note: 'Typed with separators: 20,880 + 20,880',
    payNow: parseMoney('KES', '20,880'),
    method: 'mpesa',
    reference: 'UR4UF',
    ...over,
  };
}

/** Everything a draft must never change. */
function books() {
  const s = store.getSnapshot();
  return {
    records: s.records.size,
    pending: s.sync.pending,
    purchases: s.ledger.list<Purchase>('purchase').length,
    balances: JSON.stringify([...purchaseBalances(s.ledger)].map(([k, v]) => [k, v.balance])),
    vendors: JSON.stringify(vendorAccounts(s.ledger).map((a) => [a.vendorId, a.currency, a.outstanding, a.credit])),
    stock: JSON.stringify([...stockByLocation(s.ledger)].map(([loc, m]) => [loc, [...m].map(([g, b]) => [g, b])])),
  };
}

describe('unfinished purchases are kept on the device (drafts)', () => {
  it('keeps exactly what was typed, and is not a record: no stock, balance, activity or sync', async () => {
    await store.openDemo(owner);
    await ready();
    expect(ids()).toEqual([]);
    const before = books();
    const form = typed('draft-hafsa', 'ven-hafsa');
    expect(await store.saveDraft('purchase', form.id, form)).toBe(true);
    // Read back: the same values, amounts unchanged by the separators (KSh 80 = 8,000 cents; KSh 20,880 = 2,088,000).
    const [d] = store.getDrafts().list;
    expect(d).toMatchObject({ id: 'draft-hafsa', kind: 'purchase', userId: owner.id });
    expect(d!.form).toEqual(form);
    expect((d!.form as PurchaseForm).payNow).toBe(2_088_000);
    expect((d!.form as PurchaseForm).lines.map((l) => l.unitCost)).toEqual([8000, 6000]);
    // Nothing in the books moved, nothing waits to be sent.
    expect(books()).toEqual(before);
  });

  it('comes back after leaving the page and after the app is closed and opened again (refresh, restart)', async () => {
    const form = store.getDrafts().list[0]!.form;
    // Leave and come back: another screen does not touch the device copy.
    // Close the app (lock) and open it again: read from IndexedDB, not from memory.
    store.lock();
    await vi.waitFor(() => expect(store.getSnapshot().phase).toBe('welcome'));
    expect(store.getDrafts()).toEqual({ ready: false, list: [] });
    await store.openDemo(owner);
    await ready();
    expect(ids()).toEqual(['draft-hafsa']);
    expect(store.getDrafts().list[0]!.form).toEqual(form);
  });

  it('a second unfinished purchase never overwrites the first; each changes only itself', async () => {
    const first = store.getDrafts().list[0]!;
    const second = typed('draft-yasmin', 'ven-yasmin', { lines: [{ garmentTypeId: 'gt-yas-pl80', qty: 17, unitCost: parseMoney('KES', '1,500') }], payNow: null, reference: '', note: '' });
    await store.saveDraft('purchase', second.id, second);
    expect(ids()).toEqual(['draft-hafsa', 'draft-yasmin']);
    // Typing more into the second (same id) updates it alone.
    await store.saveDraft('purchase', second.id, { ...second, note: 'one more line coming' });
    const list = store.getDrafts().list;
    expect(list.find((d) => d.id === 'draft-hafsa')).toEqual(first);
    expect((list.find((d) => d.id === 'draft-yasmin')!.form as PurchaseForm).note).toBe('one more line coming');
    // Newest first.
    expect(list[0]!.id).toBe('draft-yasmin');
    // Many quick saves (typing) end with the last one, in order.
    await Promise.all([1, 2, 3, 4, 5].map((n) => store.saveDraft('purchase', second.id, { ...second, note: `n${n}` })));
    expect((store.getDrafts().list.find((d) => d.id === 'draft-yasmin')!.form as PurchaseForm).note).toBe('n5');
  });

  it('another person on the same device does not see them, and cannot change or remove them', async () => {
    store.lock();
    await store.openDemo(manager);
    await ready();
    expect(ids()).toEqual([]);
    expect(await store.deleteDraft('draft-hafsa')).toBe(true); // nothing of theirs to remove
    await store.saveDraft('purchase', 'draft-hafsa', typed('draft-hafsa', 'ven-wanyama'));
    expect(ids()).toEqual([]); // refused: the id belongs to someone else's draft
    store.lock();
    await store.openDemo(owner);
    await ready();
    expect(ids()).toEqual(['draft-hafsa', 'draft-yasmin']);
    expect((store.getDrafts().list.find((d) => d.id === 'draft-hafsa')!.form as PurchaseForm).vendorId).toBe('ven-hafsa');
  });

  it('a write still waiting when the person locks the app goes nowhere', async () => {
    const pending = store.saveDraft('purchase', 'draft-late', typed('draft-late', 'ven-hafsa'));
    store.lock();
    expect(await pending).toBe(false);
    await store.openDemo(owner);
    await ready();
    expect(ids()).toEqual(['draft-hafsa', 'draft-yasmin']);
  });

  it('saving a draft records one purchase with the typed figures; only that draft goes', async () => {
    const d = store.getDrafts().list.find((x) => x.id === 'draft-hafsa')!.form as PurchaseForm;
    const before = vendorAccounts(store.getSnapshot().ledger).find((a) => a.vendorId === 'ven-hafsa' && a.currency === 'KES');
    const r = await store.submit('purchase.record', { id: d.id, vendorId: d.vendorId, locationId: d.locationId, date: d.date, currency: d.currency, intake: d.intake, lines: d.lines.map((l) => ({ garmentTypeId: l.garmentTypeId, qty: l.qty, unitCost: l.unitCost ?? 0 })), note: d.note });
    expect(r.ok ? 'saved' : r.error).toBe('saved');
    const pay = await store.submit('vendor.payment', { vendorId: d.vendorId, purchaseId: d.id, date: d.date, amount: d.payNow!, currency: d.currency, method: d.method, reference: d.reference, note: '' });
    expect(pay.ok).toBe(true);
    await store.deleteDraft(d.id);
    expect(ids()).toEqual(['draft-yasmin']);
    // 261 × KSh 80 + 348 × KSh 60 = 20,880 + 20,880 = KSh 41,760; paid KSh 20,880 → KSh 20,880 still owed.
    const L = store.getSnapshot().ledger;
    const p = L.get(K.purchase(d.id)) as Purchase;
    expect(p.lines.map((l) => [l.qty, l.unitCost])).toEqual([[261, 8000], [348, 6000]]);
    expect(purchaseBalances(L).get(d.id)).toMatchObject({ payable: 4_176_000, paid: 2_088_000, balance: 2_088_000 });
    const after = vendorAccounts(L).find((a) => a.vendorId === 'ven-hafsa' && a.currency === 'KES')!;
    expect(after.outstanding - (before?.outstanding ?? 0)).toBe(2_088_000);
    // The same draft saved again (another tab, a double tap) cannot make a second purchase.
    const again = await store.submit('purchase.record', { id: d.id, vendorId: d.vendorId, locationId: d.locationId, date: d.date, currency: d.currency, intake: d.intake, lines: d.lines.map((l) => ({ garmentTypeId: l.garmentTypeId, qty: l.qty, unitCost: l.unitCost ?? 0 })), note: d.note });
    expect(again.ok).toBe(false);
    expect(store.getSnapshot().ledger.list<Purchase>('purchase').filter((x) => x.id === d.id)).toHaveLength(1);
  });

  it('the sales-day forms keep one draft each per worker, day and place, beside purchases, and are never records', async () => {
    const before = books();
    const take = { 'gt-yas-pl80': 12, 'gt-haf-en80': 30 };
    const close = { lines: {}, cash: 227_400, mobile: null, expenses: [{ description: 'Taxi', amount: 350 }], note: '' };
    await store.saveDraft('take', 'take:demo-amina:2026-10-31:loc-com', take);
    await store.saveDraft('take', 'take:demo-said:2026-10-31:loc-com', { 'gt-yas-pl80': 5 });
    await store.saveDraft('close', 'close:demo-amina:2026-10-31:loc-com', close);
    const list = store.getDrafts().list;
    expect(list.filter((d) => d.kind === 'take').map((d) => d.id).sort()).toEqual(['take:demo-amina:2026-10-31:loc-com', 'take:demo-said:2026-10-31:loc-com']);
    expect(list.find((d) => d.id === 'close:demo-amina:2026-10-31:loc-com')!.form).toEqual(close);
    expect(list.some((d) => d.kind === 'purchase')).toBe(true);
    expect(books()).toEqual(before);
    // Back after the app is closed and opened again (as after a power cut).
    store.lock();
    await store.openDemo(owner);
    await ready();
    expect(store.getDrafts().list.find((d) => d.id === 'take:demo-amina:2026-10-31:loc-com')!.form).toEqual(take);
    // Saving the take removes that draft only.
    await store.deleteDraft('take:demo-amina:2026-10-31:loc-com');
    expect(store.getDrafts().list.map((d) => d.id)).toContain('take:demo-said:2026-10-31:loc-com');
    expect(store.getDrafts().list.map((d) => d.id)).toContain('close:demo-amina:2026-10-31:loc-com');
    for (const id of ['take:demo-said:2026-10-31:loc-com', 'close:demo-amina:2026-10-31:loc-com']) await store.deleteDraft(id);
  });

  it('discarding one leaves the others; a draft is never removed for being old', async () => {
    const old = typed('draft-old', 'ven-wanyama', { date: '2026-09-01' });
    await store.saveDraft('purchase', old.id, old);
    expect(ids()).toEqual(['draft-old', 'draft-yasmin']);
    store.lock();
    await store.openDemo(owner);
    await ready();
    expect(ids()).toEqual(['draft-old', 'draft-yasmin']);
    await store.deleteDraft('draft-yasmin');
    expect(ids()).toEqual(['draft-old']);
  });
});
