// Vendor credit and payment allocation (ADR-002 §5). Every expected figure is
// worked out by hand in the comments, never read back from the code under test.
// Amounts are minor units: KSh 5,000.00 = 500_000. Test examples, not real figures.

import { describe, expect, it } from 'vitest';
import { Ledger } from '../src/shared/ledger';
import { previewAccount, profitReport, purchaseBalances, vendorAccounts, vendorBalances, type VendorAccount } from '../src/shared/queries';
import { K, type PaymentSplit } from '../src/shared/model';
import { USERS, IDS, fails, ok, op, seeded } from './helpers';
import type { AnyOp } from '../src/shared/ops';

const { msa, hafsa, yasmin, hafsaElastic80: HAF, yasminPlain80: YAS } = IDS;

/** A collected purchase from Hafsa worth `total` (one line). */
function buy(L: Ledger, id: string, total: number, date = '2026-10-01', vendorId = hafsa, currency: 'KES' | 'USD' = 'KES') {
  const o = op('purchase.record', { id, vendorId, locationId: msa, date, currency, intake: 'collected', lines: [{ garmentTypeId: vendorId === hafsa ? HAF : YAS, qty: 1, unitCost: total }], note: '' });
  ok(L, o);
  return o;
}
function pay(L: Ledger, amount: number, purchaseId: string | null, reference = 'MPESA1', date = '2026-10-02', vendorId = hafsa, currency: 'KES' | 'USD' = 'KES') {
  const o = op('vendor.payment', { vendorId, purchaseId, date, amount, currency, method: 'mpesa', reference, note: '' });
  ok(L, o);
  return o;
}
const split = (paymentId: string, basedOn: string | null, allocations: { purchaseId: string; amount: number }[], who: 'owner' | 'manager' | 'amina' = 'owner') =>
  op('payment.allocate', { paymentId, basedOn, allocations, note: '' }, who);
const hafsaKes = (L: Ledger) => vendorAccounts(L).find((a) => a.vendorId === hafsa && a.currency === 'KES')!;
const owes = (L: Ledger, id: string) => purchaseBalances(L).get(id)!.balance;
const useOf = (a: VendorAccount, opId: string) => a.uses[a.payments.findIndex((p) => p.opId === opId)]!;

/** The books always agree with themselves (checked after every scenario). */
function consistent(L: Ledger) {
  for (const a of vendorAccounts(L)) {
    expect(a.outstanding - a.credit).toBe(a.balance);
    expect(a.balance).toBe(vendorBalances(L).find((b) => b.vendorId === a.vendorId && b.currency === a.currency)?.balance ?? 0);
    expect(a.credit).toBeGreaterThanOrEqual(0);
    for (const pb of a.purchases) expect(pb.balance).toBeGreaterThanOrEqual(0);
    a.payments.forEach((p, i) => expect(a.uses[i]!.applied + a.uses[i]!.credit).toBe(p.amount));
  }
}

describe('the owner’s example: KSh 10,000 paid on a KSh 5,000 purchase', () => {
  function example() {
    const L = seeded();
    buy(L, 'pur-A', 500_000); // Purchase A: KSh 5,000 outstanding
    const p = pay(L, 1_000_000, 'pur-A', 'QX10K'); // KSh 10,000, M-Pesa QX10K, recorded for A
    return { L, p };
  }

  it('A is paid in full, KSh 5,000 is visible credit, and the payment is recorded once at KSh 10,000', () => {
    const { L, p } = example();
    const a = hafsaKes(L);
    expect(owes(L, 'pur-A')).toBe(0);
    expect(a.credit).toBe(500_000);
    expect(a.paid).toBe(1_000_000);
    expect(a.payments).toHaveLength(1);
    expect(useOf(a, p.id)).toMatchObject({ how: 'named', applied: 500_000, credit: 500_000, lines: [{ purchaseId: 'pur-A', amount: 500_000 }] });
    consistent(L);
  });

  it('then KSh 3,000 of the credit pays purchase B: A 0, B 0, credit KSh 2,000, the cash payment still exactly KSh 10,000', () => {
    const { L, p } = example();
    buy(L, 'pur-B', 300_000, '2026-10-03'); // Purchase B: KSh 3,000
    expect(owes(L, 'pur-B')).toBe(300_000); // a named payment's extra never flows to B by itself
    const s = split(p.id, null, [
      { purchaseId: 'pur-A', amount: 500_000 },
      { purchaseId: 'pur-B', amount: 300_000 },
    ]);
    ok(L, s);
    const a = hafsaKes(L);
    expect([owes(L, 'pur-A'), owes(L, 'pur-B'), a.credit, a.paid]).toEqual([0, 0, 200_000, 1_000_000]);
    // The payment record is untouched: one record, same amount and M-Pesa code.
    expect(L.getOp(p.id)!.op.payload).toMatchObject({ amount: 1_000_000, reference: 'QX10K', purchaseId: 'pur-A' });
    expect(L.postings.filter((x) => x.kind === 'payment')).toHaveLength(1);
    expect(useOf(a, p.id)).toMatchObject({ how: 'allocated', splitOpId: s.id, credit: 200_000 });
    consistent(L);
  });
});

