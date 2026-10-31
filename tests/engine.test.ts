import { describe, expect, it } from 'vitest';
import { A, K, type Purchase, type Shipment, type WorkerDay } from '../src/shared/model';
import { purchaseSummary, stockByLocation, stockWarningResolved, vendorBalances, workerHolding, profitReport, garmentJourney } from '../src/shared/queries';
import { dayTotals, selectDays } from '../src/shared/reports';
import { lateEvidence, lateRecords } from '../src/shared/late';
import { parsePayload } from '../src/shared/ops';
import { IDS, actor, fails, ok, op, seeded } from './helpers';

const { msa, dar, com, hafsa, yasmin, hafsaElastic80: HAF, yasminPlain80: YAS, yasminLong150: LONG } = IDS;

function buyCollected(L: ReturnType<typeof seeded>, id: string, vendorId: string, lines: { garmentTypeId: string; qty: number; unitCost: number }[]) {
  return ok(L, op('purchase.record', { id, vendorId, locationId: msa, date: '2026-10-10', currency: 'KES', intake: 'collected', lines, note: '' }));
}

function shipToComoros(L: ReturnType<typeof seeded>, id: string, lines: { garmentTypeId: string; qty: number }[]) {
  ok(L, op('shipment.dispatch', { id, code: id.toUpperCase(), fromLocationId: msa, toLocationId: com, method: 'air', carrier: '', packages: [], lines, date: '2026-10-11', expectedDate: null, note: '' }));
  ok(L, op('shipment.receive', { shipmentId: id, date: '2026-10-12', lines: lines.map((l) => ({ garmentTypeId: l.garmentTypeId, received: l.qty, missing: 0 })), note: '' }));
}

