// Read-only views over a Ledger: stock positions, vendor balances,
// worker days and profit. Shared so the same numbers can be tested.

import type { Ledger } from './ledger';
import { Converter, addTo, type ConversionBasis, type MarketRates, type RateUse } from './fx';
import { lineTotal, type Currency } from './money';
import type { PaymentMethod } from './model';
import {
  K,
  parseAccount,
  splitBalanceKey,
  type GarmentType,
  type Location,
  type Purchase,
  type Shipment,
  type WorkerDay,
} from './model';

/* ------------------------------------------------------------------ */
/* Stock                                                               */
/* ------------------------------------------------------------------ */

export interface StockRow {
  gt: string;
  avail: number;
  withWorkers: number;
  incoming: number;
  inspection: number;
  awaiting: number;
  rejected: number;
  sold: number;
}

const emptyRow = (gt: string): StockRow => ({ gt, avail: 0, withWorkers: 0, incoming: 0, inspection: 0, awaiting: 0, rejected: 0, sold: 0 });

/** Stock per location → per garment type. */
export function stockByLocation(ledger: Ledger): Map<string, Map<string, StockRow>> {
  const out = new Map<string, Map<string, StockRow>>();
  for (const [k, qty] of ledger.balances) {
    const [acct, gt] = splitBalanceKey(k);
    const { kind, loc } = parseAccount(acct);
    if (!loc) continue;
    let rows = out.get(loc);
    if (!rows) out.set(loc, (rows = new Map()));
    let row = rows.get(gt);
    if (!row) rows.set(gt, (row = emptyRow(gt)));
    switch (kind) {
      case 'avail':
        row.avail += qty;
        break;
      case 'worker':
        row.withWorkers += qty;
        break;
      case 'transit':
        row.incoming += qty;
        break;
      case 'insp':
        row.inspection += qty;
        break;
      case 'await':
        row.awaiting += qty;
        break;
      case 'rej':
        row.rejected += qty;
        break;
      case 'sold':
        row.sold += qty;
        break;
      default:
        break;
    }
  }
  return out;
}

export function sumRows(rows: Iterable<StockRow>): Omit<StockRow, 'gt'> {
  const t = emptyRow('');
  for (const r of rows) {
    t.avail += r.avail;
    t.withWorkers += r.withWorkers;
    t.incoming += r.incoming;
    t.inspection += r.inspection;
    t.awaiting += r.awaiting;
    t.rejected += r.rejected;
    t.sold += r.sold;
  }
  const { gt: _gt, ...rest } = t;
  return rest;
}

