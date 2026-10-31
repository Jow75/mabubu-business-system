import { describe, expect, it } from 'vitest';
import { Converter, findRecordedRate, marketFreshness, marketRate, parseOpenErApi, type MarketRates } from '../src/shared/fx';
import { formatLocalCount, localCount } from '../src/shared/money';
import { K, type Purchase } from '../src/shared/model';
import { profitReport } from '../src/shared/queries';
import { IDS, ok, op, seeded } from './helpers';

const { msa, com, yasmin, yasminPlain80: YAS } = IDS;
// Explicit test rates — not market quotes.
const TEST_RATE_OCT = '3.4';
const TEST_RATE_NOV = '3.6';

/** The owner's example: 357 pieces bought in Kenya at KSh 100 each, all sold in the Comoros at KMF 1,000. */
function sold357(withRate: boolean) {
  const L = seeded();
  if (withRate) ok(L, op('fx.set', { id: 'fx-oct', from: 'KES', to: 'KMF', rate: TEST_RATE_OCT, date: '2026-10-01', source: 'TEST RATE', basis: 'actual' }));
  ok(L, op('purchase.record', { id: 'pur-357', vendorId: yasmin, locationId: msa, date: '2026-10-02', currency: 'KES', intake: 'collected', lines: [{ garmentTypeId: YAS, qty: 357, unitCost: 10000 }], note: '' }));
  ok(L, op('expense.record', { locationId: msa, date: '2026-10-02', category: 'food_lodging', description: 'Lunch on buying day', amount: 150_000, currency: 'KES', shipmentId: null }));
  ok(L, op('shipment.dispatch', { id: 'shp-1', code: 'AIR-1', fromLocationId: msa, toLocationId: com, method: 'air', carrier: '', packages: [], lines: [{ garmentTypeId: YAS, qty: 357 }], date: '2026-10-03', expectedDate: null, note: '' }));
  ok(L, op('shipment.cost', { shipmentId: 'shp-1', category: 'local_transport', description: 'Taxi, one sack', amount: 30_000, currency: 'KES', status: 'actual', date: '2026-10-03', reference: '', supersedesId: null }));
  ok(L, op('shipment.receive', { shipmentId: 'shp-1', date: '2026-10-04', lines: [{ garmentTypeId: YAS, received: 357, missing: 0 }], note: '' }));
  ok(L, op('worker.issue', { workerId: 'u-amina', locationId: com, workDate: '2026-10-05', lines: [{ garmentTypeId: YAS, qty: 357 }] }, 'amina'), 'amina');
  ok(L, op('worker.settle', { workerId: 'u-amina', locationId: com, workDate: '2026-10-05', currency: 'KMF', lines: [{ garmentTypeId: YAS, held: 357, sold: 357, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 }], cash: 357_000, mobile: 0, expenses: [], note: '' }, 'amina'), 'amina');
  return L;
}

const sampleProvider = {
  result: 'success',
  base_code: 'USD',
  time_last_update_unix: 1792281751, // 2026-10-18 00:02:31 UTC
  time_next_update_unix: 1792368861,
  rates: { USD: 1, KES: 129.5, KMF: 437.5, TZS: 2630, EUR: 0.89, GBP: 0.75 },
};