describe('payment entry', () => {
  it('an exact payment clears its purchase and leaves no credit', () => {
    const L = seeded();
    buy(L, 'pur-A', 500_000);
    pay(L, 500_000, 'pur-A');
    expect([owes(L, 'pur-A'), hafsaKes(L).credit]).toEqual([0, 0]);
    consistent(L);
  });

  it('a partial payment leaves the rest owed and no credit', () => {
    const L = seeded();
    buy(L, 'pur-A', 500_000);
    pay(L, 200_000, 'pur-A');
    expect([owes(L, 'pur-A'), hafsaKes(L).credit]).toEqual([300_000, 0]);
    consistent(L);
  });

  it('without a purchase chosen, the oldest unpaid purchases are paid first (the agreed default)', () => {
    const L = seeded();
    buy(L, 'pur-A', 500_000, '2026-10-01');
    buy(L, 'pur-B', 300_000, '2026-10-02');
    pay(L, 600_000, null);
    // A 5,000 fully, then 1,000 onto B → B owes 2,000.
    expect([owes(L, 'pur-A'), owes(L, 'pur-B'), hafsaKes(L).credit]).toEqual([0, 200_000, 0]);
    consistent(L);
  });

  it('“keep it as credit”: held while purchases are unpaid, and never applied by itself to a later purchase', () => {
    const L = seeded();
    buy(L, 'pur-A', 500_000);
    const p = pay(L, 400_000, null);
    ok(L, split(p.id, null, []));
    expect([owes(L, 'pur-A'), hafsaKes(L).credit]).toEqual([500_000, 400_000]);
    buy(L, 'pur-C', 100_000, '2026-10-09');
    expect([owes(L, 'pur-C'), hafsaKes(L).credit]).toEqual([100_000, 400_000]);
    consistent(L);
  });

  it('the preview shown before saving is what the books show after saving', () => {
    const L = seeded();
    buy(L, 'pur-A', 500_000, '2026-10-01');
    buy(L, 'pur-B', 300_000, '2026-10-02');
    const draft = { opId: '~draft', vendorId: hafsa, purchaseId: 'pur-A', date: '2026-10-05', amount: 1_000_000, currency: 'KES' as const, method: 'mpesa' as const, reference: 'PRV1', note: '', pending: true };
    const before = previewAccount(L, hafsa, 'KES', { payment: draft })!;
    const p = pay(L, 1_000_000, 'pur-A', 'PRV1', '2026-10-05');
    const after = hafsaKes(L);
    expect({ ...useOf(before, '~draft'), opId: p.id }).toEqual(useOf(after, p.id));
    expect(before.purchases).toEqual(after.purchases.map((pb) => ({ ...pb, allocations: pb.allocations.map((x) => ({ ...x, opId: x.opId === p.id ? '~draft' : x.opId })) })));
  });
});

