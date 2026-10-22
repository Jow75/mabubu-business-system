import { describe, expect, it } from 'vitest';
import { Ledger } from '../src/shared/ledger';
import { purchaseBalances, vendorAccounts, vendorBalances } from '../src/shared/queries';
import { IDS, USERS, ok, op, seeded } from './helpers';
import type { AnyOp } from '../src/shared/ops';

const { msa, yasmin, hafsa, yasminPlain80: YAS, yasminLong150: LONG } = IDS;

/** Mama Yasmin, collect later: KES 47,000 with a KES 30,000 deposit → KES 17,000 owed (as in the demo). */
function yasminOwes17000(L: Ledger, id = 'pur-yas', date = '2026-10-01') {
  ok(L, op('purchase.record', { id, vendorId: yasmin, locationId: msa, date, currency: 'KES', intake: 'awaiting', lines: [{ garmentTypeId: YAS, qty: 400, unitCost: 8000 }, { garmentTypeId: LONG, qty: 100, unitCost: 15000 }], note: '' }));
  ok(L, op('vendor.payment', { vendorId: yasmin, purchaseId: id, date, amount: 3_000_000, currency: 'KES', method: 'cash', reference: '', note: 'Deposit' }));
}

function agree(L: Ledger, vendorId: string) {
  // The purchase list, the vendor page and the vendor ledger postings must tell the same story.
  for (const acc of vendorAccounts(L).filter((a) => a.vendorId === vendorId)) {
    const ledgerTotal = vendorBalances(L).find((b) => b.vendorId === vendorId && b.currency === acc.currency);
    expect(acc.balance).toBe(ledgerTotal?.balance ?? 0);
    const sumOfPurchases = acc.purchases.reduce((s, p) => s + p.balance, 0);
    expect(sumOfPurchases).toBe(acc.outstanding);
    expect(sumOfPurchases - acc.credit).toBe(acc.balance);
    // Each payment is used once: what it pays plus what stays as credit is the payment.
    acc.payments.forEach((p, i) => expect(acc.uses[i]!.applied + acc.uses[i]!.credit).toBe(p.amount));
  }
}