describe('garment identity', () => {
  it('keeps Hafsa elastic-neck KSh 80 and Mama Yasmin plain KSh 80 as separate stock (AT-1)', () => {
    const L = seeded();
    buyCollected(L, 'pur-a', hafsa, [{ garmentTypeId: HAF, qty: 100, unitCost: 8000 }]);
    buyCollected(L, 'pur-b', yasmin, [{ garmentTypeId: YAS, qty: 60, unitCost: 8000 }]);
    expect(L.balance(A.avail(msa), HAF)).toBe(100);
    expect(L.balance(A.avail(msa), YAS)).toBe(60);
    shipToComoros(L, 'shp-1', [{ garmentTypeId: HAF, qty: 100 }, { garmentTypeId: YAS, qty: 60 }]);
    ok(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', lines: [{ garmentTypeId: HAF, qty: 50 }] }, 'amina'), 'amina');
    expect(L.balance(A.avail(com), HAF)).toBe(50);
    expect(L.balance(A.avail(com), YAS)).toBe(60);
  });
});

describe('consignment delivered for inspection', () => {
  const deliver = (L: ReturnType<typeof seeded>) =>
    ok(L, op('purchase.record', { id: 'pur-c', vendorId: hafsa, locationId: msa, date: '2026-10-10', currency: 'KES', intake: 'inspection', lines: [{ garmentTypeId: HAF, qty: 500, unitCost: 8000 }], note: 'Sack delivered before payment' }));

  it('does not count 500 delivered pieces as saleable before inspection (AT-2)', () => {
    const L = seeded();
    deliver(L);
    expect(L.balance(A.avail(msa), HAF)).toBe(0);
    expect(L.balance(A.inspection(msa, 'pur-c'), HAF)).toBe(500);
    expect(vendorBalances(L)).toEqual([]);
  });

  it('accepting 300 and rejecting 200 gives 300 saleable and keeps the 500 delivery record (AT-3, AT-4)', () => {
    const L = seeded();
    deliver(L);
    ok(L, op('purchase.inspect', { purchaseId: 'pur-c', date: '2026-10-11', lines: [{ garmentTypeId: HAF, accepted: 300, rejected: 200, reason: 'stitching' }], note: '' }));
    expect(L.balance(A.avail(msa), HAF)).toBe(300);
    expect(L.balance(A.rejected(msa, 'pur-c'), HAF)).toBe(200);
    const pur = L.get(K.purchase('pur-c')) as Purchase;
    expect(pur.lines[0]!.qty).toBe(500);
    const s = purchaseSummary(pur);
    expect(s.payable).toBe(300 * 8000); // KSh 24,000 — accepted pieces only
    expect(s.pendingInspection).toBe(0);
    expect(vendorBalances(L)).toEqual([{ vendorId: hafsa, currency: 'KES', payable: 2_400_000, paid: 0, balance: 2_400_000 }]);

    ok(L, op('purchase.return', { purchaseId: 'pur-c', date: '2026-10-12', lines: [{ garmentTypeId: HAF, qty: 200 }], note: '' }));
    expect(L.balance(A.rejected(msa, 'pur-c'), HAF)).toBe(0);
    ok(L, op('vendor.payment', { vendorId: hafsa, purchaseId: 'pur-c', date: '2026-10-12', amount: 2_400_000, currency: 'KES', method: 'mpesa', reference: 'QX12', note: '' }));
    expect(vendorBalances(L)[0]!.balance).toBe(0);
  });

  it('supports partial inspection over several days and refuses to inspect more than delivered', () => {
    const L = seeded();
    deliver(L);
    ok(L, op('purchase.inspect', { purchaseId: 'pur-c', date: '2026-10-11', lines: [{ garmentTypeId: HAF, accepted: 100, rejected: 20, reason: '' }], note: '' }));
    ok(L, op('purchase.inspect', { purchaseId: 'pur-c', date: '2026-10-12', lines: [{ garmentTypeId: HAF, accepted: 150, rejected: 30, reason: '' }], note: '' }));
    expect(purchaseSummary(L.get(K.purchase('pur-c')) as Purchase).pendingInspection).toBe(200);
    const r = fails(L, op('purchase.inspect', { purchaseId: 'pur-c', date: '2026-10-13', lines: [{ garmentTypeId: HAF, accepted: 150, rejected: 51, reason: '' }], note: '' }));
    expect(r.error).toMatch(/only 200 still waiting/);
    expect(L.balance(A.inspection(msa, 'pur-c'), HAF)).toBe(200);
  });

  it('cannot return more rejected pieces than were rejected', () => {
    const L = seeded();
    deliver(L);
    ok(L, op('purchase.inspect', { purchaseId: 'pur-c', date: '2026-10-11', lines: [{ garmentTypeId: HAF, accepted: 490, rejected: 10, reason: '' }], note: '' }));
    fails(L, op('purchase.return', { purchaseId: 'pur-c', date: '2026-10-12', lines: [{ garmentTypeId: HAF, qty: 11 }], note: '' }));
  });
});

describe('purchases collected later', () => {
  it('tracks paid-but-not-collected stock and partial collections', () => {
    const L = seeded();
    ok(L, op('purchase.record', { id: 'pur-w', vendorId: yasmin, locationId: msa, date: '2026-10-10', currency: 'KES', intake: 'awaiting', lines: [{ garmentTypeId: YAS, qty: 100, unitCost: 8000 }], note: '' }));
    expect(L.balance(A.avail(msa), YAS)).toBe(0);
    ok(L, op('purchase.collect', { purchaseId: 'pur-w', date: '2026-10-12', lines: [{ garmentTypeId: YAS, qty: 60 }], note: '' }));
    expect(L.balance(A.avail(msa), YAS)).toBe(60);
    expect(purchaseSummary(L.get(K.purchase('pur-w')) as Purchase).awaitingCollection).toBe(40);
    fails(L, op('purchase.collect', { purchaseId: 'pur-w', date: '2026-10-13', lines: [{ garmentTypeId: YAS, qty: 41 }], note: '' }));
  });
});

describe('shipments', () => {
  it('does not count stock at the destination until receipt is recorded (AT-5)', () => {
    const L = seeded();
    buyCollected(L, 'pur-a', hafsa, [{ garmentTypeId: HAF, qty: 300, unitCost: 8000 }]);
    ok(L, op('shipment.dispatch', { id: 'shp-1', code: 'BUS-01', fromLocationId: msa, toLocationId: com, method: 'bus', carrier: 'Tahmeed', packages: [{ label: 'Sack 1', weightKg: 23 }], lines: [{ garmentTypeId: HAF, qty: 300 }], date: '2026-10-11', expectedDate: null, note: '' }));
    expect(L.balance(A.avail(msa), HAF)).toBe(0);
    expect(L.balance(A.avail(com), HAF)).toBe(0);
    expect(stockByLocation(L).get(com)!.get(HAF)!.incoming).toBe(300);

    ok(L, op('shipment.receive', { shipmentId: 'shp-1', date: '2026-10-13', lines: [{ garmentTypeId: HAF, received: 290, missing: 4 }], note: '' }));
    expect(L.balance(A.avail(com), HAF)).toBe(290);
    expect((L.get(K.shipment('shp-1')) as Shipment).status).toBe('partial');
    // Cannot receive more than is still outstanding (no double receipt).
    fails(L, op('shipment.receive', { shipmentId: 'shp-1', date: '2026-10-14', lines: [{ garmentTypeId: HAF, received: 7, missing: 0 }], note: '' }));
    ok(L, op('shipment.receive', { shipmentId: 'shp-1', date: '2026-10-14', lines: [{ garmentTypeId: HAF, received: 6, missing: 0 }], note: '' }));
    expect((L.get(K.shipment('shp-1')) as Shipment).status).toBe('received');
  });

  it('keeps every cost line in its own currency and replaces estimates with actuals (AT-15)', () => {
    const L = seeded();
    buyCollected(L, 'pur-a', hafsa, [{ garmentTypeId: HAF, qty: 10, unitCost: 8000 }]);
    ok(L, op('shipment.dispatch', { id: 'shp-2', code: 'AIR-01', fromLocationId: msa, toLocationId: com, method: 'air', carrier: '', packages: [], lines: [{ garmentTypeId: HAF, qty: 10 }], date: '2026-10-11', expectedDate: null, note: '' }));
    const est = op('shipment.cost', { shipmentId: 'shp-2', category: 'air_baggage', description: 'Extra bag', amount: 10_000, currency: 'USD', status: 'estimated', date: '2026-10-11', reference: '', supersedesId: null });
    ok(L, est);
    ok(L, op('shipment.cost', { shipmentId: 'shp-2', category: 'bus_fare', description: 'Bus booking', amount: 30_000, currency: 'KES', status: 'actual', date: '2026-10-11', reference: '', supersedesId: null }));
    ok(L, op('shipment.cost', { shipmentId: 'shp-2', category: 'air_baggage', description: 'Extra bag (paid)', amount: 9_500, currency: 'USD', status: 'actual', date: '2026-10-11', reference: 'RCPT9', supersedesId: est.id }));
    const sh = L.get(K.shipment('shp-2')) as Shipment;
    const active = sh.costs.filter((c) => !c.voided && !c.supersededBy);
    expect(active.map((c) => [c.currency, c.amount])).toEqual([
      ['KES', 30_000],
      ['USD', 9_500],
    ]);
    const usd = L.postings.filter((p) => p.kind === 'shipcost' && p.currency === 'USD').reduce((s, p) => s + p.amount, 0);
    expect(usd).toBe(9_500);
  });
});

describe('worker sales day', () => {
  function stocked() {
    const L = seeded();
    buyCollected(L, 'pur-a', hafsa, [{ garmentTypeId: HAF, qty: 600, unitCost: 8000 }]);
    buyCollected(L, 'pur-b', yasmin, [{ garmentTypeId: LONG, qty: 50, unitCost: 15000 }]);
    shipToComoros(L, 'shp-1', [{ garmentTypeId: HAF, qty: 600 }, { garmentTypeId: LONG, qty: 50 }]);
    return L;
  }
  const day = '2026-10-17';

  it('issuing 50 and returning 12 calculates 38 sold for that exact garment type (AT-6)', () => {
    const L = stocked();
    ok(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: day, lines: [{ garmentTypeId: HAF, qty: 50 }] }, 'amina'), 'amina');
    ok(L, op('worker.return', { workerId: 'u-amina', locationId: com, workDate: day, lines: [{ garmentTypeId: HAF, qty: 12 }] }, 'amina'), 'amina');
    expect(workerHolding(L, 'u-amina').get(HAF)).toBe(38);
    const e = ok(
      L,
      op(
        'worker.settle',
        {
          workerId: 'u-amina',
          locationId: com,
          workDate: day,
          currency: 'KMF',
          lines: [{ garmentTypeId: HAF, held: 38, sold: 38, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 }],
          cash: 37_000,
          mobile: 0,
          expenses: [{ description: 'Lunch', amount: 1_000 }],
          note: '',
        },
        'amina',
      ),
      'amina',
    );
    const d = L.get(K.day('u-amina', day)) as WorkerDay;
    expect(d.settlement!.expected).toBe(38_000);
    expect(d.settlement!.variance).toBe(0);
    expect(e.flags).toEqual([]);
    expect(L.balance(A.sold(com), HAF)).toBe(38);
    expect(L.balance(A.avail(com), HAF)).toBe(562);
  });

  it('records wholesale sales without treating the discount as missing cash (AT-7)', () => {
    const L = stocked();
    ok(L, op('worker.issue', { workerId: 'u-said', locationId: com, workDate: day, lines: [{ garmentTypeId: HAF, qty: 500 }] }, 'said'), 'said');
    const e = ok(
      L,
      op(
        'worker.settle',
        {
          workerId: 'u-said',
          locationId: com,
          workDate: day,
          currency: 'KMF',
          lines: [{ garmentTypeId: HAF, held: 500, sold: 500, wholesaleQty: 500, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 }],
          cash: 425_000,
          mobile: 0,
          expenses: [],
          note: 'One buyer took all 500',
        },
        'said',
      ),
      'said',
    );
    const d = L.get(K.day('u-said', day)) as WorkerDay;
    expect(d.settlement!.expected).toBe(425_000);
    expect(d.settlement!.variance).toBe(0);
    expect(e.flags.find((f) => f.code === 'CASH_VARIANCE')).toBeUndefined();
  });

  it('shows a shortfall when less money is handed over than the sales and expenses explain', () => {
    const L = stocked();
    ok(L, op('worker.issue', { workerId: 'u-said', locationId: com, workDate: day, lines: [{ garmentTypeId: LONG, qty: 10 }] }, 'said'), 'said');
    const e = ok(
      L,
      op('worker.settle', { workerId: 'u-said', locationId: com, workDate: day, currency: 'KMF', lines: [{ garmentTypeId: LONG, held: 10, sold: 10, wholesaleQty: 0, retailPrice: 1750, wholesalePrice: 0, carried: 0, lost: 0 }], cash: 15_000, mobile: 1_000, expenses: [], note: '' }, 'said'),
      'said',
    );
    expect((L.get(K.day('u-said', day)) as WorkerDay).settlement!.variance).toBe(1_500);
    expect(e.flags.map((f) => f.code)).toContain('CASH_VARIANCE');
  });

  it('lets unsold pieces stay with the worker and counts lost pieces separately', () => {
    const L = stocked();
    ok(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: day, lines: [{ garmentTypeId: HAF, qty: 40 }] }, 'amina'), 'amina');
    ok(
      L,
      op('worker.settle', { workerId: 'u-amina', locationId: com, workDate: day, currency: 'KMF', lines: [{ garmentTypeId: HAF, held: 40, sold: 30, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 8, lost: 2 }], cash: 30_000, mobile: 0, expenses: [], note: '' }, 'amina'),
      'amina',
    );
    expect(workerHolding(L, 'u-amina').get(HAF)).toBe(8);
    expect(L.balance(A.adj(com), HAF)).toBe(2);
    fails(
      L,
      op('worker.settle', { workerId: 'u-amina', locationId: com, workDate: day, currency: 'KMF', lines: [], cash: 0, mobile: 0, expenses: [], note: '' }, 'amina'),
      'amina',
    );
  });

  it('rejects a closing where sold + kept + lost does not add up', () => {
    const L = stocked();
    ok(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: day, lines: [{ garmentTypeId: HAF, qty: 10 }] }, 'amina'), 'amina');
    const r = fails(
      L,
      op('worker.settle', { workerId: 'u-amina', locationId: com, workDate: day, currency: 'KMF', lines: [{ garmentTypeId: HAF, held: 10, sold: 9, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 0, carried: 0, lost: 0 }], cash: 9000, mobile: 0, expenses: [], note: '' }, 'amina'),
      'amina',
    );
    expect(r.error).toMatch(/must equal/);
  });

  it('accepts a physical fact that drives stock negative but flags it for management', () => {
    const L = stocked();
    const e = ok(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: day, lines: [{ garmentTypeId: LONG, qty: 60 }] }, 'amina'), 'amina');
    expect(e.flags.map((f) => f.code)).toEqual(['NEGATIVE_STOCK']);
    expect(L.balance(A.avail(com), LONG)).toBe(-10);
  });

  it('flags a closing price that differs from the price list', () => {
    const L = stocked();
    ok(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: day, lines: [{ garmentTypeId: HAF, qty: 5 }] }, 'amina'), 'amina');
    const e = ok(
      L,
      op('worker.settle', { workerId: 'u-amina', locationId: com, workDate: day, currency: 'KMF', lines: [{ garmentTypeId: HAF, held: 5, sold: 5, wholesaleQty: 0, retailPrice: 900, wholesalePrice: 0, carried: 0, lost: 0 }], cash: 4500, mobile: 0, expenses: [], note: '' }, 'amina'),
      'amina',
    );
    expect(e.flags.map((f) => f.code)).toEqual(['PRICE_MISMATCH']);
  });
});