describe('allocating and re-allocating', () => {
  function withCredit() {
    const L = seeded();
    buy(L, 'pur-A', 500_000, '2026-10-01');
    const p = pay(L, 1_000_000, 'pur-A', 'QX1'); // credit 5,000
    buy(L, 'pur-B', 300_000, '2026-10-03');
    buy(L, 'pur-C', 100_000, '2026-10-04');
    return { L, p };
  }

  it('one allocation can pay several purchases', () => {
    const { L, p } = withCredit();
    ok(L, split(p.id, null, [{ purchaseId: 'pur-A', amount: 500_000 }, { purchaseId: 'pur-B', amount: 300_000 }, { purchaseId: 'pur-C', amount: 100_000 }]));
    expect([owes(L, 'pur-A'), owes(L, 'pur-B'), owes(L, 'pur-C'), hafsaKes(L).credit]).toEqual([0, 0, 0, 100_000]);
    consistent(L);
  });

  it('credit can pay a purchase recorded after the payment', () => {
    const { L, p } = withCredit();
    buy(L, 'pur-D', 450_000, '2026-10-20');
    ok(L, split(p.id, null, [{ purchaseId: 'pur-A', amount: 500_000 }, { purchaseId: 'pur-D', amount: 450_000 }]));
    expect([owes(L, 'pur-D'), hafsaKes(L).credit]).toEqual([0, 50_000]);
    consistent(L);
  });

  it('an existing payment is re-allocated without cancelling it; history keeps every split', () => {
    const { L, p } = withCredit();
    const first = split(p.id, null, [{ purchaseId: 'pur-A', amount: 500_000 }, { purchaseId: 'pur-B', amount: 300_000 }]);
    ok(L, first);
    // Correction: B was meant to be paid from another payment; put KSh 1,000 on C instead.
    const second = split(p.id, first.id, [{ purchaseId: 'pur-A', amount: 500_000 }, { purchaseId: 'pur-C', amount: 100_000 }]);
    ok(L, second);
    expect([owes(L, 'pur-A'), owes(L, 'pur-B'), owes(L, 'pur-C'), hafsaKes(L).credit]).toEqual([0, 300_000, 0, 400_000]);
    expect(L.getOp(first.id)?.status).toBe('applied'); // kept in the history
    expect((L.get(K.split(p.id)) as PaymentSplit).opId).toBe(second.id);
    expect(L.getOp(p.id)!.voidedBy).toBeNull();
    consistent(L);
  });

  it('two people changing the same payment at once: the second is told, not silently overwriting', () => {
    const { L, p } = withCredit();
    ok(L, split(p.id, null, [{ purchaseId: 'pur-A', amount: 500_000 }, { purchaseId: 'pur-B', amount: 300_000 }]));
    const stale = fails(L, split(p.id, null, [{ purchaseId: 'pur-A', amount: 500_000 }, { purchaseId: 'pur-C', amount: 100_000 }], 'manager'), 'manager');
    expect(stale).toMatchObject({ code: 'conflict', error: 'Someone changed how this payment is used. Check it again and retry.' });
    expect([owes(L, 'pur-B'), owes(L, 'pur-C'), hafsaKes(L).credit]).toEqual([0, 100_000, 200_000]);
    consistent(L);
  });

  it('a hand split comes before vendor-page payments: the automatic money moves to credit instead', () => {
    const L = seeded();
    buy(L, 'pur-A', 500_000, '2026-10-01');
    const p1 = pay(L, 800_000, null, 'P1', '2026-10-02'); // vendor page: pays A, KSh 3,000 left as credit
    buy(L, 'pur-B', 300_000, '2026-10-03'); // that credit flows to B automatically
    expect([owes(L, 'pur-B'), hafsaKes(L).credit]).toEqual([0, 0]);
    const p2 = pay(L, 300_000, null, 'P2', '2026-10-04');
    ok(L, split(p2.id, null, [{ purchaseId: 'pur-B', amount: 300_000 }])); // the owner says: P2 pays B
    const a = hafsaKes(L);
    // P2 pays B as told; P1's automatic KSh 3,000 is now credit. Still 3,000 credit in all.
    expect(useOf(a, p2.id)).toMatchObject({ how: 'allocated', applied: 300_000, credit: 0 });
    expect(useOf(a, p1.id)).toMatchObject({ how: 'auto', applied: 500_000, credit: 300_000 });
    expect([owes(L, 'pur-B'), a.credit]).toEqual([0, 300_000]);
    consistent(L);
  });

  it('the same credit is never spent twice: two phones splitting different payments onto one purchase', () => {
    const L = seeded();
    buy(L, 'pur-A', 500_000, '2026-10-01');
    buy(L, 'pur-B', 300_000, '2026-10-01');
    const p1 = pay(L, 800_000, 'pur-A', 'P1', '2026-10-02'); // A paid, KSh 3,000 credit
    const p2 = pay(L, 300_000, null, 'P2', '2026-10-03');
    const held = split(p2.id, null, []); // kept as credit: KSh 6,000 credit, B still owes 3,000
    ok(L, held);
    expect([owes(L, 'pur-B'), hafsaKes(L).credit]).toEqual([300_000, 600_000]);
    // Phone X puts P1's extra on B; phone Y, which had not seen that, puts P2 on B too.
    ok(L, split(p1.id, null, [{ purchaseId: 'pur-A', amount: 500_000 }, { purchaseId: 'pur-B', amount: 300_000 }]));
    ok(L, split(p2.id, held.id, [{ purchaseId: 'pur-B', amount: 300_000 }]));
    const a = hafsaKes(L);
    // B is paid once (by the older payment); P2's KSh 3,000 stays as credit and the unused request is shown.
    expect([owes(L, 'pur-B'), a.credit]).toEqual([0, 300_000]);
    expect(useOf(a, p2.id).unapplied).toEqual([{ purchaseId: 'pur-B', amount: 300_000 }]);
    consistent(L);
  });
});