/** What a worker currently holds, per garment type (all locations). */
export function workerHolding(ledger: Ledger, workerId: string, locationId?: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, qty] of ledger.balances) {
    const [acct, gt] = splitBalanceKey(k);
    const a = parseAccount(acct);
    if (a.kind !== 'worker' || a.ref !== workerId) continue;
    if (locationId && a.loc !== locationId) continue;
    if (qty !== 0) out.set(gt, (out.get(gt) ?? 0) + qty);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Purchases & vendors                                                 */
/* ------------------------------------------------------------------ */

export interface PurchaseSummary {
  pieces: number;
  /** What we owe for this purchase (accepted pieces only, for inspection deliveries). */
  payable: number;
  pendingInspection: number;
  awaitingCollection: number;
  rejectedNotReturned: number;
  accepted: number;
  rejected: number;
}

export function purchaseSummary(p: Purchase): PurchaseSummary {
  let pieces = 0;
  let payable = 0;
  let pendingInspection = 0;
  let awaitingCollection = 0;
  let rejectedNotReturned = 0;
  let accepted = 0;
  let rejected = 0;
  for (const l of p.lines) {
    pieces += l.qty;
    if (p.intake === 'inspection') {
      payable += lineTotal(l.accepted, l.unitCost);
      pendingInspection += l.qty - l.accepted - l.rejected;
      rejectedNotReturned += l.rejected - l.returned;
      accepted += l.accepted;
      rejected += l.rejected;
    } else {
      payable += lineTotal(l.qty, l.unitCost);
      awaitingCollection += l.qty - l.collected;
    }
  }
  if (p.status === 'voided') payable = 0;
  return { pieces, payable, pendingInspection, awaitingCollection, rejectedNotReturned, accepted, rejected };
}

export interface VendorBalance {
  vendorId: string;
  currency: Currency;
  payable: number;
  paid: number;
  /** Positive: we owe the vendor. Negative: the vendor holds our credit. */
  balance: number;
}

/**
 * Vendor totals straight from the money postings (what was bought minus what
 * was paid). This is the ledger view; `vendorAccounts` must always agree with it.
 */
export function vendorBalances(ledger: Ledger): VendorBalance[] {
  const map = new Map<string, VendorBalance>();
  for (const p of ledger.postings) {
    if ((p.kind !== 'payable' && p.kind !== 'payment') || !p.vendorId) continue;
    const key = `${p.vendorId}|${p.currency}`;
    let b = map.get(key);
    if (!b) map.set(key, (b = { vendorId: p.vendorId, currency: p.currency, payable: 0, paid: 0, balance: 0 }));
    if (p.kind === 'payable') b.payable += p.amount;
    else b.paid += p.amount;
    b.balance = b.payable - b.paid;
  }
  return [...map.values()];
}

export interface PaymentRecord {
  opId: string;
  vendorId: string;
  /** The purchase chosen when the payment was recorded; null when paid from the vendor page. */
  purchaseId: string | null;
  date: string;
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  reference: string;
  note: string;
  /** Saved on this device but not yet confirmed by the server. */
  pending: boolean;
}

export interface PaymentAllocation {
  opId: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  reference: string;
  /** true: the payment named this purchase. false: applied automatically (oldest unpaid first). */
  linked: boolean;
}

export interface PurchaseBalance {
  purchaseId: string;
  vendorId: string;
  currency: Currency;
  payable: number;
  paid: number;
  /** payable − paid. Positive: still owed. */
  balance: number;
  allocations: PaymentAllocation[];
}

export interface VendorAccount {
  vendorId: string;
  currency: Currency;
  payable: number;
  paid: number;
  /** Positive: we owe the vendor. Negative: the vendor holds our credit. */
  balance: number;
  /**
   * What is left of payments not tied to a purchase after they paid the oldest
   * unpaid purchases (an advance). A payment tied to one purchase that pays too
   * much stays on that purchase (negative purchase balance); `balance` shows it
   * as credit either way. See ADR-002.
   */
  unallocated: number;
  purchases: PurchaseBalance[];
  payments: PaymentRecord[];
}

/** Every vendor payment that still counts (not rejected, not cancelled). */
export function vendorPayments(ledger: Ledger): PaymentRecord[] {
  const out: PaymentRecord[] = [];
  for (const id of ledger.order) {
    const r = ledger.ops.get(id);
    if (!r || r.op.type !== 'vendor.payment' || r.status === 'rejected' || r.voidedBy) continue;
    const p = r.op.payload;
    out.push({ opId: id, vendorId: p.vendorId, purchaseId: p.purchaseId, date: p.date, amount: p.amount, currency: p.currency, method: p.method, reference: p.reference, note: p.note, pending: r.status === 'pending' });
  }
  return out;
}

/**
 * The single source of truth for what is owed, per vendor and currency, and
 * per purchase. A purchase's balance is derived, never stored:
 *   payable (accepted pieces for inspection deliveries) − payments.
 * Payments that named the purchase count first. Payments recorded on the
 * vendor page without choosing a purchase are applied to that vendor's
 * oldest unpaid purchases in the same currency; anything left over is the
 * vendor's credit with us. Currencies are never mixed.
 */
export function vendorAccounts(ledger: Ledger): VendorAccount[] {
  const accounts = new Map<string, VendorAccount>();
  const acct = (vendorId: string, currency: Currency) => {
    const key = `${vendorId}|${currency}`;
    let a = accounts.get(key);
    if (!a) accounts.set(key, (a = { vendorId, currency, payable: 0, paid: 0, balance: 0, unallocated: 0, purchases: [], payments: [] }));
    return a;
  };
  const position = new Map(ledger.order.map((id, i) => [id, i]));
  const byPurchase = new Map<string, PurchaseBalance>();
  const purchases = ledger
    .list<Purchase>('purchase')
    .filter((p) => p.status === 'active')
    .sort((a, b) => a.date.localeCompare(b.date) || (position.get(a.opId) ?? 0) - (position.get(b.opId) ?? 0));
  for (const p of purchases) {
    const pb: PurchaseBalance = { purchaseId: p.id, vendorId: p.vendorId, currency: p.currency, payable: purchaseSummary(p).payable, paid: 0, balance: 0, allocations: [] };
    byPurchase.set(p.id, pb);
    const a = acct(p.vendorId, p.currency);
    a.purchases.push(pb);
    a.payable += pb.payable;
  }
  const payments = vendorPayments(ledger).sort((a, b) => a.date.localeCompare(b.date) || (position.get(a.opId) ?? 0) - (position.get(b.opId) ?? 0));
  const loose: PaymentRecord[] = [];
  for (const pay of payments) {
    const a = acct(pay.vendorId, pay.currency);
    a.payments.push(pay);
    a.paid += pay.amount;
    const pb = pay.purchaseId ? byPurchase.get(pay.purchaseId) : undefined;
    if (pb && pb.currency === pay.currency) {
      pb.paid += pay.amount;
      pb.allocations.push({ opId: pay.opId, amount: pay.amount, date: pay.date, method: pay.method, reference: pay.reference, linked: true });
    } else loose.push(pay);
  }
  for (const pay of loose) {
    const a = acct(pay.vendorId, pay.currency);
    let left = pay.amount;
    for (const pb of a.purchases) {
      if (left === 0) break;
      const owed = pb.payable - pb.paid;
      if (owed <= 0) continue;
      const take = Math.min(owed, left);
      pb.paid += take;
      pb.allocations.push({ opId: pay.opId, amount: take, date: pay.date, method: pay.method, reference: pay.reference, linked: false });
      left -= take;
    }
    a.unallocated += left;
  }
  for (const a of accounts.values()) {
    for (const pb of a.purchases) pb.balance = pb.payable - pb.paid;
    a.balance = a.payable - a.paid;
  }
  return [...accounts.values()];
}

export function purchaseBalances(ledger: Ledger): Map<string, PurchaseBalance> {
  return new Map(vendorAccounts(ledger).flatMap((a) => a.purchases.map((p) => [p.purchaseId, p] as const)));
}

/* ------------------------------------------------------------------ */
/* Worker days                                                         */
/* ------------------------------------------------------------------ */

export interface DayLine {
  gt: string;
  issued: number;
  returned: number;
  sold: number;
  carried: number;
  lost: number;
}

export function dayLines(day: WorkerDay): DayLine[] {
  const gts = new Set([...Object.keys(day.issued), ...Object.keys(day.returned), ...(day.settlement?.lines.map((l) => l.garmentTypeId) ?? [])]);
  return [...gts].map((gt) => {
    const s = day.settlement?.lines.find((l) => l.garmentTypeId === gt);
    return {
      gt,
      issued: day.issued[gt] ?? 0,
      returned: day.returned[gt] ?? 0,
      sold: s?.sold ?? 0,
      carried: s?.carried ?? 0,
      lost: s?.lost ?? 0,
    };
  });
}

export function workerDays(ledger: Ledger): WorkerDay[] {
  return ledger
    .list<WorkerDay>('day')
    .sort((a, b) => (a.workDate === b.workDate ? a.firstActivityAt.localeCompare(b.firstActivityAt) : b.workDate.localeCompare(a.workDate)));
}

/* ------------------------------------------------------------------ */
/* Costs and profit                                                    */
/* ------------------------------------------------------------------ */

type Totals = Partial<Record<Currency, number>>;

export interface UnitCost {
  gt: string;
  /** Weighted average purchase cost per piece in the reporting currency. */
  cost: number | null;
  pieces: number;
  /** Total purchase cost of those pieces in the currency actually paid. */
  original: Totals;
}

/**
 * Weighted average purchase cost per garment type. Each purchase is converted
 * by `conv` (normally at the recorded rate in force on the purchase date);
 * the original amounts are kept alongside.
 */
export function weightedCosts(ledger: Ledger, currency: Currency, missingRates: Set<string>, conv: Converter = new Converter((k) => ledger.get(k), currency)): Map<string, UnitCost> {
  const acc = new Map<string, { total: number; pieces: number; unknown: boolean; original: Totals }>();
  for (const p of ledger.list<Purchase>('purchase')) {
    if (p.status === 'voided') continue;
    for (const l of p.lines) {
      const pieces = p.intake === 'inspection' ? l.accepted : l.qty;
      if (pieces === 0) continue;
      const a = acc.get(l.garmentTypeId) ?? { total: 0, pieces: 0, unknown: false, original: {} };
      const amount = lineTotal(pieces, l.unitCost);
      const v = conv.convert(amount, p.currency, p.date);
      if (v === null) a.unknown = true;
      else a.total += v;
      addTo(a.original, p.currency, amount);
      a.pieces += pieces;
      acc.set(l.garmentTypeId, a);
    }
  }
  for (const m of conv.missing) missingRates.add(m);
  const out = new Map<string, UnitCost>();
  for (const [gt, a] of acc) out.set(gt, { gt, pieces: a.pieces, cost: a.unknown || a.pieces === 0 ? null : a.total / a.pieces, original: a.original });
  return out;
}

export interface ProfitGarmentRow {
  gt: string;
  sold: number;
  sales: number;
  /** Cost of the pieces sold in the reporting currency; null when unknown. */
  cost: number | null;
  /** The same cost in the currency it was paid in (e.g. KES). */
  costOriginal: Totals;
}

export interface ProfitReport {
  currency: Currency;
  from: string;
  to: string;
  basis: ConversionBasis;
  piecesSold: number;
  salesValue: number;
  cashDifference: number;
  workerExpenses: number;
  costOfGoods: number;
  grossMargin: number;
  shipmentCosts: number;
  expenses: number;
  periodNet: number;
  /** Every line above in the currencies the money was actually recorded in. */
  original: {
    sales: Totals;
    costOfGoods: Totals;
    cashDifference: Totals;
    workerExpenses: Totals;
    shipmentCosts: Totals;
    expenses: Totals;
  };
  byGarment: ProfitGarmentRow[];
  shipmentCostsByCategory: Record<string, number>;
  expensesByCategory: Record<string, number>;
  /** Each exchange rate used, with its date, source and basis. */
  ratesUsed: RateUse[];
  missingRates: string[];
  missingCosts: string[];
  estimatedShipmentCosts: number;
  /** false when any amount could not be converted or any garment cost is unknown: the totals are then partial. */
  complete: boolean;
  counts: { closedDays: number; shipmentCostLines: number; expenseLines: number };
}

export interface ProfitOptions {
  basis?: ConversionBasis;
  market?: MarketRates | null;
}

/**
 * Period profit, using:
 *  - sales value = settled worker days dated in the period, at the prices recorded when the day was closed;
 *  - cost of goods = pieces sold × weighted average purchase cost of that garment type;
 *  - shipment costs and expenses = charged in the period they are dated (not spread per piece).
 * Amounts in other currencies are converted with the recorded rate in force
 * on each amount's own date (or, if asked, today's market reference rate).
 * Nothing is ever subtracted across currencies without a rate: a missing rate
 * leaves the amount out and marks the report incomplete.
 */
export function profitReport(ledger: Ledger, from: string, to: string, currency: Currency, locationId?: string, opts: ProfitOptions = {}): ProfitReport {
  const get = (k: string) => ledger.get(k);
  const basis = opts.basis ?? 'transaction';
  const cv = new Converter(get, currency, basis, opts.market ?? null);
  const conv = (amount: number, cur: Currency, date: string): number => cv.convert(amount, cur, date) ?? 0;
  const missing = new Set<string>();
  const costs = weightedCosts(ledger, currency, missing, cv);
  const inRange = (d: string) => d >= from && d <= to;
  const original: ProfitReport['original'] = { sales: {}, costOfGoods: {}, cashDifference: {}, workerExpenses: {}, shipmentCosts: {}, expenses: {} };

  const byGarment = new Map<string, { gt: string; sold: number; sales: number; rawCost: number | null; rawOriginal: Totals }>();
  let piecesSold = 0;
  let salesValue = 0;
  let cashDifference = 0;
  let workerExpenses = 0;
  let closedDays = 0;
  const missingCosts = new Set<string>();

  for (const day of ledger.list<WorkerDay>('day')) {
    const s = day.settlement;
    if (!s || !inRange(day.workDate)) continue;
    if (locationId && day.locationId !== locationId) continue;
    closedDays++;
    salesValue += conv(s.expected, s.currency, day.workDate);
    cashDifference += conv(s.variance, s.currency, day.workDate);
    workerExpenses += conv(s.expensesTotal, s.currency, day.workDate);
    addTo(original.sales, s.currency, s.expected);
    addTo(original.cashDifference, s.currency, s.variance);
    addTo(original.workerExpenses, s.currency, s.expensesTotal);
    for (const l of s.lines) {
      if (l.sold === 0) continue;
      piecesSold += l.sold;
      const row = byGarment.get(l.garmentTypeId) ?? { gt: l.garmentTypeId, sold: 0, sales: 0, rawCost: 0, rawOriginal: {} };
      row.sold += l.sold;
      row.sales += conv(lineTotal(l.sold - l.wholesaleQty, l.retailPrice) + lineTotal(l.wholesaleQty, l.wholesalePrice), s.currency, day.workDate);
      const uc = costs.get(l.garmentTypeId);
      if (!uc || uc.cost === null) {
        row.rawCost = null;
        missingCosts.add((get(K.garment(l.garmentTypeId)) as GarmentType | undefined)?.code ?? l.garmentTypeId);
      } else if (row.rawCost !== null) row.rawCost += uc.cost * l.sold;
      if (uc && uc.pieces > 0) for (const [cur, total] of Object.entries(uc.original) as [Currency, number][]) addTo(row.rawOriginal, cur, (total / uc.pieces) * l.sold);
      byGarment.set(l.garmentTypeId, row);
    }
  }
  let costOfGoods = 0;
  const rows: ProfitGarmentRow[] = [];
  for (const r of byGarment.values()) {
    const cost = r.rawCost === null ? null : Math.round(r.rawCost);
    if (cost !== null) costOfGoods += cost;
    const costOriginal: Totals = {};
    for (const [cur, v] of Object.entries(r.rawOriginal) as [Currency, number][]) {
      costOriginal[cur] = Math.round(v);
      addTo(original.costOfGoods, cur, Math.round(v));
    }
    rows.push({ gt: r.gt, sold: r.sold, sales: r.sales, cost, costOriginal });
  }

  let shipmentCosts = 0;
  let estimatedShipmentCosts = 0;
  let expenses = 0;
  let shipmentCostLines = 0;
  let expenseLines = 0;
  const shipmentCostsByCategory: Record<string, number> = {};
  const expensesByCategory: Record<string, number> = {};
  for (const p of ledger.postings) {
    if (!inRange(p.date)) continue;
    if (p.kind === 'shipcost') {
      if (locationId) {
        const sh = get(K.shipment(p.shipmentId ?? '')) as Shipment | undefined;
        if (sh && sh.toLocationId !== locationId && sh.fromLocationId !== locationId) continue;
      }
      const v = conv(p.amount, p.currency, p.date);
      shipmentCosts += v;
      if (p.amount > 0) shipmentCostLines++;
      addTo(original.shipmentCosts, p.currency, p.amount);
      shipmentCostsByCategory[p.category ?? 'other'] = (shipmentCostsByCategory[p.category ?? 'other'] ?? 0) + v;
    } else if (p.kind === 'expense') {
      if (locationId && p.locationId !== locationId) continue;
      const v = conv(p.amount, p.currency, p.date);
      expenses += v;
      if (p.amount > 0) expenseLines++;
      addTo(original.expenses, p.currency, p.amount);
      expensesByCategory[p.category ?? 'other'] = (expensesByCategory[p.category ?? 'other'] ?? 0) + v;
    }
  }
  for (const sh of ledger.list<Shipment>('shipment')) {
    if (locationId && sh.toLocationId !== locationId && sh.fromLocationId !== locationId) continue;
    for (const c of sh.costs) {
      if (c.status === 'estimated' && !c.voided && !c.supersededBy && inRange(c.date)) estimatedShipmentCosts += conv(c.amount, c.currency, c.date);
    }
  }
  for (const m of cv.missing) missing.add(m);

  // Drop currencies whose totals cancelled out (e.g. a cost and its cancellation).
  for (const t of Object.values(original)) for (const [k, v] of Object.entries(t)) if (v === 0) delete t[k as Currency];

  const grossMargin = salesValue - costOfGoods;
  const periodNet = grossMargin - cashDifference - workerExpenses - shipmentCosts - expenses;
  return {
    currency,
    from,
    to,
    basis,
    piecesSold,
    salesValue,
    cashDifference,
    workerExpenses,
    costOfGoods,
    grossMargin,
    shipmentCosts,
    expenses,
    periodNet,
    original,
    byGarment: rows.sort((a, b) => b.sales - a.sales),
    shipmentCostsByCategory,
    expensesByCategory,
    ratesUsed: cv.ratesUsed(),
    missingRates: [...missing],
    missingCosts: [...missingCosts],
    estimatedShipmentCosts,
    complete: missing.size === 0 && missingCosts.size === 0,
    counts: { closedDays, shipmentCostLines, expenseLines },
  };
}

/* ------------------------------------------------------------------ */
/* Traceability                                                        */
/* ------------------------------------------------------------------ */

export interface JourneyStep {
  opId: string;
  from: string;
  to: string;
  qty: number;
}

/** Every movement of one garment type, in the order it was applied. */
export function garmentJourney(ledger: Ledger, gt: string): JourneyStep[] {
  const out: JourneyStep[] = [];
  for (const id of ledger.order) {
    const e = ledger.effects.get(id);
    if (!e) continue;
    for (const m of e.moves) if (m.gt === gt) out.push({ opId: id, from: m.from, to: m.to, qty: m.qty });
  }
  return out;
}

export function locationName(ledger: Ledger, id: string | null | undefined): string {
  if (!id) return '—';
  return (ledger.get(K.location(id)) as Location | undefined)?.name ?? 'Unknown location';
}
