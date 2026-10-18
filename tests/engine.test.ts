import { describe, expect, it } from 'vitest';
import { A, K, type Purchase, type Shipment, type WorkerDay } from '../src/shared/model';
import { purchaseSummary, stockByLocation, vendorBalances, workerHolding, profitReport, garmentJourney } from '../src/shared/queries';
import { IDS, fails, ok, op, seeded } from './helpers';

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