describe('what an allocation can never do', () => {
  function base() {
    const L = seeded();
    buy(L, 'pur-A', 500_000, '2026-10-01');
    buy(L, 'pur-Y', 200_000, '2026-10-01', yasmin);
    buy(L, 'pur-U', 50_000, '2026-10-01', hafsa, 'USD');
    const p = pay(L, 1_000_000, 'pur-A');
    return { L, p };
  }

  it('move credit to another vendor', () => {
    const { L, p } = base();
    expect(fails(L, split(p.id, null, [{ purchaseId: 'pur-Y', amount: 100_000 }])).error).toBe('This purchase belongs to another vendor.');
  });
  it('cross currencies', () => {
    const { L, p } = base();
    expect(fails(L, split(p.id, null, [{ purchaseId: 'pur-U', amount: 10_000 }])).error).toBe('Pay this purchase in USD.');
  });
  it('name a purchase that does not exist, or allocate more than the payment', () => {
    const { L, p } = base();
    expect(fails(L, split(p.id, null, [{ purchaseId: 'pur-A', amount: 500_000 }, { purchaseId: 'pur-A2', amount: 1 }])).error).toBe('Purchase not found.');
    buy(L, 'pur-B', 900_000, '2026-10-05');
    expect(fails(L, split(p.id, null, [{ purchaseId: 'pur-A', amount: 500_000 }, { purchaseId: 'pur-B', amount: 600_000 }])).error).toBe('The amounts add up to more than the payment.');
  });
  it('put more on a purchase than it costs', () => {
    const { L, p } = base();
    expect(fails(L, split(p.id, null, [{ purchaseId: 'pur-A', amount: 600_000 }])).error).toBe('More than this purchase costs.');
  });
  it('allocate a cancelled payment, or be done by a worker', () => {
    const { L, p } = base();
    expect(fails(L, split(p.id, null, [], 'amina'), 'amina').code).toBe('forbidden');
    ok(L, op('op.void', { targetId: p.id, reason: 'Entered twice' }));
    expect(fails(L, split(p.id, null, [])).error).toBe('This payment was cancelled.');
  });
  it('be cancelled like a cash record (it is changed by recording a new split)', () => {
    const { L, p } = base();
    const s = split(p.id, null, [{ purchaseId: 'pur-A', amount: 500_000 }]);
    ok(L, s);
    expect(fails(L, op('op.void', { targetId: s.id, reason: 'undo' })).error).toBe('This kind of record is changed by editing, not cancelling.');
  });
});