describe('vendor payments and purchase balances (Bug A)', () => {
  it('a KES 17,000 balance with no further payment stays KES 17,000 outstanding', () => {
    const L = seeded();
    yasminOwes17000(L);
    expect(purchaseBalances(L).get('pur-yas')!.balance).toBe(1_700_000);
    agree(L, yasmin);
  });

  it('a payment recorded on the purchase clears it, and vendor and purchase agree', () => {
    const L = seeded();
    yasminOwes17000(L);
    ok(L, op('vendor.payment', { vendorId: yasmin, purchaseId: 'pur-yas', date: '2026-10-18', amount: 1_700_000, currency: 'KES', method: 'mpesa', reference: 'UPKUIJ', note: '' }));
    const b = purchaseBalances(L).get('pur-yas')!;
    expect(b.balance).toBe(0);
    expect(b.paid).toBe(4_700_000);
    agree(L, yasmin);
  });

  it('a payment recorded on the vendor page (no purchase chosen) also clears the purchase — the exact case reported', () => {
    const L = seeded();
    yasminOwes17000(L);
    const pay = op('vendor.payment', { vendorId: yasmin, purchaseId: null, date: '2026-10-18', amount: 1_700_000, currency: 'KES', method: 'mpesa', reference: 'UPKUIJ', note: '' });
    ok(L, pay);
    const b = purchaseBalances(L).get('pur-yas')!;
    expect(b.balance).toBe(0);
    // The M-Pesa code stays on the payment that actually covered the purchase.
    const covering = b.allocations.find((a) => !a.linked)!;
    expect(covering).toMatchObject({ opId: pay.id, amount: 1_700_000, reference: 'UPKUIJ', method: 'mpesa' });
    const acc = vendorAccounts(L).find((a) => a.vendorId === yasmin)!;
    expect(acc.balance).toBe(0);
    expect(acc.credit).toBe(0);
    expect(acc.payments.find((p) => p.opId === pay.id)?.reference).toBe('UPKUIJ');
    agree(L, yasmin);
  });

  it('applies vendor-page payments to the oldest unpaid purchase first and keeps any excess as credit', () => {
    const L = seeded();
    ok(L, op('purchase.record', { id: 'pur-old', vendorId: yasmin, locationId: msa, date: '2026-10-01', currency: 'KES', intake: 'collected', lines: [{ garmentTypeId: YAS, qty: 10, unitCost: 10000 }], note: '' }));
    ok(L, op('purchase.record', { id: 'pur-new', vendorId: yasmin, locationId: msa, date: '2026-10-05', currency: 'KES', intake: 'collected', lines: [{ garmentTypeId: YAS, qty: 10, unitCost: 10000 }], note: '' }));
    ok(L, op('vendor.payment', { vendorId: yasmin, purchaseId: null, date: '2026-10-06', amount: 150_000, currency: 'KES', method: 'cash', reference: '', note: '' }));
    let pb = purchaseBalances(L);
    expect(pb.get('pur-old')!.balance).toBe(0);
    expect(pb.get('pur-new')!.balance).toBe(50_000);
    agree(L, yasmin);
    ok(L, op('vendor.payment', { vendorId: yasmin, purchaseId: null, date: '2026-10-07', amount: 80_000, currency: 'KES', method: 'cash', reference: '', note: '' }));
    pb = purchaseBalances(L);
    expect(pb.get('pur-new')!.balance).toBe(0);
    const acc = vendorAccounts(L).find((a) => a.vendorId === yasmin)!;
    expect(acc.credit).toBe(30_000);
    expect(acc.balance).toBe(-30_000); // the vendor holds KES 300 of our credit
    agree(L, yasmin);
  });

  it('never applies a payment in one currency to a purchase in another', () => {
    const L = seeded();
    yasminOwes17000(L);
    ok(L, op('vendor.payment', { vendorId: yasmin, purchaseId: null, date: '2026-10-18', amount: 13_000, currency: 'USD', method: 'bank', reference: '', note: '' }));
    expect(purchaseBalances(L).get('pur-yas')!.balance).toBe(1_700_000);
    const usd = vendorAccounts(L).find((a) => a.vendorId === yasmin && a.currency === 'USD')!;
    expect(usd.credit).toBe(13_000);
    agree(L, yasmin);
  });

  it('cancelling the payment brings the balance back, with the cancelled payment kept in history', () => {
    const L = seeded();
    yasminOwes17000(L);
    const pay = op('vendor.payment', { vendorId: yasmin, purchaseId: null, date: '2026-10-18', amount: 1_700_000, currency: 'KES', method: 'mpesa', reference: 'UPKUIJ', note: '' });
    ok(L, pay);
    ok(L, op('op.void', { targetId: pay.id, reason: 'Entered twice' }));
    expect(purchaseBalances(L).get('pur-yas')!.balance).toBe(1_700_000);
    expect(L.getOp(pay.id)?.voidedBy).toBeTruthy();
    agree(L, yasmin);
  });

  it('reopening the app (rebuilding from the saved records) gives the same balances', () => {
    const L = seeded();
    const before = L.order.length;
    yasminOwes17000(L);
    ok(L, op('vendor.payment', { vendorId: yasmin, purchaseId: null, date: '2026-10-18', amount: 1_700_000, currency: 'KES', method: 'mpesa', reference: 'UPKUIJ', note: '' }));
    const saved: AnyOp[] = L.order.map((id) => L.getOp(id)!.op);
    const R = new Ledger();
    R.setUsers(Object.values(USERS));
    for (const o of saved) expect(R.apply(o, null).ok).toBe(true);
    expect(L.order.length).toBeGreaterThan(before);
    expect(purchaseBalances(R).get('pur-yas')!.balance).toBe(0);
    expect(vendorAccounts(R)).toEqual(vendorAccounts(L));
  });

  it('a payment made before inspection waits as credit, then covers the accepted pieces', () => {
    const L = seeded();
    ok(L, op('purchase.record', { id: 'pur-insp', vendorId: hafsa, locationId: msa, date: '2026-10-01', currency: 'KES', intake: 'inspection', lines: [{ garmentTypeId: IDS.hafsaElastic80, qty: 10, unitCost: 10000 }], note: '' }));
    ok(L, op('vendor.payment', { vendorId: hafsa, purchaseId: null, date: '2026-10-01', amount: 50_000, currency: 'KES', method: 'cash', reference: '', note: '' }));
    expect(vendorAccounts(L).find((a) => a.vendorId === hafsa)!.credit).toBe(50_000);
    ok(L, op('purchase.inspect', { purchaseId: 'pur-insp', date: '2026-10-02', lines: [{ garmentTypeId: IDS.hafsaElastic80, accepted: 6, rejected: 4, reason: '' }], note: '' }));
    const b = purchaseBalances(L).get('pur-insp')!;
    expect(b.payable).toBe(60_000);
    expect(b.balance).toBe(10_000);
    agree(L, hafsa);
  });
});