describe('currency: original amounts are kept and conversions are traceable', () => {
  it('a KES purchase stays stored in KES; converting it never rewrites it', () => {
    const L = sold357(true);
    const before = structuredClone(L.get(K.purchase('pur-357')));
    const r = profitReport(L, '2026-10-01', '2026-10-31', 'KMF');
    const p = L.get(K.purchase('pur-357')) as Purchase;
    expect(p).toEqual(before);
    expect(p.currency).toBe('KES');
    expect(p.lines[0]!.unitCost).toBe(10000);
    // The report keeps the original cost: 357 × KSh 100 = KSh 35,700.
    expect(r.original.costOfGoods).toEqual({ KES: 3_570_000 });
  });

  it('the KMF figure is exactly the KES cost at the explicitly recorded rate, and says which rate', () => {
    const r = profitReport(sold357(true), '2026-10-01', '2026-10-31', 'KMF');
    expect(r.salesValue).toBe(357_000);
    expect(r.costOfGoods).toBe(121_380); // 35,700 × 3.4
    expect(r.grossMargin).toBe(357_000 - 121_380);
    expect(r.shipmentCosts).toBe(1_020); // KSh 300 × 3.4
    expect(r.original.shipmentCosts).toEqual({ KES: 30_000 });
    expect(r.expenses).toBe(5_100); // KSh 1,500 × 3.4
    expect(r.original.expenses).toEqual({ KES: 150_000 });
    expect(r.ratesUsed).toEqual([expect.objectContaining({ from: 'KES', to: 'KMF', rate: 3.4, effectiveDate: '2026-10-01', source: 'TEST RATE', basis: 'actual', inverse: false })]);
    expect(r.complete).toBe(true);
  });

  it('never subtracts KES from KMF: without a rate the report is marked incomplete', () => {
    const r = profitReport(sold357(false), '2026-10-01', '2026-10-31', 'KMF');
    expect(r.complete).toBe(false);
    expect(r.missingRates.some((m) => m.startsWith('KES→KMF'))).toBe(true);
    expect(r.missingCosts).toContain('YAS-PL80');
    // 370,750-style mistake: KMF sales − KES 35,700 must never be offered as a margin.
    expect(r.grossMargin).not.toBe(357_000 - 35_700);
    expect(r.costOfGoods).toBe(0);
    expect(r.original.costOfGoods).toEqual({ KES: 3_570_000 });
  });

  it('keeps historical rates and current market rates apart', () => {
    const L = sold357(true);
    ok(L, op('fx.set', { id: 'fx-nov', from: 'KES', to: 'KMF', rate: TEST_RATE_NOV, date: '2026-11-01', source: 'TEST RATE', basis: 'actual' }));
    // A later rate does not change October's historical cost.
    expect(profitReport(L, '2026-10-01', '2026-10-31', 'KMF').costOfGoods).toBe(121_380);
    // Current valuation uses the market rate, and says so.
    const market = parseOpenErApi(sampleProvider, '2026-10-18T06:00:00.000Z');
    const cur = profitReport(L, '2026-10-01', '2026-10-31', 'KMF', undefined, { basis: 'market', market });
    expect(cur.basis).toBe('market');
    expect(cur.costOfGoods).toBe(Math.round((3_570_000 / 100) * (437.5 / 129.5)));
    expect(cur.ratesUsed[0]).toMatchObject({ basis: 'live', from: 'KES', to: 'KMF' });
    expect(cur.ratesUsed[0]!.source).toContain('via USD');
  });

  it('a market view without market rates is incomplete, never a silent zero-cost profit', () => {
    const r = profitReport(sold357(true), '2026-10-01', '2026-10-31', 'KMF', undefined, { basis: 'market', market: null });
    expect(r.complete).toBe(false);
    expect(r.missingRates[0]).toContain('no market rate');
  });

  it('uses an inverse recorded rate and shows that it did', () => {
    const L = seeded();
    ok(L, op('fx.set', { id: 'fx-inv', from: 'KMF', to: 'KES', rate: '0.25', date: '2026-10-01', source: 'Bureau, Moroni' }));
    const use = findRecordedRate((k) => L.get(k), 'KES', 'KMF', '2026-10-10')!;
    expect(use).toMatchObject({ rate: 4, inverse: true, recorded: { from: 'KMF', to: 'KES', rate: '0.25' }, basis: 'manual' });
    expect(use.later).toBeUndefined();
    // Before the first recorded rate: that first rate, marked (owner's decision 31 Oct 2026, ADR-002 amendment).
    expect(findRecordedRate((k) => L.get(k), 'KES', 'KMF', '2026-09-30')).toMatchObject({ rate: 4, inverse: true, effectiveDate: '2026-10-01', later: true });
    // A pair never recorded in either direction still has no rate.
    expect(findRecordedRate((k) => L.get(k), 'EUR', 'KMF', '2026-10-10')).toBeNull();
  });

  it('converting a KES expense does not change the expense record', () => {
    const L = sold357(true);
    const exp = [...L.ops.values()].find((r) => r.op.type === 'expense.record')!;
    const c = new Converter((k) => L.get(k), 'KMF');
    expect(c.convert(150_000, 'KES', '2026-10-02')).toBe(5_100);
    expect(exp.op.payload).toMatchObject({ amount: 150_000, currency: 'KES' });
  });

  it('local count is display only: KMF 1,000 is 200, and the saved amount is unchanged', () => {
    const saved = 1000;
    expect(localCount(saved)).toBe(200);
    expect(formatLocalCount(saved)).toBe('200');
    expect(saved).toBe(1000);
  });
});