describe('cancellations, profit and rebuilding', () => {
  it('cancelling the payment cancels what it paid; cancelling a purchase returns its share to credit', () => {
    const L = seeded();
    buy(L, 'pur-A', 500_000, '2026-10-01');
    const b = buy(L, 'pur-B', 300_000, '2026-10-02');
    const p = pay(L, 1_000_000, null, 'V1');
    ok(L, split(p.id, null, [{ purchaseId: 'pur-A', amount: 500_000 }, { purchaseId: 'pur-B', amount: 300_000 }]));
    expect(hafsaKes(L).credit).toBe(200_000);
    // Cancel purchase B (no payment was recorded for it): its KSh 3,000 goes back to credit.
    ok(L, op('op.void', { targetId: b.id, reason: 'Wrong vendor' }));
    expect(hafsaKes(L).credit).toBe(500_000);
    consistent(L);
    ok(L, op('op.void', { targetId: p.id, reason: 'Entered twice' }));
    expect([owes(L, 'pur-A'), hafsaKes(L).credit, hafsaKes(L).paid]).toEqual([500_000, 0, 0]);
    consistent(L);
  });

  it('allocations never change profit (payments are not costs; purchase cost is)', () => {
    const L = seeded();
    buy(L, 'pur-A', 500_000, '2026-10-01');
    buy(L, 'pur-B', 300_000, '2026-10-02');
    ok(L, op('fx.set', { id: 'fx-t', from: 'KES', to: 'KMF', rate: '3.5', date: '2026-10-01', source: 'test example' }));
    const p = pay(L, 1_000_000, 'pur-A');
    const before = profitReport(L, '2026-10-01', '2026-10-31', 'KMF');
    ok(L, split(p.id, null, [{ purchaseId: 'pur-A', amount: 500_000 }, { purchaseId: 'pur-B', amount: 300_000 }]));
    expect(profitReport(L, '2026-10-01', '2026-10-31', 'KMF')).toEqual(before);
  });

  it('a device rebuilding from the saved records gets the same accounts', () => {
    const L = seeded();
    const start = L.order.length;
    buy(L, 'pur-A', 500_000, '2026-10-01');
    const p = pay(L, 1_000_000, 'pur-A');
    buy(L, 'pur-B', 300_000, '2026-10-03');
    const s1 = split(p.id, null, [{ purchaseId: 'pur-A', amount: 500_000 }, { purchaseId: 'pur-B', amount: 300_000 }]);
    ok(L, s1);
    ok(L, split(p.id, s1.id, [{ purchaseId: 'pur-A', amount: 500_000 }]));
    const saved: AnyOp[] = L.order.slice(0).map((id) => L.getOp(id)!.op);
    const R = new Ledger();
    R.setUsers(Object.values(USERS));
    for (const o of saved) expect(R.apply(o, null).ok).toBe(true);
    expect(L.order.length).toBeGreaterThan(start);
    expect(vendorAccounts(R)).toEqual(vendorAccounts(L));
  });
});

describe('property: random payments and splits keep the books consistent', () => {
  // Deterministic pseudo-random sequence (no Math.random), so a failure is reproducible.
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  }
  it('outstanding − credit = balance, no purchase over-paid, no negative credit, each payment used once', () => {
    for (let trial = 0; trial < 60; trial++) {
      const r = rng(trial + 1);
      const L = seeded();
      const purchases: string[] = [];
      const cost = new Map<string, number>();
      const payments: { id: string; amount: number; split: string | null }[] = [];
      for (let step = 0; step < 14; step++) {
        const k = r();
        if (k < 0.35 || purchases.length === 0) {
          const id = `p${trial}-${step}`;
          const total = 1 + Math.floor(r() * 600_000);
          buy(L, id, total, `2026-10-${String(1 + (step % 27)).padStart(2, '0')}`);
          purchases.push(id);
          cost.set(id, total);
        } else if (k < 0.7) {
          const named = r() < 0.5 ? purchases[Math.floor(r() * purchases.length)]! : null;
          const o = pay(L, 1 + Math.floor(r() * 700_000), named, `R${trial}-${step}`, `2026-10-${String(1 + (step % 27)).padStart(2, '0')}`);
          payments.push({ id: o.id, amount: (o.payload as { amount: number }).amount, split: null });
        } else if (payments.length) {
          const p = payments[Math.floor(r() * payments.length)]!;
          const lines: { purchaseId: string; amount: number }[] = [];
          let room = p.amount;
          for (const id of purchases) {
            if (r() < 0.4 || room === 0) continue;
            const amount = Math.min(room, 1 + Math.floor(r() * cost.get(id)!));
            lines.push({ purchaseId: id, amount });
            room -= amount;
          }
          const s = split(p.id, p.split, lines);
          ok(L, s);
          p.split = s.id;
        }
        consistent(L);
      }
    }
  });
});
