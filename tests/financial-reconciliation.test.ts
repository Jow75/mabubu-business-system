// One business month reconciled end to end against figures worked out by hand
// (in the comments), never read back from the code under test: purchases with
// partial inspection, an overpayment, a shipment cost, a business expense, a
// worker day with retail + wholesale + kept + lost + a cash shortfall, a closed
// day that is later voided, and conversion at a recorded rate.
// The rates and prices here are test examples, not real business figures.

import { describe, expect, it } from 'vitest';
import { A } from '../src/shared/model';
import { profitReport, stockByLocation, vendorAccounts, workerHolding } from '../src/shared/queries';
import { IDS, actor, ok, op, seeded } from './helpers';

const { msa, com, hafsa, yasmin, hafsaElastic80: HAF, yasminPlain80: YAS } = IDS;

function month() {
  const L = seeded(); // Comoros price list for HAF and YAS: retail KMF 1,000, wholesale KMF 850
  // Hafsa: 100 × KSh 80.00, collected.                         payable KSh 8,000.00
  ok(L, op('purchase.record', { id: 'pur-h', vendorId: hafsa, locationId: msa, date: '2026-10-02', currency: 'KES', intake: 'collected', lines: [{ garmentTypeId: HAF, qty: 100, unitCost: 8000 }], note: '' }));
  // Yasmin: 50 × KSh 90.00 delivered for inspection; 40 accepted, 10 rejected. payable 40 × 90 = KSh 3,600.00
  ok(L, op('purchase.record', { id: 'pur-y', vendorId: yasmin, locationId: msa, date: '2026-10-02', currency: 'KES', intake: 'inspection', lines: [{ garmentTypeId: YAS, qty: 50, unitCost: 9000 }], note: '' }));
  ok(L, op('purchase.inspect', { purchaseId: 'pur-y', date: '2026-10-03', lines: [{ garmentTypeId: YAS, accepted: 40, rejected: 10, reason: 'stains' }], note: '' }));
  // Overpay Hafsa: KSh 9,000.00 against KSh 8,000.00 owed → KSh 1,000.00 credit.
  ok(L, op('vendor.payment', { vendorId: hafsa, purchaseId: 'pur-h', date: '2026-10-03', amount: 900_000, currency: 'KES', method: 'mpesa', reference: 'TEST01', note: '' }));
  // Ship all 100 HAF and 40 YAS to Comoros; bus fare KSh 300.00.
  ok(L, op('shipment.dispatch', { id: 'shp-1', code: 'SHP-1', fromLocationId: msa, toLocationId: com, method: 'air', carrier: '', packages: [], lines: [{ garmentTypeId: HAF, qty: 100 }, { garmentTypeId: YAS, qty: 40 }], date: '2026-10-04', expectedDate: null, note: '' }));
  ok(L, op('shipment.receive', { shipmentId: 'shp-1', date: '2026-10-06', lines: [{ garmentTypeId: HAF, received: 100, missing: 0 }, { garmentTypeId: YAS, received: 40, missing: 0 }], note: '' }));
  ok(L, op('shipment.cost', { shipmentId: 'shp-1', category: 'bus_fare', description: '', amount: 30_000, currency: 'KES', status: 'actual', date: '2026-10-04', reference: '', supersedesId: null }));
  // Business expense KSh 50.00.
  ok(L, op('expense.record', { locationId: msa, date: '2026-10-05', category: 'packaging', description: 'Sacks', amount: 5_000, currency: 'KES', shipmentId: null }));

  // Amina, 17 Oct: take 20 HAF + 10 YAS, return 2 HAF → holds 18 HAF, 10 YAS.
  ok(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', lines: [{ garmentTypeId: HAF, qty: 20 }, { garmentTypeId: YAS, qty: 10 }] }, 'amina'), 'amina');
  ok(L, op('worker.return', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', lines: [{ garmentTypeId: HAF, qty: 2 }] }, 'amina'), 'amina');
  // Close: HAF 18 = 15 sold (10 retail, 5 wholesale) + 2 kept + 1 lost; YAS 10 sold retail.
  // Sales: 10×1,000 + 5×850 + 10×1,000 = KMF 24,250. Spent from sales KMF 500.
  // Handed over KMF 23,500 → short by 24,250 − 500 − 23,500 = KMF 250.
  ok(
    L,
    op(
      'worker.settle',
      {
        workerId: 'u-amina',
        locationId: com,
        workDate: '2026-10-17',
        currency: 'KMF',
        lines: [
          { garmentTypeId: HAF, held: 18, sold: 15, wholesaleQty: 5, retailPrice: 1000, wholesalePrice: 850, carried: 2, lost: 1 },
          { garmentTypeId: YAS, held: 10, sold: 10, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 },
        ],
        cash: 23_500,
        mobile: 0,
        expenses: [{ description: 'Transport', amount: 500 }],
        note: 'Short by 250',
      },
      'amina',
    ),
    'amina',
  );
  // Said, 18 Oct: take 5 HAF, close as all sold, then a manager voids the closing.
  ok(L, op('worker.issue', { workerId: 'u-said', locationId: com, workDate: '2026-10-18', lines: [{ garmentTypeId: HAF, qty: 5 }] }, 'said'), 'said');
  const saidClose = op('worker.settle', { workerId: 'u-said', locationId: com, workDate: '2026-10-18', currency: 'KMF', lines: [{ garmentTypeId: HAF, held: 5, sold: 5, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 }], cash: 5_000, mobile: 0, expenses: [], note: '' }, 'said');
  ok(L, saidClose, 'said');
  ok(L, op('op.void', { targetId: saidClose.id, reason: 'count was wrong' }, 'manager'), 'manager');
  return L;
}

describe('a month reconciled against hand-worked figures', () => {
  it('vendor balances: accepted pieces only, and an overpayment becomes credit', () => {
    const L = month();
    const accts = vendorAccounts(L);
    const h = accts.find((a) => a.vendorId === hafsa)!;
    const y = accts.find((a) => a.vendorId === yasmin)!;
    // The KSh 1,000 excess shows as credit on the vendor (negative balance) and as
    // an overpaid purchase. `unallocated` is only for payments not tied to a
    // purchase (ADR-002); rolling a linked overpayment onto other purchases is
    // the open "move a payment" item, not built.
    expect([h.payable, h.paid, h.balance, h.unallocated]).toEqual([800_000, 900_000, -100_000, 0]);
    expect(h.purchases.find((p) => p.purchaseId === 'pur-h')!.balance).toBe(-100_000);
    expect([y.payable, y.paid, y.balance]).toEqual([360_000, 0, 360_000]);
  });

  it('stock is conserved piece by piece', () => {
    const L = month();
    const haf = stockByLocation(L).get(com)!.get(HAF)!;
    // 100 received − 20 taken + 2 returned − 5 taken by Said = 77 on the shelf.
    expect(haf.avail).toBe(77);
    // With workers: Amina kept 2; Said holds 5 again because his closing was voided.
    expect(haf.withWorkers).toBe(7);
    expect(workerHolding(L, 'u-amina').get(HAF)).toBe(2);
    expect(workerHolding(L, 'u-said').get(HAF)).toBe(5);
    // Sold 15 (Said's 5 reversed). 77 + 7 + 15 + 1 lost (written off to adjustments) = 100.
    expect(haf.sold).toBe(15);
    expect(L.balance(A.adj(com), HAF)).toBe(1);
    expect(haf.avail + haf.withWorkers + haf.sold + L.balance(A.adj(com), HAF)).toBe(100);
    // Yasmin: 40 accepted all went to Comoros; 10 rejected stay at Mombasa against the purchase.
    expect(stockByLocation(L).get(com)!.get(YAS)!.sold).toBe(10);
    expect(L.balance(A.rejected(msa, 'pur-y'), YAS)).toBe(10);
  });

  it('without a recorded KES→KMF rate the profit is marked incomplete, never computed with a guess', () => {
    const r = profitReport(month(), '2026-10-01', '2026-10-31', 'KMF');
    expect(r.complete).toBe(false);
    expect(r.missingRates.length).toBeGreaterThan(0);
    expect(r.salesValue).toBe(24_250); // KMF sales need no rate
  });

  it('profit in KMF at a recorded rate of 1 KES = 3.5 KMF', () => {
    const L = month();
    ok(L, op('fx.set', { id: 'fx-test', from: 'KES', to: 'KMF', rate: '3.5', date: '2026-10-01', source: 'test example' }));
    const r = profitReport(L, '2026-10-01', '2026-10-31', 'KMF');
    expect(r.complete).toBe(true);
    expect(r.counts.closedDays).toBe(1); // Said's voided day does not count
    expect(r.piecesSold).toBe(25);
    expect(r.salesValue).toBe(24_250);
    // HAF unit cost KSh 80 × 3.5 = KMF 280; YAS KSh 90 × 3.5 = KMF 315 (accepted pieces only).
    expect(r.costOfGoods).toBe(15 * 280 + 10 * 315); // 7,350
    expect(r.grossMargin).toBe(24_250 - 7_350); // 16,900
    expect(r.cashDifference).toBe(250);
    expect(r.workerExpenses).toBe(500);
    expect(r.shipmentCosts).toBe(1_050); // KSh 300 × 3.5
    expect(r.expenses).toBe(175); // KSh 50 × 3.5
    expect(r.periodNet).toBe(16_900 - 250 - 500 - 1_050 - 175); // 14,925
    // Original amounts are kept in the currency they were paid in.
    expect(r.original.shipmentCosts).toEqual({ KES: 30_000 });
    expect(r.original.expenses).toEqual({ KES: 5_000 });
    expect(r.original.costOfGoods).toEqual({ KES: 15 * 8_000 + 10 * 9_000 });
  });

  it('rounds once per garment, to the nearest franc, at a rate with decimals (1 KES = 3.47 KMF)', () => {
    const L = month();
    ok(L, op('fx.set', { id: 'fx-test', from: 'KES', to: 'KMF', rate: '3.47', date: '2026-10-01', source: 'test example' }));
    const r = profitReport(L, '2026-10-01', '2026-10-31', 'KMF');
    // HAF: 15 × 80 × 3.47 = 4,164 exactly; YAS: 10 × 90 × 3.47 = 3,123 exactly.
    expect(r.costOfGoods).toBe(4_164 + 3_123);
    // Shipment: 300 × 3.47 = 1,041; expense: 50 × 3.47 = 173.5 → 174 (nearest franc).
    expect(r.shipmentCosts).toBe(1_041);
    expect(r.expenses).toBe(174);
  });

  it('the same month reported in KES converts sales back through the recorded rate', () => {
    const L = month();
    ok(L, op('fx.set', { id: 'fx-test', from: 'KES', to: 'KMF', rate: '3.5', date: '2026-10-01', source: 'test example' }));
    const r = profitReport(L, '2026-10-01', '2026-10-31', 'KES');
    // KMF 24,250 ÷ 3.5 = KSh 6,928.571… → 692,857 cents.
    expect(r.salesValue).toBe(692_857);
    // Costs already in KES are not converted at all.
    expect(r.costOfGoods).toBe(15 * 8_000 + 10 * 9_000);
    expect(r.shipmentCosts).toBe(30_000);
  });

  it('a period with no closed days reports zeros, not errors', () => {
    const r = profitReport(month(), '2026-09-01', '2026-09-30', 'KMF');
    expect([r.piecesSold, r.salesValue, r.costOfGoods, r.counts.closedDays]).toEqual([0, 0, 0, 0]);
  });
});

describe('out-of-order arrival (documented behaviour, owner decision pending)', () => {
  it('a take recorded before a close but arriving after it is refused and changes nothing', () => {
    const L = month();
    const before = stockByLocation(L).get(com)!.get(HAF)!.avail;
    // Amina took 3 more on the 17th while offline; her phone only synced after the day was closed.
    const late = op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', lines: [{ garmentTypeId: HAF, qty: 3 }] }, 'amina');
    const res = L.apply(late, actor('amina'));
    expect(res.ok).toBe(false);
    expect(res.ok ? '' : res.error).toMatch(/closed/i);
    expect(stockByLocation(L).get(com)!.get(HAF)!.avail).toBe(before);
  });

  it('replaying the same records again gives the same totals (idempotent rebuild)', () => {
    const a = profitReport(month(), '2026-10-01', '2026-10-31', 'KMF');
    const b = profitReport(month(), '2026-10-01', '2026-10-31', 'KMF');
    expect(b).toEqual(a);
  });
});