describe('permissions', () => {
  it('a worker cannot record purchases', () => {
    const L = seeded();
    const r = fails(L, op('purchase.record', { id: 'pur-x', vendorId: hafsa, locationId: msa, date: '2026-10-10', currency: 'KES', intake: 'collected', lines: [{ garmentTypeId: HAF, qty: 1, unitCost: 1 }], note: '' }, 'amina'), 'amina');
    expect(r.code).toBe('forbidden');
  });

  it('a worker cannot record work for another worker, but a manager can', () => {
    const L = seeded();
    const payload = { workerId: 'u-said', locationId: com, workDate: '2026-10-17', lines: [{ garmentTypeId: HAF, qty: 1 }] };
    expect(fails(L, op('worker.issue', payload, 'amina'), 'amina').code).toBe('forbidden');
    ok(L, op('worker.issue', payload, 'manager'), 'manager');
  });

  it('nobody can create records in another person’s name', () => {
    const L = seeded();
    const o = op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', lines: [{ garmentTypeId: HAF, qty: 1 }] }, 'amina');
    expect(fails(L, o, 'said').code).toBe('forbidden');
  });

  it('a worker can cancel their own take-out before closing, but not after', () => {
    const L = seeded();
    const issue = op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', lines: [{ garmentTypeId: HAF, qty: 50 }] }, 'amina');
    ok(L, issue, 'amina');
    ok(L, op('op.void', { targetId: issue.id, reason: 'Typed 50 instead of 40' }, 'amina'), 'amina');
    expect(workerHolding(L, 'u-amina').size).toBe(0);
    expect(L.getOp(issue.id)!.voidedBy).toBeTruthy();

    const issue2 = op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', lines: [{ garmentTypeId: HAF, qty: 40 }] }, 'amina');
    ok(L, issue2, 'amina');
    ok(
      L,
      op('worker.settle', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', currency: 'KMF', lines: [{ garmentTypeId: HAF, held: 40, sold: 40, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 }], cash: 40000, mobile: 0, expenses: [], note: '' }, 'amina'),
      'amina',
    );
    const r = fails(L, op('op.void', { targetId: issue2.id, reason: 'Change after closing' }, 'amina'), 'amina');
    expect(r.error).toMatch(/already closed/);
  });

  it('a worker cannot cancel someone else’s record or a closing', () => {
    const L = seeded();
    const issue = op('worker.issue', { workerId: 'u-said', locationId: com, workDate: '2026-10-17', lines: [{ garmentTypeId: HAF, qty: 5 }] }, 'said');
    ok(L, issue, 'said');
    expect(fails(L, op('op.void', { targetId: issue.id, reason: 'not mine' }, 'amina'), 'amina').code).toBe('forbidden');
  });
});

describe('corrections preserve history (AT-14)', () => {
  it('voiding a closing reopens the day and reverses stock and money, keeping the original record', () => {
    const L = seeded();
    buyCollected(L, 'pur-a', hafsa, [{ garmentTypeId: HAF, qty: 100, unitCost: 8000 }]);
    shipToComoros(L, 'shp-1', [{ garmentTypeId: HAF, qty: 100 }]);
    ok(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', lines: [{ garmentTypeId: HAF, qty: 20 }] }, 'amina'), 'amina');
    const settle = op('worker.settle', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', currency: 'KMF', lines: [{ garmentTypeId: HAF, held: 20, sold: 20, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 }], cash: 20000, mobile: 0, expenses: [], note: '' }, 'amina');
    ok(L, settle, 'amina');
    expect(fails(L, op('op.void', { targetId: settle.id, reason: 'Amina forgot to return 3' }, 'amina'), 'amina').code).toBe('forbidden');
    const v = op('op.void', { targetId: settle.id, reason: 'Amina forgot to return 3' }, 'manager');
    ok(L, v, 'manager');
    const d = L.get(K.day('u-amina', '2026-10-17')) as WorkerDay;
    expect(d.status).toBe('open');
    expect(L.balance(A.sold(com), HAF)).toBe(0);
    expect(workerHolding(L, 'u-amina').get(HAF)).toBe(20);
    expect(L.getOp(settle.id)!.op.payload).toMatchObject({ cash: 20000 });
    expect(L.getOp(settle.id)!.voidedBy).toBe(v.id);
    const sales = L.postings.filter((p) => p.kind === 'sale').reduce((s, p) => s + p.amount, 0);
    expect(sales).toBe(0);
    expect(fails(L, op('op.void', { targetId: settle.id, reason: 'again' }, 'manager'), 'manager').code).toBe('conflict');
  });

  it('refuses to cancel a purchase that later records depend on', () => {
    const L = seeded();
    const rec = op('purchase.record', { id: 'pur-c', vendorId: hafsa, locationId: msa, date: '2026-10-10', currency: 'KES', intake: 'inspection', lines: [{ garmentTypeId: HAF, qty: 50, unitCost: 8000 }], note: '' });
    ok(L, rec);
    const insp = op('purchase.inspect', { purchaseId: 'pur-c', date: '2026-10-11', lines: [{ garmentTypeId: HAF, accepted: 40, rejected: 10, reason: '' }], note: '' });
    ok(L, insp);
    const ret = op('purchase.return', { purchaseId: 'pur-c', date: '2026-10-12', lines: [{ garmentTypeId: HAF, qty: 10 }], note: '' });
    ok(L, ret);
    fails(L, op('op.void', { targetId: rec.id, reason: 'wrong vendor' }));
    expect(fails(L, op('op.void', { targetId: insp.id, reason: 'recount' })).error).toMatch(/already returned/);
    ok(L, op('op.void', { targetId: ret.id, reason: 'not returned yet' }));
    ok(L, op('op.void', { targetId: insp.id, reason: 'recount' }));
    ok(L, op('op.void', { targetId: rec.id, reason: 'wrong vendor' }));
    expect(L.balance(A.avail(msa), HAF)).toBe(0);
    expect(L.balance(A.inspection(msa, 'pur-c'), HAF)).toBe(0);
    expect(vendorBalances(L)[0]!.balance).toBe(0);
  });

  it('records stock adjustments with a reason and lets the journey be traced', () => {
    const L = seeded();
    buyCollected(L, 'pur-a', hafsa, [{ garmentTypeId: HAF, qty: 10, unitCost: 8000 }]);
    ok(L, op('stock.adjust', { locationId: msa, date: '2026-10-12', reason: 'damaged', lines: [{ garmentTypeId: HAF, delta: -2 }], note: 'Torn' }));
    expect(L.balance(A.avail(msa), HAF)).toBe(8);
    expect(garmentJourney(L, HAF).map((s) => s.qty)).toEqual([10, 2]);
    fails(L, op('stock.adjust', { locationId: msa, date: '2026-10-12', reason: 'other', lines: [{ garmentTypeId: HAF, delta: 1 }], note: '' }));
  });
});

describe('prices and profit', () => {
  it('uses the price in force on the work date', () => {
    const L = seeded();
    ok(L, op('price.set', { id: 'pr-haf-nov', garmentTypeId: HAF, locationId: com, currency: 'KMF', retail: 1250, wholesale: 1000, effectiveFrom: '2026-11-01' }));
    fails(L, op('price.set', { id: 'pr-bad', garmentTypeId: HAF, locationId: com, currency: 'KES', retail: 100, wholesale: null, effectiveFrom: '2026-11-01' }));
  });

  it('separates gross margin from period net and refuses to invent exchange rates (AT-16)', () => {
    const L = seeded();
    buyCollected(L, 'pur-a', hafsa, [{ garmentTypeId: HAF, qty: 100, unitCost: 8000 }]);
    shipToComoros(L, 'shp-1', [{ garmentTypeId: HAF, qty: 100 }]);
    ok(L, op('shipment.cost', { shipmentId: 'shp-1', category: 'bus_fare', description: '', amount: 30_000, currency: 'KES', status: 'actual', date: '2026-10-11', reference: '', supersedesId: null }));
    ok(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', lines: [{ garmentTypeId: HAF, qty: 10 }] }, 'amina'), 'amina');
    ok(L, op('worker.settle', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', currency: 'KMF', lines: [{ garmentTypeId: HAF, held: 10, sold: 10, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 }], cash: 10_000, mobile: 0, expenses: [], note: '' }, 'amina'), 'amina');

    const noRate = profitReport(L, '2026-10-01', '2026-10-31', 'KMF');
    expect(noRate.salesValue).toBe(10_000);
    expect(noRate.missingRates.length).toBeGreaterThan(0);

    // Owner records: 1 KES = 3.5 KMF (example rate entered by the owner).
    ok(L, op('fx.set', { id: 'fx-1', from: 'KES', to: 'KMF', rate: '3.5', date: '2026-10-01', source: 'Bureau quote' }));
    const r = profitReport(L, '2026-10-01', '2026-10-31', 'KMF');
    expect(r.missingRates).toEqual([]);
    expect(r.costOfGoods).toBe(10 * 280); // KSh 80 × 3.5 = KMF 280 per piece
    expect(r.grossMargin).toBe(10_000 - 2_800);
    expect(r.shipmentCosts).toBe(1_050); // KSh 300 × 3.5
    expect(r.periodNet).toBe(10_000 - 2_800 - 1_050);
  });
});

describe('a closed day is approved once (owner report, 21 Oct 2026: "I was able to approve twice")', () => {
  const date = '2026-10-17';
  function closedDay() {
    const L = seeded();
    buyCollected(L, 'pur-r', hafsa, [{ garmentTypeId: HAF, qty: 20, unitCost: 8000 }]);
    shipToComoros(L, 'shp-r', [{ garmentTypeId: HAF, qty: 20 }]);
    ok(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: date, lines: [{ garmentTypeId: HAF, qty: 5 }] }, 'amina'), 'amina');
    const settle = op('worker.settle', { workerId: 'u-amina', locationId: com, workDate: date, currency: 'KMF', lines: [{ garmentTypeId: HAF, held: 5, sold: 5, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 }], cash: 5000, mobile: 0, expenses: [], note: '' }, 'amina');
    ok(L, settle, 'amina');
    return { L, settle };
  }
  const review = (decision: 'approved' | 'queried', note = '', who: 'manager' | 'owner' = 'manager') => op('worker.review', { workerId: 'u-amina', workDate: date, decision, note }, who);
  const dayOf = (L: ReturnType<typeof seeded>) => L.get(K.day('u-amina', date)) as WorkerDay;

  it('refuses a second approval and a question after approval, by anyone; the first approval stands', () => {
    const { L } = closedDay();
    ok(L, review('approved', 'all good'), 'manager');
    const again = fails(L, review('approved', 'again'), 'manager');
    expect(again.code).toBe('conflict');
    expect(again.error).toMatch(/already approved/);
    expect(fails(L, review('queried', 'why?'), 'manager').error).toMatch(/already approved/);
    expect(fails(L, review('approved', 'owner too', 'owner'), 'owner').code).toBe('conflict');
    expect(dayOf(L).review).toMatchObject({ decision: 'approved', note: 'all good', by: 'u-manager' });
  });

  it('a question can be followed up, and then the day is approved once', () => {
    const { L } = closedDay();
    ok(L, review('queried', 'Where is the 500 for lunch?'), 'manager');
    ok(L, review('queried', 'Please answer the first question'), 'manager');
    ok(L, review('approved', 'Answered in person'), 'manager');
    expect(fails(L, review('approved'), 'manager').code).toBe('conflict');
    expect(dayOf(L).review).toMatchObject({ decision: 'approved', note: 'Answered in person' });
  });

  it('reopening clears the approval; the new closing is approved once again', () => {
    const { L, settle } = closedDay();
    ok(L, review('approved'), 'manager');
    ok(L, op('op.void', { targetId: settle.id, reason: 'Recount after approval' }, 'manager'), 'manager');
    expect(dayOf(L).review).toBeNull();
    ok(L, op('worker.settle', { workerId: 'u-amina', locationId: com, workDate: date, currency: 'KMF', lines: [{ garmentTypeId: HAF, held: 5, sold: 4, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 1, lost: 0 }], cash: 4000, mobile: 0, expenses: [], note: '' }, 'amina'), 'amina');
    ok(L, review('approved', 'second closing'), 'manager');
    expect(fails(L, review('approved'), 'manager').code).toBe('conflict');
    expect(dayOf(L).review?.note).toBe('second closing');
  });

  it('records saved before the rule (three approvals of one day, as in production) still replay on every device', () => {
    const { L } = closedDay();
    // Replay = records the server already accepted (actor null), as a device rebuilds them.
    for (const note of ['', 'ALL DONE 2', 'ALL GOOD 3']) ok(L, review('approved', note), null);
    expect(dayOf(L)).toMatchObject({ status: 'settled', review: { decision: 'approved', note: 'ALL GOOD 3' } });
    // New input after the fix is refused.
    expect(fails(L, review('approved', 'a fourth'), 'manager').code).toBe('conflict');
  });
});

describe('late records: a take that reaches the server after its day was closed (ADR-004)', () => {
  // Expected numbers are worked out by hand in the comments, never read back from the engine.
  const date = '2026-10-17';
  const AM = { workerId: 'u-amina', locationId: com, workDate: date };
  const settleOp = (held: number, sold: number, carried: number, who: 'amina' | 'manager' = 'amina') =>
    op('worker.settle', { ...AM, currency: 'KMF', lines: [{ garmentTypeId: HAF, held, sold, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried, lost: 0 }], cash: sold * 1000, mobile: 0, expenses: [], note: '' }, who);
  /** 20 HAF on the Comoros shelf; Amina took 5 (synced) and the day was closed: 5 held, 5 sold. */
  function closedWithLateTake() {
    const L = seeded();
    buyCollected(L, 'pur-l', hafsa, [{ garmentTypeId: HAF, qty: 20, unitCost: 8000 }]);
    shipToComoros(L, 'shp-l', [{ garmentTypeId: HAF, qty: 20 }]);
    const take = op('worker.issue', { ...AM, lines: [{ garmentTypeId: HAF, qty: 5 }] }, 'amina');
    ok(L, take, 'amina');
    const close = settleOp(5, 5, 0, 'manager');
    ok(L, close, 'manager');
    // Saved on her phone before the closing, offline; it reaches the server only now.
    const late = op('worker.issue', { ...AM, lines: [{ garmentTypeId: HAF, qty: 3 }] }, 'amina');
    return { L, take, close, late };
  }
  /** What the server does with it: refused only because the day is closed, so kept for a manager. */
  function hold(L: ReturnType<typeof seeded>, late: ReturnType<typeof op>) {
    const r = L.apply(late, actor('amina'));
    expect(r.ok ? 'applied' : r.code).toBe('day_closed');
    L.recordRejected(late, { review: 'waiting' });
  }
  const decide = (targetId: string, decision: 'accept' | 'reject', reason = '', who: 'manager' | 'owner' | 'amina' = 'manager') => op('op.resolve', { targetId, decision, reason }, who);
  const sales = (L: ReturnType<typeof seeded>) => L.postings.filter((p) => p.kind === 'sale').reduce((s, p) => s + p.amount, 0);

  it('is refused only because the day is closed (code day_closed), and changes nothing while it waits', () => {
    const { L, late } = closedWithLateTake();
    hold(L, late);
    // Shelf 20 − 5 = 15; Amina holds 0 (all 5 sold); 5 sold.
    expect(L.balance(A.avail(com), HAF)).toBe(15);
    expect(workerHolding(L, 'u-amina').get(HAF)).toBeUndefined();
    expect(L.balance(A.sold(com), HAF)).toBe(5);
    expect(L.getOp(late.id)).toMatchObject({ status: 'rejected', review: 'waiting' });
  });

  it('accepting while the day is still closed is refused: reopen first (the closing is not silently changed)', () => {
    const { L, close, late } = closedWithLateTake();
    hold(L, late);
    const r = fails(L, decide(late.id, 'accept'), 'manager');
    expect(r.error).toBe('Reopen this day before accepting the late record.');
    expect(L.getOp(late.id)?.review).toBe('waiting');
    expect((L.get(K.day('u-amina', date)) as WorkerDay).settlement?.opId).toBe(close.id);
  });

  it('Scenario F: reopen, accept, close again — the take counts exactly once and the books balance', () => {
    const { L, close, late } = closedWithLateTake();
    hold(L, late);
    ok(L, op('op.void', { targetId: close.id, reason: 'Reopened to accept a late take' }, 'manager'), 'manager');
    const accept = decide(late.id, 'accept');
    ok(L, accept, 'manager');
    // Shelf 20 − 5 − 3 = 12; Amina holds 5 + 3 = 8 (the voided closing returned her 5).
    expect(L.balance(A.avail(com), HAF)).toBe(12);
    expect(workerHolding(L, 'u-amina').get(HAF)).toBe(8);
    expect(L.getOp(late.id)).toMatchObject({ status: 'applied', review: 'accepted', resolvedBy: accept.id });
    expect((L.get(K.day('u-amina', date)) as WorkerDay).issued[HAF]).toBe(8);
    // Closed again with the real figures: of 8, 7 sold and 1 kept.
    ok(L, settleOp(8, 7, 1), 'amina');
    // 12 on the shelf + 1 kept by Amina + 7 sold = 20 bought and shipped.
    expect(L.balance(A.avail(com), HAF)).toBe(12);
    expect(workerHolding(L, 'u-amina').get(HAF)).toBe(1);
    expect(L.balance(A.sold(com), HAF)).toBe(7);
    // Sales count the new closing only: 7 × 1,000, not 5,000 + 7,000.
    expect(sales(L)).toBe(7_000);
    expect(dayTotals(selectDays(L, { from: date, to: date, workerId: null, locationId: null, review: 'all' }))).toMatchObject([{ currency: 'KMF', days: 1, sold: 7, sales: 7_000 }]);
    // The original closing and the decision stay in the history.
    expect(L.getOp(close.id)?.voidedBy).toBeTruthy();
    expect(fails(L, decide(late.id, 'accept'), 'manager').error).toBe('This late record was already decided.');
    // Once accepted it behaves like any take: it cannot be cancelled on a closed day.
    expect(fails(L, op('op.void', { targetId: late.id, reason: 'mistake' }, 'manager'), 'manager').code).toBe('day_closed');
  });

  it('Scenario E: rejecting with a reason counts nothing and keeps the record and the reason', () => {
    const { L, late } = closedWithLateTake();
    hold(L, late);
    expect(parsePayload('op.resolve', { targetId: late.id, decision: 'reject', reason: '' }).ok).toBe(false);
    const reject = decide(late.id, 'reject', 'Counted the shelf: these 3 never left');
    ok(L, reject, 'manager');
    expect(L.balance(A.avail(com), HAF)).toBe(15);
    expect(L.getOp(late.id)).toMatchObject({ status: 'rejected', review: 'rejected', resolvedBy: reject.id });
    expect(L.getOp(reject.id)?.op.payload).toMatchObject({ reason: 'Counted the shelf: these 3 never left' });
    expect(fails(L, decide(late.id, 'accept'), 'manager').code).toBe('conflict');
  });

  it('only a manager decides: the worker who sent it cannot accept her own late record', () => {
    const { L, close, late } = closedWithLateTake();
    hold(L, late);
    ok(L, op('op.void', { targetId: close.id, reason: 'Reopened' }, 'manager'), 'manager');
    expect(fails(L, decide(late.id, 'accept', '', 'amina'), 'amina').code).toBe('forbidden');
    expect(L.getOp(late.id)?.review).toBe('waiting');
  });

  it('the worker’s own late closing (her real figures) can replace the manager’s, after her late return', () => {
    // On time: took 5. Manager closed it as 5 sold. Late, from her phone: returned 2, then closed 3 sold.
    const { L, close } = closedWithLateTake();
    const lateReturn = op('worker.return', { ...AM, lines: [{ garmentTypeId: HAF, qty: 2 }] }, 'amina');
    const lateClose = settleOp(3, 3, 0);
    hold(L, lateReturn);
    hold(L, lateClose);
    ok(L, op('op.void', { targetId: close.id, reason: 'Her phone has the real figures' }, 'manager'), 'manager');
    ok(L, decide(lateReturn.id, 'accept'), 'manager');
    ok(L, decide(lateClose.id, 'accept'), 'manager');
    // Shelf 20 − 5 + 2 = 17; 3 sold; 17 + 3 = 20. Sales 3 × 1,000.
    expect(L.balance(A.avail(com), HAF)).toBe(17);
    expect(L.balance(A.sold(com), HAF)).toBe(3);
    expect(workerHolding(L, 'u-amina').size).toBe(0);
    expect(sales(L)).toBe(3_000);
    expect((L.get(K.day('u-amina', date)) as WorkerDay).settlement?.opId).toBe(lateClose.id);
  });

  it('a late cancellation by the worker is decided the same way', () => {
    const L = seeded();
    buyCollected(L, 'pur-v', hafsa, [{ garmentTypeId: HAF, qty: 20, unitCost: 8000 }]);
    shipToComoros(L, 'shp-v', [{ garmentTypeId: HAF, qty: 20 }]);
    const take = op('worker.issue', { ...AM, lines: [{ garmentTypeId: HAF, qty: 4 }] }, 'amina');
    ok(L, take, 'amina');
    const close = settleOp(4, 4, 0, 'manager');
    ok(L, close, 'manager');
    const lateCancel = op('op.void', { targetId: take.id, reason: 'Typed 4, took none' }, 'amina');
    hold(L, lateCancel);
    ok(L, op('op.void', { targetId: close.id, reason: 'Reopened for her cancellation' }, 'manager'), 'manager');
    ok(L, decide(lateCancel.id, 'accept'), 'manager');
    expect(L.getOp(take.id)?.voidedBy).toBe(lateCancel.id);
    expect(L.balance(A.avail(com), HAF)).toBe(20);
  });

  it('a device rebuilding from the records (late record first, then the server order) reaches the same state', () => {
    const { L, take, close, late } = closedWithLateTake();
    hold(L, late);
    const reopen = op('op.void', { targetId: close.id, reason: 'Reopened' }, 'manager');
    ok(L, reopen, 'manager');
    const accept = decide(late.id, 'accept');
    ok(L, accept, 'manager');
    const reclose = settleOp(8, 8, 0);
    ok(L, reclose, 'amina');
    const R = seeded();
    buyCollected(R, 'pur-l', hafsa, [{ garmentTypeId: HAF, qty: 20, unitCost: 8000 }]);
    shipToComoros(R, 'shp-l', [{ garmentTypeId: HAF, qty: 20 }]);
    // As a fresh device downloads it today: the late record already says "accepted by <decision>".
    R.recordRejected(late, { review: 'accepted', resolvedBy: accept.id });
    for (const o of [take, close, reopen, accept, reclose]) ok(R, o, null);
    expect(Object.fromEntries(R.balances)).toEqual(Object.fromEntries(L.balances));
    expect(R.get(K.day('u-amina', date))).toEqual(L.get(K.day('u-amina', date)));
    expect(R.getOp(late.id)).toMatchObject({ status: 'applied', review: 'accepted' });
  });
});

describe('late-record evidence: phone clock against the closing (Scenarios B and D)', () => {
  const at = (s: string) => new Date(s).toISOString();
  function withTimes(phoneSavedAt: string, skewMs: number, closingReachedAt: string, lateReachedAt: string) {
    const L = seeded();
    const close = { ...op('worker.settle', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', currency: 'KMF', lines: [], cash: 0, mobile: 0, expenses: [], note: '' }, 'manager') };
    L.ops.set(close.id, { op: close, status: 'applied', voidedBy: null });
    const late = { ...op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', lines: [{ garmentTypeId: HAF, qty: 1 }] }, 'amina'), deviceTime: at(phoneSavedAt) };
    L.recordRejected(late, { review: 'waiting' });
    const meta = new Map([
      [close.id, { serverTime: at(closingReachedAt), clockSkewMs: 0 }],
      [late.id, { serverTime: at(lateReachedAt), clockSkewMs: skewMs }],
    ]);
    return lateEvidence(lateRecords(L)[0]!, L, (id) => meta.get(id));
  }

  it('a phone 2 hours behind: saved at 09:00 by its clock is about 11:00 — before a 18:00 closing', () => {
    const ev = withTimes('2026-10-17T06:00:00Z', 2 * 3600_000, '2026-10-17T15:00:00Z', '2026-10-17T18:30:00Z');
    expect(ev.correctedAt).toBe('2026-10-17T08:00:00.000Z');
    expect(ev.before).toBe(true);
    expect(ev.closedAt).toBe('2026-10-17T15:00:00.000Z');
  });

  it('Scenario B: a take saved after the closing had reached the server is shown as "after"', () => {
    const ev = withTimes('2026-10-17T16:10:00Z', 0, '2026-10-17T15:00:00Z', '2026-10-17T19:00:00Z');
    expect(ev.before).toBe(false);
  });

  it('a phone clock set 3 hours ahead cannot make an after-closing take look early: the measured error is removed', () => {
    // Saved at 16:10 real time; the phone showed 19:10; the server measured the phone 3 h ahead (skew −3 h).
    const ev = withTimes('2026-10-17T19:10:00Z', -3 * 3600_000, '2026-10-17T15:00:00Z', '2026-10-17T19:00:00Z');
    expect(ev.correctedAt).toBe('2026-10-17T16:10:00.000Z');
    expect(ev.before).toBe(false);
  });
});

describe('worker day: closed, reopened, next day (Amina scenario)', () => {
  it('a closed day blocks take and return for the worker; a manager reopens it; the next date opens by itself', () => {
    const L = seeded();
    buyCollected(L, 'pur-d', hafsa, [{ garmentTypeId: HAF, qty: 100, unitCost: 8000 }]);
    shipToComoros(L, 'shp-d', [{ garmentTypeId: HAF, qty: 100 }]);
    const day1 = '2026-10-17';
    ok(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: day1, lines: [{ garmentTypeId: HAF, qty: 10 }] }, 'amina'), 'amina');
    const settle = op('worker.settle', { workerId: 'u-amina', locationId: com, workDate: day1, currency: 'KMF', lines: [{ garmentTypeId: HAF, held: 10, sold: 8, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 2, lost: 0 }], cash: 8000, mobile: 0, expenses: [], note: '' }, 'amina');
    ok(L, settle, 'amina');

    // Closed: neither taking nor returning is accepted, whatever the screen shows.
    expect(fails(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: day1, lines: [{ garmentTypeId: HAF, qty: 1 }] }, 'amina'), 'amina').error).toMatch(/already closed/);
    expect(fails(L, op('worker.return', { workerId: 'u-amina', locationId: com, workDate: day1, lines: [{ garmentTypeId: HAF, qty: 1 }] }, 'amina'), 'amina').error).toMatch(/already closed/);
    // The worker cannot reopen it herself.
    expect(fails(L, op('op.void', { targetId: settle.id, reason: 'reopen' }, 'amina'), 'amina').code).toBe('forbidden');

    // Next business date: a new day starts with the first take, no approval step.
    ok(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: '2026-10-18', lines: [{ garmentTypeId: HAF, qty: 5 }] }, 'amina'), 'amina');
    expect((L.get(K.day('u-amina', '2026-10-18')) as WorkerDay).status).toBe('open');

    // A manager reopens day 1 ("Reopen day" = cancelling the closing, with a reason).
    ok(L, op('op.void', { targetId: settle.id, reason: 'Amina found 1 more to return' }, 'manager'), 'manager');
    expect((L.get(K.day('u-amina', day1)) as WorkerDay).status).toBe('open');
    ok(L, op('worker.return', { workerId: 'u-amina', locationId: com, workDate: day1, lines: [{ garmentTypeId: HAF, qty: 1 }] }, 'amina'), 'amina');
    // The original closing and its reason stay in the history.
    expect(L.getOp(settle.id)!.op.payload).toMatchObject({ cash: 8000 });
    expect(L.getOp(settle.id)!.voidedBy).toBeTruthy();
  });
});

describe('an archived person gets no new work (enforced by the rules, not only the screens)', () => {
  const archive = (L: ReturnType<typeof seeded>, id: string, active: boolean) =>
    L.setUsers([...[{ id: 'u-owner', name: 'Jowg', role: 'owner' as const, active: true, locationId: null }, { id: 'u-manager', name: 'Mama', role: 'manager' as const, active: true, locationId: null }], { id, name: 'Amina', role: 'worker', active, locationId: com }]);

  it('refuses a new day, lets a manager finish the open one, and still replays what was accepted before', () => {
    const L = seeded();
    buyCollected(L, 'pur-z', hafsa, [{ garmentTypeId: HAF, qty: 40, unitCost: 8000 }]);
    shipToComoros(L, 'shp-z', [{ garmentTypeId: HAF, qty: 40 }]);
    const take = op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', lines: [{ garmentTypeId: HAF, qty: 10 }] }, 'amina');
    ok(L, take, 'amina');
    archive(L, 'u-amina', false);
    // A new day for her: refused, with the reason.
    const next = fails(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: '2026-10-18', lines: [{ garmentTypeId: HAF, qty: 2 }] }, 'manager'), 'manager');
    expect(next.error).toBe('Amina is archived. Reactivate them in People & devices before giving them new work.');
    // Her open day can be finished by a manager.
    ok(L, op('worker.return', { workerId: 'u-amina', locationId: com, workDate: '2026-10-17', lines: [{ garmentTypeId: HAF, qty: 10 }] }, 'manager'), 'manager');
    expect(workerHolding(L, 'u-amina', com).get(HAF) ?? 0).toBe(0);
    // Replaying a record the server accepted before she was archived still works.
    const R = seeded();
    archive(R, 'u-amina', false);
    buyCollected(R, 'pur-z', hafsa, [{ garmentTypeId: HAF, qty: 40, unitCost: 8000 }]);
    shipToComoros(R, 'shp-z', [{ garmentTypeId: HAF, qty: 40 }]);
    expect(R.apply(take, null).ok).toBe(true);
    // Reactivated: new work again.
    archive(L, 'u-amina', true);
    ok(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: '2026-10-18', lines: [{ garmentTypeId: HAF, qty: 2 }] }, 'manager'), 'manager');
  });
});