describe('amounts dated before the first recorded rate (owner decision, 31 Oct 2026 — ADR-002 amendment)', () => {
  // The live case: rates first written down on 28 Oct, a US$ shipment cost dated 27 Oct.
  function startedBeforeRates() {
    const L = sold357(false);
    ok(L, op('fx.set', { id: 'fx-kmf-kes', from: 'KMF', to: 'KES', rate: '0.25', date: '2026-10-28', source: 'TEST RATE' }));
    ok(L, op('fx.set', { id: 'fx-usd-kmf', from: 'USD', to: 'KMF', rate: '440', date: '2026-10-28', source: 'TEST RATE' }));
    ok(L, op('shipment.cost', { shipmentId: 'shp-1', category: 'air_baggage', description: 'Extra baggage', amount: 10_000, currency: 'USD', status: 'actual', date: '2026-10-27', reference: '', supersedesId: null }));
    return L;
  }

  it('the first rate recorded later is used for them, and the report is complete and says so', () => {
    const r = profitReport(startedBeforeRates(), '2026-10-01', '2026-10-31', 'KMF');
    expect(r.missingRates).toEqual([]);
    expect(r.complete).toBe(true);
    // KSh 357 + KSh 300 + KSh 1,500 (2 Oct) at 1 KES = 4 KMF; US$ 100 (27 Oct) at 440.
    expect(r.costOfGoods).toBe(142_800);
    expect(r.shipmentCosts).toBe(1_200 + 44_000);
    expect(r.ratesUsed.every((u) => u.later)).toBe(true);
    expect(r.ratesUsed.map((u) => [u.from, u.to, u.effectiveDate])).toEqual([
      ['KES', 'KMF', '2026-10-28'],
      ['USD', 'KMF', '2026-10-28'],
    ]);
  });

  it('a rate in force on the date is still preferred; the later one serves only amounts before any rate', () => {
    const L = startedBeforeRates();
    ok(L, op('fx.set', { id: 'fx-usd-kmf-oct1', from: 'USD', to: 'KMF', rate: '430', date: '2026-10-01', source: 'TEST RATE' }));
    const c = new Converter((k) => L.get(k), 'KMF');
    expect(c.convert(10_000, 'USD', '2026-10-27')).toBe(43_000); // the 1 Oct rate, in force on the 27th
    expect(c.convert(10_000, 'USD', '2026-09-15')).toBe(43_000); // before any rate: the first one (1 Oct)
    expect(c.convert(10_000, 'USD', '2026-10-29')).toBe(44_000); // the 28 Oct rate
    const lines = c.ratesUsed();
    expect(lines.find((u) => u.effectiveDate === '2026-10-01')!.later).toBe(true);
    expect(lines.find((u) => u.effectiveDate === '2026-10-28')!.later).toBeUndefined();
  });

  it('a currency with no recorded rate at all still makes the report incomplete (never a guessed rate)', () => {
    const L = sold357(false);
    ok(L, op('shipment.cost', { shipmentId: 'shp-1', category: 'air_baggage', description: 'Extra baggage', amount: 10_000, currency: 'USD', status: 'actual', date: '2026-10-27', reference: '', supersedesId: null }));
    const r = profitReport(L, '2026-10-01', '2026-10-31', 'KMF');
    expect(r.complete).toBe(false);
    expect(r.missingRates).toEqual(expect.arrayContaining(['KES→KMF (no rate recorded)', 'USD→KMF (no rate recorded)']));
  });
});

describe('market reference rates', () => {
  it('reads the provider response, keeps only our currencies and the publication time', () => {
    const m = parseOpenErApi(sampleProvider, '2026-10-18T06:00:00.000Z');
    expect(m.rates).toEqual({ USD: 1, KES: 129.5, KMF: 437.5, TZS: 2630, EUR: 0.89 });
    expect(m.publishedAt).toBe('2026-10-18T00:02:31.000Z');
    expect(m.fetchedAt).toBe('2026-10-18T06:00:00.000Z');
  });

  it('works out cross rates through USD, reproducibly', () => {
    const m = parseOpenErApi(sampleProvider, '2026-10-18T06:00:00.000Z');
    const r = marketRate(m, 'KES', 'KMF')!;
    expect(r.rate).toBeCloseTo(437.5 / 129.5, 12);
    expect(r.legs).toEqual([{ currency: 'KES', perBase: 129.5 }, { currency: 'KMF', perBase: 437.5 }]);
    expect(marketRate(m, 'TZS', 'TZS')!.rate).toBe(1);
  });

  it('refuses a currency the provider did not publish instead of guessing', () => {
    const m: MarketRates = { ...parseOpenErApi(sampleProvider, '2026-10-18T06:00:00.000Z'), rates: { USD: 1, KES: 129.5 } };
    expect(marketRate(m, 'KES', 'KMF')).toBeNull();
  });

  it('rejects malformed or failed provider responses', () => {
    expect(() => parseOpenErApi({ result: 'error', 'error-type': 'unsupported-code' }, 'x')).toThrow();
    expect(() => parseOpenErApi({ ...sampleProvider, base_code: 'EUR' }, 'x')).toThrow(/base/);
    expect(() => parseOpenErApi({ ...sampleProvider, rates: { USD: 2, KES: 1 } }, 'x')).toThrow(/inconsistent/);
    const neg = parseOpenErApi({ ...sampleProvider, rates: { USD: 1, KES: -3, KMF: 0 } }, 'x');
    expect(neg.rates).toEqual({ USD: 1 });
  });

  it('marks rates stale after the promised update has passed, and never calls day-old rates fresh', () => {
    const m = parseOpenErApi(sampleProvider, '2026-10-18T06:00:00.000Z');
    expect(marketFreshness(m, Date.parse('2026-10-18T12:00:00Z')).stale).toBe(false);
    expect(marketFreshness(m, Date.parse('2026-10-19T04:00:00Z')).stale).toBe(true);
    expect(marketFreshness({ ...m, nextUpdateAt: null }, Date.parse('2026-10-19T13:00:00Z')).stale).toBe(true);
  });
});