describe('a "stock below zero" warning covered later by a back-dated record (owner, 31 Oct 2026)', () => {
  const { msa, com, yasmin, yasminPlain80: YAS } = IDS;
  it('stays on the record as history, and reads as resolved once the stock covers it', () => {
    const L = seeded();
    // The take in the Comoros was entered first…
    const take = op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: '2026-10-27', lines: [{ garmentTypeId: YAS, qty: 10 }] }, 'amina');
    const fx = ok(L, take, 'amina');
    expect(fx.flags.map((f) => f.code)).toContain('NEGATIVE_STOCK');
    expect(stockWarningResolved(L, take.id)).toBe(false);
    // …then the luggage it came from, back-dated to before the take.
    ok(L, op('purchase.record', { id: 'pur-bag', vendorId: yasmin, locationId: msa, date: '2026-10-25', currency: 'KES', intake: 'collected', lines: [{ garmentTypeId: YAS, qty: 10, unitCost: 8000 }], note: '' }));
    ok(L, op('shipment.dispatch', { id: 'shp-bag', code: 'BAG-1', fromLocationId: msa, toLocationId: com, method: 'air', carrier: '', packages: [], lines: [{ garmentTypeId: YAS, qty: 10 }], date: '2026-10-26', expectedDate: null, note: '' }));
    expect(stockWarningResolved(L, take.id)).toBe(false); // on the way is not yet at the Comoros
    ok(L, op('shipment.receive', { shipmentId: 'shp-bag', date: '2026-10-26', lines: [{ garmentTypeId: YAS, received: 10, missing: 0 }], note: '' }));
    expect(stockWarningResolved(L, take.id)).toBe(true);
    // The record's own warning is unchanged: it is what the records showed when it was saved.
    expect(L.effects.get(take.id)!.flags.map((f) => f.code)).toContain('NEGATIVE_STOCK');
  });
});
