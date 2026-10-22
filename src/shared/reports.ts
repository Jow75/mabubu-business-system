// Report builders: turn the records into ReportDocs for download. Each
// builder uses the same selection and query functions as its screen, so a
// downloaded total always equals the total on screen. Builders refuse to run
// for someone without the report's capability (see report-catalog.ts); the
// records themselves are also limited by what the server sent the device.

import type { Ledger } from './ledger';
import type { PeopleResponse } from './api';
import { buildLookups, describeOp, type Lookups } from './describe';
import { describeAccount, priceFor } from './engine';
import { CONVERSION_BASIS_LABEL, RATE_BASIS_LABEL, type RateUse } from './fx';
import { ADJUST_LABEL, EXPENSE_LABEL, FLAG_LABEL, INTAKE_LABEL, METHOD_LABEL, OP_GROUP, PAYMENT_LABEL, ROLE_LABEL, SHIP_COST_LABEL } from './labels';
import { K, parseAccount, type PriceList, type Purchase, type Shipment, type UserRef, type WorkerDay } from './model';
import { formatMoney, type Currency } from './money';
import { subjectOf, type AnyOp, type Flag, type LateReview, type OpType } from './ops';
import type { Capability } from './permissions';
import { canExport, REPORT_INFO, type ReportId } from './report-catalog';
import { TIME_NOTE, type Cell, type Column, type ReportDoc, type Table } from './report-doc';
import { dayLines, purchaseSummary, stockByLocation, vendorAccounts, type PaymentHow, type ProfitReport, type PurchaseBalance } from './queries';
import { businessDate, fmtDate } from './time';

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

export interface RecordMeta {
  status: 'applied' | 'pending' | 'rejected';
  serverTime: string | null;
  actorName: string;
  clockSkewMs: number | null;
  flags: Flag[];
  error?: string | null;
}

export interface ReportCtx {
  ledger: Ledger;
  directory: UserRef[];
  user: { id: string; name: string; caps: readonly Capability[] };
  /** Sync details for a record, when known (device records). */
  meta?: (opId: string) => RecordMeta | undefined;
  now?: Date;
}

export class ReportForbidden extends Error {}

function start(id: ReportId, ctx: ReportCtx, filters: ReportDoc['filters'], notes: string[] = []): ReportDoc & { lk: Lookups } {
  if (!canExport(ctx.user.caps, id)) throw new ReportForbidden(`You do not have permission to download “${REPORT_INFO[id].title}”.`);
  const lk = buildLookups(ctx.ledger, ctx.directory);
  return {
    id,
    title: REPORT_INFO[id].title,
    business: lk.settings.businessName,
    filters,
    generatedAt: (ctx.now ?? new Date()).toISOString(),
    generatedBy: ctx.user.name,
    notes: [...notes, TIME_NOTE],
    tables: [],
    lk,
  };
}

function finish(d: ReportDoc & { lk: Lookups }): ReportDoc {
  const { lk: _lk, ...doc } = d;
  return doc;
}

const caps = (ctx: ReportCtx, ...c: Capability[]) => c.some((x) => ctx.user.caps.includes(x));

export function rangeText(from: string | null, to: string | null): string {
  if (!from && !to) return 'All dates';
  if (from && to) return from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`;
  return from ? `From ${fmtDate(from)}` : `Up to ${fmtDate(to)}`;
}
const inRange = (d: string, from: string | null, to: string | null) => (!from || d >= from) && (!to || d <= to);

export function totalsText(t: Partial<Record<Currency, number>>): string {
  const parts = (Object.entries(t) as [Currency, number][]).filter(([, v]) => v !== 0).map(([c, v]) => formatMoney(c, v));
  return parts.length ? parts.join(' + ') : '—';
}

function syncText(m: RecordMeta | undefined): string {
  if (!m) return '';
  return m.status === 'pending' ? 'Saved on device, not synced yet' : m.status === 'rejected' ? 'Not accepted by the server' : 'Synced';
}

/** The date a record is about (its own date field), falling back to the day it was entered. */
export function recordDate(op: AnyOp): string {
  const p = op.payload as { date?: string; workDate?: string; effectiveFrom?: string };
  return p.date ?? p.workDate ?? p.effectiveFrom ?? businessDate(op.deviceTime);
}

/* ------------------------------------------------------------------ */
/* Sales days                                                          */
/* ------------------------------------------------------------------ */

export const REVIEW_FILTERS = ['all', 'open', 'to_review', 'approved', 'queried'] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];
export const REVIEW_LABEL: Record<ReviewFilter, string> = {
  all: 'Any status',
  open: 'Not closed yet',
  to_review: 'Closed, waiting for review',
  approved: 'Approved',
  queried: 'Queried',
};

export function dayStatus(d: WorkerDay): Exclude<ReviewFilter, 'all'> {
  if (d.status !== 'settled') return 'open';
  return d.review ? d.review.decision : 'to_review';
}

export interface DayFilter {
  from: string | null;
  to: string | null;
  workerId: string | null;
  locationId: string | null;
  review: ReviewFilter;
  /** e.g. "Last 7 days", shown with the dates. */
  preset?: string;
}

/** The days a screen or report shows for these filters (days with any activity). */
export function selectDays(ledger: Ledger, f: DayFilter): WorkerDay[] {
  return ledger
    .list<WorkerDay>('day')
    .filter(
      (d) =>
        inRange(d.workDate, f.from, f.to) &&
        (!f.workerId || d.workerId === f.workerId) &&
        (!f.locationId || d.locationId === f.locationId) &&
        (f.review === 'all' || dayStatus(d) === f.review) &&
        (d.status === 'settled' || Object.keys(d.issued).length > 0 || Object.keys(d.returned).length > 0),
    )
    .sort((a, b) => (a.workDate === b.workDate ? a.firstActivityAt.localeCompare(b.firstActivityAt) : b.workDate.localeCompare(a.workDate)));
}

export interface DayTotals {
  currency: Currency;
  days: number;
  sold: number;
  sales: number;
  spent: number;
  cash: number;
  mobile: number;
  handed: number;
  variance: number;
}

/** Totals of closed days, kept per currency (never added across currencies). */
export function dayTotals(days: WorkerDay[]): DayTotals[] {
  const m = new Map<Currency, DayTotals>();
  for (const d of days) {
    const s = d.settlement;
    if (!s) continue;
    const t = m.get(s.currency) ?? { currency: s.currency, days: 0, sold: 0, sales: 0, spent: 0, cash: 0, mobile: 0, handed: 0, variance: 0 };
    t.days++;
    t.sold += s.lines.reduce((a, l) => a + l.sold, 0);
    t.sales += s.expected;
    t.spent += s.expensesTotal;
    t.cash += s.cash;
    t.mobile += s.mobile;
    t.handed += s.handed;
    t.variance += s.variance;
    m.set(s.currency, t);
  }
  return [...m.values()];
}

function dayFilters(lk: Lookups, f: DayFilter): ReportDoc['filters'] {
  return [
    { label: 'Dates', value: `${f.preset ? `${f.preset}: ` : ''}${rangeText(f.from, f.to)}` },
    { label: 'Worker', value: f.workerId ? lk.personName(f.workerId) : 'Everyone' },
    { label: 'Place', value: f.locationId ? lk.locName(f.locationId) : 'All places' },
    { label: 'Status', value: REVIEW_LABEL[f.review] },
  ];
}

const DAY_STATUS_TEXT: Record<Exclude<ReviewFilter, 'all'>, string> = { open: 'Open', to_review: 'Closed · to review', approved: 'Approved', queried: 'Queried' };

export function salesDaysReport(ctx: ReportCtx, f: DayFilter): ReportDoc {
  const d = start('sales-days', ctx, [], [
    'Sales value = pieces sold × the price recorded when the day was closed (wholesale pieces at the wholesale price).',
    'Short (+) / over (−) = sales value − money the worker spent − cash and mobile money handed over.',
    'Totals are kept separately for each currency.',
  ]);
  d.filters = dayFilters(d.lk, f);
  const days = selectDays(ctx.ledger, f);
  const money = (key: string, label: string): Column => ({ key, label, kind: 'money', currencyKey: 'currency' });
  const columns: Column[] = [
    { key: 'date', label: 'Date', kind: 'date' },
    { key: 'worker', label: 'Worker', kind: 'text', width: 1.2 },
    { key: 'place', label: 'Place', kind: 'text' },
    { key: 'took', label: 'Took', kind: 'int', width: 0.6 },
    { key: 'back', label: 'Returned', kind: 'int', width: 0.7 },
    { key: 'sold', label: 'Sold', kind: 'int', width: 0.6 },
    { key: 'wholesale', label: 'Wholesale pcs', kind: 'int', width: 0.8 },
    { key: 'kept', label: 'Kept', kind: 'int', width: 0.6 },
    { key: 'lost', label: 'Lost', kind: 'int', width: 0.6 },
    { key: 'currency', label: 'Currency', kind: 'text', width: 0.7 },
    money('sales', 'Sales value'),
    money('spent', 'Spent'),
    money('cash', 'Cash'),
    money('mobile', 'Mobile money'),
    money('handed', 'Handed over'),
    money('variance', 'Short (+) / over (−)'),
    { key: 'status', label: 'Status', kind: 'text', width: 1.1 },
    { key: 'reviewNote', label: 'Review note', kind: 'text', width: 1.4 },
    { key: 'note', label: 'Worker’s note', kind: 'text', width: 1.4 },
  ];
  const rows = days.map((day) => {
    const lines = dayLines(day);
    const s = day.settlement;
    return {
      date: day.workDate,
      worker: d.lk.personName(day.workerId),
      place: d.lk.locName(day.locationId),
      took: lines.reduce((a, l) => a + l.issued, 0),
      back: lines.reduce((a, l) => a + l.returned, 0),
      sold: s ? lines.reduce((a, l) => a + l.sold, 0) : null,
      wholesale: s ? s.lines.reduce((a, l) => a + l.wholesaleQty, 0) : null,
      kept: s ? lines.reduce((a, l) => a + l.carried, 0) : null,
      lost: s ? lines.reduce((a, l) => a + l.lost, 0) : null,
      currency: s?.currency ?? null,
      sales: s?.expected ?? null,
      spent: s?.expensesTotal ?? null,
      cash: s?.cash ?? null,
      mobile: s?.mobile ?? null,
      handed: s?.handed ?? null,
      variance: s?.variance ?? null,
      status: DAY_STATUS_TEXT[dayStatus(day)],
      reviewNote: day.review?.note ?? '',
      note: s?.note ?? '',
    };
  });
  const totals = dayTotals(days).map((t) => ({ date: 'Total', worker: `${t.days} closed day${t.days === 1 ? '' : 's'}`, sold: t.sold, currency: t.currency, sales: t.sales, spent: t.spent, cash: t.cash, mobile: t.mobile, handed: t.handed, variance: t.variance }));
  d.tables.push({ title: 'Sales days', columns, rows, totals });
  return finish(d);
}

export function salesLinesReport(ctx: ReportCtx, f: DayFilter): ReportDoc {
  const d = start('sales-lines', ctx, [], ['Only closed days are included: a day’s sales are known when the worker closes it.', 'Value = retail pieces × retail price + wholesale pieces × wholesale price, as recorded at closing.']);
  d.filters = dayFilters(d.lk, f);
  const rows: Record<string, Cell>[] = [];
  const totals = new Map<string, { currency: Currency; sold: number; value: number }>();
  for (const day of selectDays(ctx.ledger, f)) {
    const s = day.settlement;
    if (!s) continue;
    for (const l of s.lines) {
      if (l.sold === 0) continue;
      const value = (l.sold - l.wholesaleQty) * l.retailPrice + l.wholesaleQty * l.wholesalePrice;
      const g = d.lk.garment(l.garmentTypeId);
      rows.push({ date: day.workDate, worker: d.lk.personName(day.workerId), place: d.lk.locName(day.locationId), code: g?.code ?? l.garmentTypeId, garment: g?.name ?? '', sold: l.sold, retail: l.sold - l.wholesaleQty, wholesale: l.wholesaleQty, retailPrice: l.retailPrice, wholesalePrice: l.wholesaleQty ? l.wholesalePrice : null, currency: s.currency, value, status: DAY_STATUS_TEXT[dayStatus(day)] });
      const t = totals.get(s.currency) ?? { currency: s.currency, sold: 0, value: 0 };
      t.sold += l.sold;
      t.value += value;
      totals.set(s.currency, t);
    }
  }
  const m = (key: string, label: string): Column => ({ key, label, kind: 'money', currencyKey: 'currency' });
  d.tables.push({
    title: 'Sales by garment',
    columns: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'worker', label: 'Worker', kind: 'text' },
      { key: 'place', label: 'Place', kind: 'text' },
      { key: 'code', label: 'Code', kind: 'text' },
      { key: 'garment', label: 'Garment', kind: 'text', width: 1.6 },
      { key: 'sold', label: 'Sold', kind: 'int', width: 0.6 },
      { key: 'retail', label: 'Retail pcs', kind: 'int', width: 0.7 },
      { key: 'wholesale', label: 'Wholesale pcs', kind: 'int', width: 0.8 },
      m('retailPrice', 'Retail price'),
      m('wholesalePrice', 'Wholesale price'),
      { key: 'currency', label: 'Currency', kind: 'text', width: 0.7 },
      m('value', 'Value'),
      { key: 'status', label: 'Day status', kind: 'text' },
    ],
    rows,
    totals: [...totals.values()].map((t) => ({ date: 'Total', sold: t.sold, currency: t.currency, value: t.value })),
  });
  return finish(d);
}

const WORKER_TYPES: readonly OpType[] = ['worker.issue', 'worker.return', 'worker.settle', 'worker.review'];

/** A late record's state, in the words of the downloads (ADR-004). */
export const LATE_TEXT: Record<LateReview, string> = {
  waiting: 'Late — waiting for a manager',
  accepted: 'Late — accepted by a manager',
  rejected: 'Late — not accepted by a manager',
};

export function workerRecordsReport(ctx: ReportCtx, f: DayFilter): ReportDoc {
  const d = start('worker-records', ctx, [], [
    'Every take-out, return, closing and review, including cancelled ones (marked), in the order they were entered.',
    'Device time is when the record was saved on the phone; server time is when it reached the server.',
    'A late record reached the server after its day was closed; it counts only once a manager accepted it.',
  ]);
  d.filters = dayFilters(d.lk, f).filter((x) => x.label !== 'Status');
  const rows: Record<string, Cell>[] = [];
  const all = [...ctx.ledger.ops.values()].sort((a, b) => a.op.deviceTime.localeCompare(b.op.deviceTime));
  for (const r of all) {
    const target = subjectOf(r.op, (id) => ctx.ledger.getOp(id)?.op);
    if (!target || !WORKER_TYPES.includes(target.type)) continue;
    const p = target.payload as { workerId: string; workDate: string; locationId?: string; lines?: { qty?: number; sold?: number }[] };
    const loc = p.locationId ?? (ctx.ledger.get(K.day(p.workerId, p.workDate)) as WorkerDay | undefined)?.locationId ?? null;
    if (!inRange(p.workDate, f.from, f.to) || (f.workerId && p.workerId !== f.workerId) || (f.locationId && loc !== f.locationId)) continue;
    const m = ctx.meta?.(r.op.id);
    const pieces = r.op.type === 'worker.issue' || r.op.type === 'worker.return' ? (p.lines ?? []).reduce((s, l) => s + (l.qty ?? 0), 0) : r.op.type === 'worker.settle' ? (p.lines ?? []).reduce((s, l) => s + (l.sold ?? 0), 0) : null;
    rows.push({
      deviceTime: r.op.deviceTime,
      serverTime: m?.serverTime ?? null,
      workDate: p.workDate,
      worker: d.lk.personName(p.workerId),
      by: m?.actorName ?? d.lk.personName(r.op.actorId),
      action:
        r.op.type === 'op.resolve'
          ? r.op.payload.decision === 'accept'
            ? 'Late record accepted'
            : 'Late record not accepted'
          : OP_GROUP[r.op.type] === 'Corrections'
            ? 'Cancellation'
            : { 'worker.issue': 'Took to sell', 'worker.return': 'Returned', 'worker.settle': 'Closed the day', 'worker.review': 'Review' }[r.op.type as 'worker.issue'],
      detail: describeOp(r.op, d.lk, ctx.ledger),
      pieces,
      cancelled: r.voidedBy ? 'Cancelled' : '',
      sync: r.review ? LATE_TEXT[r.review] : syncText(m) || (r.status === 'pending' ? 'Not synced yet' : r.status === 'rejected' ? 'Not accepted' : 'Synced'),
      warnings: (m?.flags ?? []).map((x) => FLAG_LABEL[x.code]).join(', '),
    });
  }
  d.tables.push({
    title: 'Worker records',
    columns: [
      { key: 'deviceTime', label: 'Device time', kind: 'datetime' },
      { key: 'serverTime', label: 'Server time', kind: 'datetime' },
      { key: 'workDate', label: 'Work day', kind: 'date' },
      { key: 'worker', label: 'Worker', kind: 'text' },
      { key: 'by', label: 'Recorded by', kind: 'text' },
      { key: 'action', label: 'Action', kind: 'text' },
      { key: 'detail', label: 'Details', kind: 'text', width: 3 },
      { key: 'pieces', label: 'Pieces', kind: 'int', width: 0.6 },
      { key: 'cancelled', label: 'Cancelled', kind: 'text', width: 0.8 },
      { key: 'sync', label: 'Sync', kind: 'text' },
      { key: 'warnings', label: 'Warnings', kind: 'text' },
    ],
    rows,
  });
  return finish(d);
}

/* ------------------------------------------------------------------ */
/* Purchases & vendors                                                 */
/* ------------------------------------------------------------------ */

export interface PurchaseFilter {
  status: 'open' | 'all';
  vendorId: string | null;
  payment: 'any' | 'owed' | 'paid';
  from: string | null;
  to: string | null;
}

export function purchaseIsOpen(p: Purchase, b: PurchaseBalance | undefined): boolean {
  const s = purchaseSummary(p);
  return p.status === 'active' && (s.pendingInspection > 0 || s.awaitingCollection > 0 || s.rejectedNotReturned > 0 || (b?.balance ?? 0) > 0);
}

/** The purchases the Purchases screen and report show for these filters, newest first. */
export function selectPurchases(ledger: Ledger, balances: Map<string, PurchaseBalance>, f: PurchaseFilter): Purchase[] {
  return ledger
    .list<Purchase>('purchase')
    .filter((p) => {
      const b = balances.get(p.id);
      if (f.status === 'open' && !purchaseIsOpen(p, b)) return false;
      if (f.vendorId && p.vendorId !== f.vendorId) return false;
      if (f.payment === 'owed' && !((b?.balance ?? 0) > 0)) return false;
      if (f.payment === 'paid' && (p.status !== 'active' || (b?.balance ?? 0) > 0)) return false;
      return inRange(p.date, f.from, f.to);
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export function collectionText(p: Purchase): string {
  if (p.intake === 'inspection') return 'Delivered to us';
  const s = purchaseSummary(p);
  if (p.intake === 'collected') return 'Collected';
  return s.awaitingCollection === 0 ? 'Collected' : `${s.awaitingCollection} still at vendor`;
}
export function inspectionText(p: Purchase): string {
  if (p.intake !== 'inspection') return 'Not needed';
  const s = purchaseSummary(p);
  const parts = [`${s.accepted} accepted`, `${s.rejected} rejected`];
  if (s.pendingInspection) parts.push(`${s.pendingInspection} to inspect`);
  if (s.rejectedNotReturned) parts.push(`${s.rejectedNotReturned} rejects to return`);
  return parts.join(', ');
}
function paymentRefs(b: PurchaseBalance | undefined): string {
  const how: Record<PaymentHow, string> = { named: '', auto: ' (vendor-page payment, oldest first)', allocated: ' (allocated by hand)' };
  return (b?.allocations ?? []).map((a) => `${fmtDate(a.date)} ${PAYMENT_LABEL[a.method]}${a.reference ? ` ${a.reference}` : ''} ${formatMoney(b!.currency, a.amount)}${how[a.how]}`.trim()).join('; ');
}

export function purchasesReport(ctx: ReportCtx, f: PurchaseFilter): ReportDoc {
  const d = start('purchases', ctx, [], [
    'Owed = full purchase value, or for deliveries on inspection only the accepted pieces.',
    'Paid = what payments pay onto this purchase: payments recorded for it, payments split onto it by hand, and vendor-page payments applied to the oldest unpaid purchases first (same vendor and currency only). A purchase is never counted as paid more than it costs; any excess is the vendor’s credit (see the vendors report).',
    'Every amount is in the currency actually paid; nothing is converted.',
  ]);
  d.filters = [
    { label: 'Show', value: f.status === 'open' ? 'Open purchases (something left to collect, inspect, return or pay)' : 'All purchases, including cancelled' },
    { label: 'Vendor', value: f.vendorId ? (d.lk.vendor(f.vendorId)?.name ?? 'Unknown') : 'All vendors' },
    { label: 'Payment', value: f.payment === 'owed' ? 'Still owed' : f.payment === 'paid' ? 'Fully paid' : 'Any' },
    { label: 'Dates', value: rangeText(f.from, f.to) },
  ];
  const balances = new Map(vendorAccounts(ctx.ledger).flatMap((a) => a.purchases.map((p) => [p.purchaseId, p] as const)));
  const list = selectPurchases(ctx.ledger, balances, f);
  const m = (key: string, label: string): Column => ({ key, label, kind: 'money', currencyKey: 'currency' });
  const prows: Record<string, Cell>[] = [];
  const lrows: Record<string, Cell>[] = [];
  const totals = new Map<Currency, { value: number; owed: number; paid: number; balance: number }>();
  for (const p of list) {
    const s = purchaseSummary(p);
    const b = balances.get(p.id);
    const value = p.lines.reduce((a, l) => a + l.qty * l.unitCost, 0);
    const vendor = d.lk.vendor(p.vendorId)?.name ?? '';
    prows.push({ date: p.date, vendor, place: d.lk.locName(p.locationId), how: INTAKE_LABEL[p.intake], pieces: s.pieces, currency: p.currency, value, owed: s.payable, paid: b?.paid ?? 0, balance: b?.balance ?? 0, collection: collectionText(p), inspection: inspectionText(p), payments: paymentRefs(b), status: p.status === 'voided' ? 'Cancelled' : purchaseIsOpen(p, b) ? 'Open' : 'Complete', note: p.note, id: p.id });
    if (p.status === 'active') {
      const t = totals.get(p.currency) ?? { value: 0, owed: 0, paid: 0, balance: 0 };
      t.value += value;
      t.owed += s.payable;
      t.paid += b?.paid ?? 0;
      t.balance += b?.balance ?? 0;
      totals.set(p.currency, t);
    }
    for (const l of p.lines) {
      const g = d.lk.garment(l.garmentTypeId);
      lrows.push({ date: p.date, vendor, code: g?.code ?? '', garment: g?.name ?? '', qty: l.qty, unitCost: l.unitCost, currency: p.currency, lineTotal: l.qty * l.unitCost, collected: p.intake === 'inspection' ? null : l.collected, accepted: p.intake === 'inspection' ? l.accepted : null, rejected: p.intake === 'inspection' ? l.rejected : null, returned: p.intake === 'inspection' ? l.returned : null, toInspect: p.intake === 'inspection' ? l.qty - l.accepted - l.rejected : null, atVendor: p.intake === 'awaiting' ? l.qty - l.collected : null, id: p.id });
    }
  }
  d.tables.push({
    title: 'Purchases',
    columns: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'vendor', label: 'Vendor', kind: 'text' },
      { key: 'place', label: 'Goods to', kind: 'text' },
      { key: 'how', label: 'How', kind: 'text' },
      { key: 'pieces', label: 'Pieces', kind: 'int', width: 0.6 },
      { key: 'currency', label: 'Currency', kind: 'text', width: 0.7 },
      m('value', 'Value'),
      m('owed', 'Owed'),
      m('paid', 'Paid'),
      m('balance', 'Balance'),
      { key: 'collection', label: 'Collection', kind: 'text' },
      { key: 'inspection', label: 'Inspection', kind: 'text', width: 1.4 },
      { key: 'payments', label: 'Payments (ref.)', kind: 'text', width: 2 },
      { key: 'status', label: 'Status', kind: 'text', width: 0.8 },
      { key: 'note', label: 'Note', kind: 'text', width: 1.2 },
      { key: 'id', label: 'Record id', kind: 'text', width: 1.4 },
    ],
    rows: prows,
    totals: [...totals].map(([currency, t]) => ({ date: 'Total', vendor: 'Active purchases', currency, ...t })),
  });
  d.tables.push({
    title: 'Purchase lines',
    columns: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'vendor', label: 'Vendor', kind: 'text' },
      { key: 'code', label: 'Code', kind: 'text' },
      { key: 'garment', label: 'Garment', kind: 'text', width: 1.5 },
      { key: 'qty', label: 'Qty', kind: 'int', width: 0.6 },
      m('unitCost', 'Cost each'),
      { key: 'currency', label: 'Currency', kind: 'text', width: 0.7 },
      m('lineTotal', 'Line total'),
      { key: 'collected', label: 'Collected', kind: 'int', width: 0.7 },
      { key: 'atVendor', label: 'Still at vendor', kind: 'int', width: 0.8 },
      { key: 'accepted', label: 'Accepted', kind: 'int', width: 0.7 },
      { key: 'rejected', label: 'Rejected', kind: 'int', width: 0.7 },
      { key: 'returned', label: 'Returned', kind: 'int', width: 0.7 },
      { key: 'toInspect', label: 'To inspect', kind: 'int', width: 0.7 },
      { key: 'id', label: 'Purchase id', kind: 'text', width: 1.4 },
    ],
    rows: lrows,
  });
  return finish(d);
}

const HOW_TEXT: Record<PaymentHow, string> = { named: 'One purchase', auto: 'Vendor page (oldest unpaid first)', allocated: 'Split by hand' };

export function vendorsReport(ctx: ReportCtx): ReportDoc {
  const d = start('vendors', ctx, [{ label: 'Vendors', value: 'All vendors' }], [
    'Outstanding = what the vendor’s purchases still owe. No purchase is ever counted as paid more than it costs.',
    'Available credit = money paid to the vendor that no purchase uses yet (an advance, the extra over a purchase, or a payment kept as credit). It is not a refund and not income.',
    'Balance = bought − paid = outstanding − available credit, per currency. Positive: we owe the vendor overall.',
  ]);
  const accounts = vendorAccounts(ctx.ledger);
  const purchases = ctx.ledger.list<Purchase>('purchase');
  const rows: Record<string, Cell>[] = [];
  for (const v of d.lk.vendors) {
    const accs = accounts.filter((a) => a.vendorId === v.id);
    const base = { vendor: v.name, phone: v.phone, notes: v.notes, active: v.active ? 'Yes' : 'No', last: purchases.filter((p) => p.vendorId === v.id && p.status === 'active').map((p) => p.date).sort().pop() ?? null };
    if (!accs.length) rows.push({ ...base, currency: null });
    for (const a of accs) rows.push({ ...base, currency: a.currency, bought: a.payable, paid: a.paid, outstanding: a.outstanding, credit: a.credit, balance: a.balance, open: a.purchases.filter((p) => p.balance > 0).length });
  }
  const m = (key: string, label: string): Column => ({ key, label, kind: 'money', currencyKey: 'currency' });
  d.tables.push({
    title: 'Vendors and balances',
    columns: [
      { key: 'vendor', label: 'Vendor', kind: 'text', width: 1.3 },
      { key: 'phone', label: 'Phone', kind: 'text' },
      { key: 'notes', label: 'What they sell / notes', kind: 'text', width: 2 },
      { key: 'active', label: 'Active', kind: 'text', width: 0.6 },
      { key: 'last', label: 'Last purchase', kind: 'date' },
      { key: 'currency', label: 'Currency', kind: 'text', width: 0.7 },
      m('bought', 'Bought'),
      m('paid', 'Paid'),
      m('outstanding', 'Outstanding'),
      m('credit', 'Available credit'),
      m('balance', 'Balance (net)'),
      { key: 'open', label: 'Unpaid purchases', kind: 'int', width: 0.8 },
    ],
    rows,
  });
  const purchaseDate = (id: string) => fmtDate((ctx.ledger.get(K.purchase(id)) as Purchase | undefined)?.date);
  const prow: Record<string, Cell>[] = [];
  for (const a of accounts) {
    a.payments.forEach((pay, i) => {
      const use = a.uses[i]!;
      const applied = use.lines.map((l) => `${purchaseDate(l.purchaseId)} purchase: ${formatMoney(a.currency, l.amount)}`);
      for (const u of use.unapplied) applied.push(`${formatMoney(a.currency, u.amount)} meant for the ${purchaseDate(u.purchaseId)} purchase was not needed`);
      prow.push({ date: pay.date, vendor: d.lk.vendor(pay.vendorId)?.name ?? '', currency: pay.currency, amount: pay.amount, method: PAYMENT_LABEL[pay.method], reference: pay.reference, chosen: HOW_TEXT[use.how], applied: applied.join('; '), credit: use.credit, note: pay.note, sync: pay.pending ? 'Not synced yet' : 'Synced', id: pay.opId });
    });
  }
  prow.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  d.tables.push({
    title: 'Payments',
    note: 'Each payment is listed once, with what it pays and what stays as credit. Cancelled payments are not listed; they remain in the activity log.',
    columns: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'vendor', label: 'Vendor', kind: 'text' },
      { key: 'currency', label: 'Currency', kind: 'text', width: 0.7 },
      m('amount', 'Amount'),
      { key: 'method', label: 'Paid by', kind: 'text', width: 0.7 },
      { key: 'reference', label: 'Reference', kind: 'text' },
      { key: 'chosen', label: 'How it is used', kind: 'text', width: 1.2 },
      { key: 'applied', label: 'Pays', kind: 'text', width: 2.2 },
      m('credit', 'Kept as credit'),
      { key: 'note', label: 'Note', kind: 'text' },
      { key: 'sync', label: 'Sync', kind: 'text', width: 0.8 },
      { key: 'id', label: 'Record id', kind: 'text', width: 1.4 },
    ],
    rows: prow,
  });
  // Every change of how a payment is split, oldest first (the payments themselves never change).
  const hrows: Record<string, Cell>[] = [];
  for (const id of ctx.ledger.order) {
    const r = ctx.ledger.getOp(id);
    if (!r || r.op.type !== 'payment.allocate') continue;
    const pay = ctx.ledger.getOp(r.op.payload.paymentId)?.op;
    if (pay?.type !== 'vendor.payment') continue;
    const pp = pay.payload;
    const used = r.op.payload.allocations.reduce((s, x) => s + x.amount, 0);
    hrows.push({
      when: r.op.deviceTime,
      by: ctx.meta?.(id)?.actorName ?? d.lk.personName(r.op.actorId),
      vendor: d.lk.vendor(pp.vendorId)?.name ?? '',
      payment: `${fmtDate(pp.date)} · ${formatMoney(pp.currency, pp.amount)}${pp.reference ? ` · ${pp.reference}` : ''}`,
      split: r.op.payload.allocations.map((x) => `${purchaseDate(x.purchaseId)} purchase: ${formatMoney(pp.currency, x.amount)}`).join('; ') || 'No purchase',
      currency: pp.currency,
      credit: pp.amount - used,
      note: r.op.payload.note,
      id,
    });
  }
  if (hrows.length) {
    d.tables.push({
      title: 'Allocation history',
      note: 'Each line replaced the payment’s previous split. Credit moves only between purchases of the same vendor, in the same currency.',
      columns: [
        { key: 'when', label: 'Changed', kind: 'datetime' },
        { key: 'by', label: 'By', kind: 'text', width: 0.8 },
        { key: 'vendor', label: 'Vendor', kind: 'text' },
        { key: 'payment', label: 'Payment', kind: 'text', width: 1.6 },
        { key: 'split', label: 'Now pays', kind: 'text', width: 2.2 },
        { key: 'currency', label: 'Currency', kind: 'text', width: 0.7 },
        m('credit', 'Kept as credit'),
        { key: 'note', label: 'Note', kind: 'text' },
        { key: 'id', label: 'Record id', kind: 'text', width: 1.4 },
      ],
      rows: hrows,
    });
  }
  return finish(d);
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

export function catalogueReport(ctx: ReportCtx, on: string = businessDate()): ReportDoc {
  const d = start('catalogue', ctx, [{ label: 'Prices in force on', value: fmtDate(on) }], ['Selling prices are per place, in that place’s currency. Price history lists every price ever set.']);
  const selling = d.lk.locations.filter((l) => l.kind === 'selling');
  const columns: Column[] = [
    { key: 'code', label: 'Code', kind: 'text' },
    { key: 'name', label: 'Garment', kind: 'text', width: 1.6 },
    { key: 'size', label: 'Size group', kind: 'text' },
    { key: 'vendor', label: 'Vendor', kind: 'text' },
    { key: 'description', label: 'Description', kind: 'text', width: 1.8 },
    { key: 'active', label: 'Active', kind: 'text', width: 0.6 },
  ];
  for (const l of selling) {
    columns.push({ key: `r-${l.id}`, label: `Retail · ${l.name}`, kind: 'money', currency: l.currency });
    columns.push({ key: `w-${l.id}`, label: `Wholesale · ${l.name}`, kind: 'money', currency: l.currency });
    columns.push({ key: `f-${l.id}`, label: `Since · ${l.name}`, kind: 'date' });
  }
  const rows = d.lk.garments.map((g) => {
    const row: Record<string, Cell> = { code: g.code, name: g.name, size: d.lk.size(g.sizeCategoryId)?.name ?? '', vendor: d.lk.vendor(g.vendorId)?.name ?? '', description: g.description, active: g.active ? 'Yes' : 'No' };
    for (const l of selling) {
      const p = priceFor((k) => ctx.ledger.get(k), g.id, l.id, on);
      row[`r-${l.id}`] = p?.retail ?? null;
      row[`w-${l.id}`] = p?.wholesale ?? null;
      row[`f-${l.id}`] = p?.effectiveFrom ?? null;
    }
    return row;
  });
  d.tables.push({ title: 'Garments and current selling prices', columns, rows });
  const hist: Record<string, Cell>[] = [];
  for (const list of ctx.ledger.list<PriceList>('price')) {
    const g = d.lk.garment(list.garmentTypeId);
    for (const e of list.entries) hist.push({ code: g?.code ?? '', name: g?.name ?? '', place: d.lk.locName(list.locationId), currency: e.currency, retail: e.retail, wholesale: e.wholesale, from: e.effectiveFrom });
  }
  hist.sort((a, b) => String(a.code).localeCompare(String(b.code)) || String(a.from).localeCompare(String(b.from)));
  d.tables.push({
    title: 'Price history',
    columns: [
      { key: 'code', label: 'Code', kind: 'text' },
      { key: 'name', label: 'Garment', kind: 'text', width: 1.6 },
      { key: 'place', label: 'Place', kind: 'text' },
      { key: 'currency', label: 'Currency', kind: 'text', width: 0.7 },
      { key: 'retail', label: 'Retail', kind: 'money', currencyKey: 'currency' },
      { key: 'wholesale', label: 'Wholesale', kind: 'money', currencyKey: 'currency' },
      { key: 'from', label: 'From', kind: 'date' },
    ],
    rows: hist,
  });
  d.tables.push({
    title: 'Size groups',
    columns: [
      { key: 'name', label: 'Size group', kind: 'text', width: 2 },
      { key: 'order', label: 'Order', kind: 'int', width: 0.6 },
      { key: 'garments', label: 'Garment types', kind: 'int', width: 0.8 },
      { key: 'active', label: 'Active', kind: 'text', width: 0.6 },
    ],
    rows: d.lk.sizes.map((s) => ({ name: s.name, order: s.sort, garments: d.lk.garments.filter((g) => g.sizeCategoryId === s.id).length, active: s.active ? 'Yes' : 'No' })),
  });
  return finish(d);
}

/* ------------------------------------------------------------------ */
/* Stock                                                               */
/* ------------------------------------------------------------------ */

export function stockReport(ctx: ReportCtx, f: { locationId: string | null }): ReportDoc {
  const d = start('stock', ctx, [{ label: 'Place', value: f.locationId ? (buildLookups(ctx.ledger, ctx.directory).locName(f.locationId)) : 'All places' }], [
    'Ready = in the store, available to sell or ship. On the way = dispatched to this place, not yet received.',
    'At vendor = bought but not yet collected. To inspect = delivered, not yet inspected. Rejected = waiting to go back to the vendor.',
  ]);
  const rows: Record<string, Cell>[] = [];
  const total = { ready: 0, workers: 0, incoming: 0, inspect: 0, vendor: 0, rejected: 0, sold: 0 };
  for (const [loc, m] of stockByLocation(ctx.ledger)) {
    if (f.locationId && loc !== f.locationId) continue;
    for (const [gt, s] of m) {
      if (s.avail + s.withWorkers + s.incoming + s.inspection + s.awaiting + s.rejected + s.sold === 0) continue;
      const g = d.lk.garment(gt);
      rows.push({ place: d.lk.locName(loc), code: g?.code ?? gt, garment: g?.name ?? '', size: d.lk.size(g?.sizeCategoryId)?.name ?? '', ready: s.avail, workers: s.withWorkers, incoming: s.incoming, inspect: s.inspection, vendor: s.awaiting, rejected: s.rejected, sold: s.sold });
      total.ready += s.avail;
      total.workers += s.withWorkers;
      total.incoming += s.incoming;
      total.inspect += s.inspection;
      total.vendor += s.awaiting;
      total.rejected += s.rejected;
      total.sold += s.sold;
    }
  }
  rows.sort((a, b) => String(a.place).localeCompare(String(b.place)) || String(a.code).localeCompare(String(b.code)));
  const n = (key: string, label: string): Column => ({ key, label, kind: 'int', width: 0.8 });
  d.tables.push({
    title: 'Stock now',
    columns: [
      { key: 'place', label: 'Place', kind: 'text' },
      { key: 'code', label: 'Code', kind: 'text' },
      { key: 'garment', label: 'Garment', kind: 'text', width: 1.6 },
      { key: 'size', label: 'Size group', kind: 'text' },
      n('ready', 'Ready'),
      n('workers', 'With workers'),
      n('incoming', 'On the way'),
      n('inspect', 'To inspect'),
      n('vendor', 'At vendor'),
      n('rejected', 'Rejected, to return'),
      n('sold', 'Sold to date'),
    ],
    rows,
    totals: [{ place: 'Total', ...total }],
  });
  return finish(d);
}

export function movementsReport(ctx: ReportCtx, f: { from: string | null; to: string | null; locationId: string | null }): ReportDoc {
  const d = start('movements', ctx, [], ['Each line moves pieces of one garment type from one place or state to another. Cancelled records appear with their reversal.']);
  d.filters = [
    { label: 'Dates', value: rangeText(f.from, f.to) },
    { label: 'Place', value: f.locationId ? d.lk.locName(f.locationId) : 'All places' },
  ];
  const get = (k: string) => ctx.ledger.get(k);
  const rows: Record<string, Cell>[] = [];
  const adj: Record<string, Cell>[] = [];
  for (const id of ctx.ledger.order) {
    const r = ctx.ledger.getOp(id);
    const e = ctx.ledger.effects.get(id);
    if (!r || !e) continue;
    const date = recordDate(r.op.type === 'op.void' ? (ctx.ledger.getOp(r.op.payload.targetId)?.op ?? r.op) : r.op);
    if (!inRange(date, f.from, f.to)) continue;
    const by = ctx.meta?.(id)?.actorName ?? d.lk.personName(r.op.actorId);
    for (const m of e.moves) {
      const fromLoc = parseAccount(m.from).loc;
      const toLoc = parseAccount(m.to).loc;
      if (f.locationId && fromLoc !== f.locationId && toLoc !== f.locationId) continue;
      const g = d.lk.garment(m.gt);
      rows.push({ date, record: OP_GROUP[r.op.type], what: describeOp(r.op, d.lk, ctx.ledger), code: g?.code ?? m.gt, qty: m.qty, from: describeAccount(m.from, get), to: describeAccount(m.to, get), by, cancelled: r.voidedBy ? 'Cancelled' : '', id });
    }
    if (r.op.type === 'stock.adjust' && (!f.locationId || r.op.payload.locationId === f.locationId)) {
      for (const l of r.op.payload.lines) {
        const g = d.lk.garment(l.garmentTypeId);
        adj.push({ date, place: d.lk.locName(r.op.payload.locationId), reason: ADJUST_LABEL[r.op.payload.reason], code: g?.code ?? '', change: l.delta, note: r.op.payload.note, by, cancelled: r.voidedBy ? 'Cancelled' : '', id });
      }
    }
  }
  d.tables.push({
    title: 'Stock movements',
    columns: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'record', label: 'Kind', kind: 'text', width: 0.8 },
      { key: 'what', label: 'Record', kind: 'text', width: 2.6 },
      { key: 'code', label: 'Code', kind: 'text' },
      { key: 'qty', label: 'Pieces', kind: 'int', width: 0.6 },
      { key: 'from', label: 'From', kind: 'text', width: 1.4 },
      { key: 'to', label: 'To', kind: 'text', width: 1.4 },
      { key: 'by', label: 'By', kind: 'text', width: 0.8 },
      { key: 'cancelled', label: 'Cancelled', kind: 'text', width: 0.8 },
      { key: 'id', label: 'Record id', kind: 'text', width: 1.4 },
    ],
    rows,
  });
  d.tables.push({
    title: 'Stock adjustments',
    columns: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'place', label: 'Place', kind: 'text' },
      { key: 'reason', label: 'Reason', kind: 'text' },
      { key: 'code', label: 'Code', kind: 'text' },
      { key: 'change', label: 'Change', kind: 'int', width: 0.6 },
      { key: 'note', label: 'Note', kind: 'text', width: 2 },
      { key: 'by', label: 'By', kind: 'text' },
      { key: 'cancelled', label: 'Cancelled', kind: 'text', width: 0.8 },
      { key: 'id', label: 'Record id', kind: 'text', width: 1.4 },
    ],
    rows: adj,
  });
  return finish(d);
}

/* ------------------------------------------------------------------ */
/* Shipments                                                           */
/* ------------------------------------------------------------------ */

export type ShipmentFilter = 'all' | 'open' | 'received';
const SHIP_STATUS_TEXT: Record<Shipment['status'], string> = { in_transit: 'On the way', partial: 'Partly received', received: 'Received', voided: 'Cancelled' };

export function selectShipments(ledger: Ledger, f: ShipmentFilter): Shipment[] {
  return ledger
    .list<Shipment>('shipment')
    .filter((s) => (f === 'open' ? s.status === 'in_transit' || s.status === 'partial' : f === 'received' ? s.status === 'received' : true))
    .sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code));
}

export function shipmentsReport(ctx: ReportCtx, f: ShipmentFilter): ReportDoc {
  const showCosts = caps(ctx, 'shipments', 'costs.view');
  const d = start('shipments', ctx, [{ label: 'Shipments', value: f === 'open' ? 'On the way (not fully received)' : f === 'received' ? 'Fully received' : 'All shipments' }], [
    'Each cost stays in the currency it was paid in. Estimates replaced by an actual amount are marked “replaced” and not counted.',
    ...(showCosts ? [] : ['Costs are not included: your account cannot see shipment costs.']),
  ]);
  const list = selectShipments(ctx.ledger, f);
  const srows: Record<string, Cell>[] = [];
  const crows: Record<string, Cell>[] = [];
  const prows: Record<string, Cell>[] = [];
  const krows: Record<string, Cell>[] = [];
  const costTotals = new Map<Currency, number>();
  for (const s of list) {
    const sent = s.lines.reduce((a, l) => a + l.qty, 0);
    const rec = s.lines.reduce((a, l) => a + l.received, 0);
    const miss = s.lines.reduce((a, l) => a + l.missing, 0);
    const weight = s.packages.reduce((a, p) => a + (p.weightKg ?? 0), 0);
    srows.push({ code: s.code, method: METHOD_LABEL[s.method], carrier: s.carrier, from: d.lk.locName(s.fromLocationId), to: d.lk.locName(s.toLocationId), date: s.date, expected: s.expectedDate, status: SHIP_STATUS_TEXT[s.status], sent, received: rec, missing: miss, outstanding: s.status === 'voided' ? 0 : sent - rec - miss, packages: s.packages.length, weight: s.packages.some((p) => p.weightKg !== null) ? Math.round(weight * 10) / 10 : null, note: s.note });
    for (const l of s.lines) {
      const g = d.lk.garment(l.garmentTypeId);
      crows.push({ code: s.code, garment: g?.code ?? '', name: g?.name ?? '', sent: l.qty, received: l.received, missing: l.missing, outstanding: l.qty - l.received - l.missing });
    }
    for (const p of s.packages) prows.push({ code: s.code, label: p.label, weight: p.weightKg });
    if (showCosts) {
      for (const c of s.costs) {
        const counted = !c.voided && !c.supersededBy && s.status !== 'voided';
        krows.push({ code: s.code, date: c.date, kind: SHIP_COST_LABEL[c.category], description: c.description, currency: c.currency, amount: c.amount, estimate: c.status === 'estimated' ? 'Estimate' : 'Actual', reference: c.reference, status: c.voided ? 'Cancelled' : c.supersededBy ? 'Replaced by actual' : 'Counted' });
        if (counted) costTotals.set(c.currency, (costTotals.get(c.currency) ?? 0) + c.amount);
      }
      for (const r of ctx.ledger.ops.values()) {
        if (r.op.type !== 'expense.record' || r.op.payload.shipmentId !== s.id || r.status === 'rejected') continue;
        const p = r.op.payload;
        krows.push({ code: s.code, date: p.date, kind: `Expense · ${EXPENSE_LABEL[p.category]}`, description: p.description, currency: p.currency, amount: p.amount, estimate: 'Actual', reference: '', status: r.voidedBy ? 'Cancelled' : 'Counted as an expense' });
      }
    }
  }
  d.tables.push({
    title: 'Shipments',
    columns: [
      { key: 'code', label: 'Shipment', kind: 'text', width: 0.8 },
      { key: 'method', label: 'How', kind: 'text', width: 0.8 },
      { key: 'carrier', label: 'Carrier', kind: 'text' },
      { key: 'from', label: 'From', kind: 'text' },
      { key: 'to', label: 'To', kind: 'text' },
      { key: 'date', label: 'Dispatched', kind: 'date' },
      { key: 'expected', label: 'Expected', kind: 'date' },
      { key: 'status', label: 'Status', kind: 'text' },
      { key: 'sent', label: 'Sent', kind: 'int', width: 0.6 },
      { key: 'received', label: 'Received', kind: 'int', width: 0.7 },
      { key: 'missing', label: 'Missing', kind: 'int', width: 0.6 },
      { key: 'outstanding', label: 'Still expected', kind: 'int', width: 0.8 },
      { key: 'packages', label: 'Packages', kind: 'int', width: 0.7 },
      { key: 'weight', label: 'Weight (kg)', kind: 'decimal', width: 0.7 },
      { key: 'note', label: 'Note', kind: 'text', width: 1.4 },
    ],
    rows: srows,
  });
  d.tables.push({
    title: 'Shipment contents',
    columns: [
      { key: 'code', label: 'Shipment', kind: 'text' },
      { key: 'garment', label: 'Code', kind: 'text' },
      { key: 'name', label: 'Garment', kind: 'text', width: 1.6 },
      { key: 'sent', label: 'Sent', kind: 'int' },
      { key: 'received', label: 'Received', kind: 'int' },
      { key: 'missing', label: 'Missing', kind: 'int' },
      { key: 'outstanding', label: 'Still expected', kind: 'int' },
    ],
    rows: crows,
  });
  d.tables.push({ title: 'Packages', columns: [{ key: 'code', label: 'Shipment', kind: 'text' }, { key: 'label', label: 'Package', kind: 'text' }, { key: 'weight', label: 'Weight (kg)', kind: 'decimal' }], rows: prows });
  if (showCosts) {
    d.tables.push({
      title: 'Shipment costs and linked expenses',
      columns: [
        { key: 'code', label: 'Shipment', kind: 'text', width: 0.8 },
        { key: 'date', label: 'Date', kind: 'date' },
        { key: 'kind', label: 'Kind', kind: 'text', width: 1.3 },
        { key: 'description', label: 'Description', kind: 'text', width: 1.8 },
        { key: 'currency', label: 'Currency', kind: 'text', width: 0.7 },
        { key: 'amount', label: 'Amount', kind: 'money', currencyKey: 'currency' },
        { key: 'estimate', label: 'Estimate / actual', kind: 'text', width: 0.9 },
        { key: 'reference', label: 'Receipt / ref.', kind: 'text' },
        { key: 'status', label: 'Status', kind: 'text', width: 1.2 },
      ],
      rows: krows,
      totals: [...costTotals].map(([currency, amount]) => ({ code: 'Total', kind: 'Shipment costs counted', currency, amount })),
    });
  }
  return finish(d);
}

/* ------------------------------------------------------------------ */
/* Expenses                                                            */
/* ------------------------------------------------------------------ */

export interface ExpenseFilter {
  from: string | null;
  to: string | null;
  locationId: string | null;
  preset?: string;
}

export interface ExpenseItem {
  opId: string;
  date: string;
  locationId: string;
  category: keyof typeof EXPENSE_LABEL;
  description: string;
  amount: number;
  currency: Currency;
  shipmentId: string | null;
  actorId: string;
  cancelled: boolean;
  pending: boolean;
}

/** Expenses for the Expenses screen and report (cancelled ones included, marked). */
export function selectExpenses(ledger: Ledger, f: ExpenseFilter): ExpenseItem[] {
  const out: ExpenseItem[] = [];
  for (const r of ledger.ops.values()) {
    if (r.op.type !== 'expense.record' || r.status === 'rejected') continue;
    const p = r.op.payload;
    if (!inRange(p.date, f.from, f.to) || (f.locationId && p.locationId !== f.locationId)) continue;
    out.push({ opId: r.op.id, date: p.date, locationId: p.locationId, category: p.category, description: p.description, amount: p.amount, currency: p.currency, shipmentId: p.shipmentId, actorId: r.op.actorId, cancelled: Boolean(r.voidedBy), pending: r.status === 'pending' });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.opId.localeCompare(a.opId));
}

export function expenseTotals(items: ExpenseItem[]): Map<Currency, number> {
  const t = new Map<Currency, number>();
  for (const e of items) if (!e.cancelled) t.set(e.currency, (t.get(e.currency) ?? 0) + e.amount);
  return t;
}

export function expensesReport(ctx: ReportCtx, f: ExpenseFilter): ReportDoc {
  const d = start('expenses', ctx, [], ['Business expenses only. Money workers spent during a sales day is in the sales-days report.', 'Cancelled expenses are listed but not counted in the totals. Each amount is in the currency it was paid in.']);
  d.filters = [
    { label: 'Dates', value: `${f.preset ? `${f.preset}: ` : ''}${rangeText(f.from, f.to)}` },
    { label: 'Place', value: f.locationId ? d.lk.locName(f.locationId) : 'All places' },
  ];
  const items = selectExpenses(ctx.ledger, f);
  d.tables.push({
    title: 'Expenses',
    columns: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'place', label: 'Place', kind: 'text' },
      { key: 'kind', label: 'Kind', kind: 'text' },
      { key: 'description', label: 'What for', kind: 'text', width: 2 },
      { key: 'currency', label: 'Currency', kind: 'text', width: 0.7 },
      { key: 'amount', label: 'Amount', kind: 'money', currencyKey: 'currency' },
      { key: 'shipment', label: 'Shipment', kind: 'text', width: 0.8 },
      { key: 'by', label: 'By', kind: 'text', width: 0.8 },
      { key: 'status', label: 'Status', kind: 'text', width: 0.9 },
      { key: 'id', label: 'Record id', kind: 'text', width: 1.4 },
    ],
    rows: items.map((e) => ({ date: e.date, place: d.lk.locName(e.locationId), kind: EXPENSE_LABEL[e.category], description: e.description, currency: e.currency, amount: e.amount, shipment: e.shipmentId ? ((ctx.ledger.get(K.shipment(e.shipmentId)) as Shipment | undefined)?.code ?? '') : '', by: ctx.meta?.(e.opId)?.actorName ?? d.lk.personName(e.actorId), status: e.cancelled ? 'Cancelled' : e.pending ? 'Not synced yet' : 'Counted', id: e.opId })),
    totals: [...expenseTotals(items)].map(([currency, amount]) => ({ date: 'Total', description: 'Counted expenses', currency, amount })),
  });
  return finish(d);
}

/* ------------------------------------------------------------------ */
/* Activity log                                                        */
/* ------------------------------------------------------------------ */

export interface ActivityFilter {
  from: string | null;
  who: string | null;
  group: string | null;
  flagged: boolean;
}

export function selectActivity(ctx: Pick<ReportCtx, 'ledger' | 'meta'>, f: ActivityFilter) {
  return [...ctx.ledger.ops.values()]
    .map((o) => ({ o, rec: ctx.meta?.(o.op.id) }))
    .filter(({ o }) => !f.from || businessDate(o.op.deviceTime) >= f.from)
    .filter(({ o }) => !f.who || o.op.actorId === f.who || (o.op.payload as { workerId?: string }).workerId === f.who)
    .filter(({ o }) => !f.group || OP_GROUP[o.op.type] === f.group)
    .filter(({ o, rec }) => !f.flagged || o.status === 'rejected' || (rec?.flags ?? []).length > 0)
    .sort((a, b) => b.o.op.deviceTime.localeCompare(a.o.op.deviceTime));
}

export function activityReport(ctx: ReportCtx, f: ActivityFilter): ReportDoc {
  const d = start('activity', ctx, [], ['Device time is when the record was saved on the device; server time is when it reached the server. Nothing in the log can be edited or deleted.']);
  d.filters = [
    { label: 'Dates', value: f.from ? `From ${fmtDate(f.from)}` : 'All dates' },
    { label: 'Person', value: f.who ? d.lk.personName(f.who) : 'Everyone' },
    { label: 'Kind', value: f.group ?? 'All kinds' },
    { label: 'Only warnings', value: f.flagged ? 'Yes' : 'No' },
  ];
  d.tables.push({
    title: 'Activity log',
    columns: [
      { key: 'deviceTime', label: 'Device time', kind: 'datetime' },
      { key: 'serverTime', label: 'Server time', kind: 'datetime' },
      { key: 'by', label: 'By', kind: 'text', width: 0.8 },
      { key: 'kind', label: 'Kind', kind: 'text', width: 0.8 },
      { key: 'what', label: 'Record', kind: 'text', width: 3 },
      { key: 'status', label: 'Status', kind: 'text', width: 0.9 },
      { key: 'cancelled', label: 'Cancelled', kind: 'text', width: 0.7 },
      { key: 'warnings', label: 'Warnings', kind: 'text', width: 1.2 },
      { key: 'id', label: 'Record id', kind: 'text', width: 1.4 },
    ],
    rows: selectActivity(ctx, f).map(({ o, rec }) => ({
      deviceTime: o.op.deviceTime,
      serverTime: rec?.serverTime ?? null,
      by: rec?.actorName ?? d.lk.personName(o.op.actorId),
      kind: OP_GROUP[o.op.type],
      what: describeOp(o.op, d.lk, ctx.ledger),
      status: o.review ? LATE_TEXT[o.review] : o.status === 'rejected' ? 'Not accepted' : o.status === 'pending' ? 'Not synced yet' : 'Synced',
      cancelled: o.voidedBy ? 'Yes' : '',
      warnings: (rec?.flags ?? []).map((x) => FLAG_LABEL[x.code]).join(', '),
      id: o.op.id,
    })),
  });
  return finish(d);
}

/* ------------------------------------------------------------------ */
/* People & devices                                                    */
/* ------------------------------------------------------------------ */

export function peopleReport(ctx: ReportCtx, data: PeopleResponse): ReportDoc {
  const d = start('people', ctx, [{ label: 'People', value: 'Everyone with an account' }], ['Access codes, device secrets and sign-in tokens are never included.']);
  const name = (id: string) => data.people.find((p) => p.id === id)?.name ?? 'Someone';
  d.tables.push({
    title: 'People',
    columns: [
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'role', label: 'Role', kind: 'text', width: 0.7 },
      { key: 'active', label: 'Active', kind: 'text', width: 0.6 },
      { key: 'place', label: 'Place', kind: 'text' },
      { key: 'locked', label: 'Locked', kind: 'text', width: 1 },
      { key: 'failed', label: 'Wrong codes', kind: 'int', width: 0.6 },
      { key: 'pinSet', label: 'Code set', kind: 'datetime' },
      { key: 'created', label: 'Added', kind: 'datetime' },
      { key: 'caps', label: 'Permissions', kind: 'text', width: 3 },
    ],
    rows: data.people.map((p) => ({ name: p.name, role: ROLE_LABEL[p.role], active: p.active ? 'Yes' : 'No', place: d.lk.locName(p.locationId), locked: p.hardLocked ? 'Locked by owner rule' : p.lockedUntil && Date.parse(p.lockedUntil) > Date.now() ? 'Temporarily' : '', failed: p.failedCount, pinSet: p.pinSetAt, created: p.createdAt, caps: p.caps.join(', ') })),
  });
  d.tables.push({
    title: 'Devices',
    columns: [
      { key: 'code', label: 'Device code', kind: 'text', width: 0.8 },
      { key: 'label', label: 'Label', kind: 'text' },
      { key: 'created', label: 'First seen', kind: 'datetime' },
      { key: 'last', label: 'Last seen', kind: 'datetime' },
      { key: 'blocked', label: 'Blocked', kind: 'datetime' },
      { key: 'access', label: 'Allowed for', kind: 'text', width: 2.4 },
    ],
    rows: data.devices.map((v) => ({ code: v.code, label: v.label, created: v.createdAt, last: v.lastSeenAt, blocked: v.revokedAt, access: v.access.map((a) => `${name(a.userId)}: ${a.status}`).join('; ') })),
  });
  return finish(d);
}

/* ------------------------------------------------------------------ */
/* Profit                                                              */
/* ------------------------------------------------------------------ */

export function rateText(u: RateUse): string {
  return `1 ${u.from} = ${Number(u.rate.toPrecision(8))} ${u.to}${u.inverse ? ` (from 1 ${u.recorded.from} = ${u.recorded.rate} ${u.recorded.to})` : ''}`;
}

/** The profit report exactly as computed for the screen. */
export function profitDoc(ctx: ReportCtx, r: ProfitReport, f: { locationId: string | null; preset?: string }): ReportDoc {
  const d = start('profit', ctx, [], [
    'Sales value counts only closed sales days dated in the period, at the prices recorded when each day was closed.',
    'Garment cost = pieces sold × average purchase price of that garment type (accepted pieces only).',
    'Shipment costs and expenses count in the period they are dated. They are not yet spread per piece.',
    `Conversion: ${CONVERSION_BASIS_LABEL[r.basis]}. Each amount stays saved in the currency it was paid in; the original amounts are shown beside every converted line.`,
    ...(r.complete ? [] : [`INCOMPLETE: ${[...r.missingRates.map((m) => `no exchange rate ${m}`), ...r.missingCosts.map((c) => `no purchase cost for ${c}`)].join('; ')}. Those amounts are left out, so the totals are partial.`]),
  ]);
  d.filters = [
    { label: 'Period', value: `${f.preset ? `${f.preset}: ` : ''}${rangeText(r.from, r.to)}` },
    { label: 'Place', value: f.locationId ? d.lk.locName(f.locationId) : 'All places' },
    { label: 'Shown in', value: r.currency },
    { label: 'Rates', value: r.basis === 'market' ? 'Today’s market reference' : 'Recorded rate on each transaction date' },
  ];
  const cur = r.currency;
  const line = (item: string, amount: number, original: Partial<Record<Currency, number>> | null, note = '') => ({ item, amount, original: original ? totalsText(original) : '', note });
  d.tables.push({
    title: 'Profit for the period',
    columns: [
      { key: 'item', label: 'Line', kind: 'text', width: 2 },
      { key: 'amount', label: `Amount (${cur})`, kind: 'money', currency: cur },
      { key: 'original', label: 'Original amounts (as paid)', kind: 'text', width: 2 },
      { key: 'note', label: 'Note', kind: 'text', width: 1.6 },
    ],
    rows: [
      line(`Sales value (${r.piecesSold} pieces, ${r.counts.closedDays} closed days)`, r.salesValue, r.original.sales),
      line('− Cost of those garments', -r.costOfGoods, r.original.costOfGoods, r.missingCosts.length ? `No cost known for ${r.missingCosts.join(', ')}` : ''),
      line('= Gross margin', r.grossMargin, null),
      line('− Cash short (+) / over (−) from sales days', -r.cashDifference, r.original.cashDifference),
      line('− Spent by workers from sales', -r.workerExpenses, r.original.workerExpenses),
      line('− Shipment costs', -r.shipmentCosts, r.original.shipmentCosts, `${r.counts.shipmentCostLines} cost lines${r.estimatedShipmentCosts ? `; includes ${formatMoney(cur, r.estimatedShipmentCosts)} of estimates` : ''}`),
      line('− Other expenses', -r.expenses, r.original.expenses, `${r.counts.expenseLines} expenses`),
      line(r.complete ? '= Net for the period' : '= Net for the period (INCOMPLETE)', r.periodNet, null),
    ],
  });
  d.tables.push({
    title: 'By garment',
    columns: [
      { key: 'code', label: 'Code', kind: 'text' },
      { key: 'name', label: 'Garment', kind: 'text', width: 1.6 },
      { key: 'sold', label: 'Sold', kind: 'int', width: 0.6 },
      { key: 'sales', label: `Sales (${cur})`, kind: 'money', currency: cur },
      { key: 'cost', label: `Garment cost (${cur})`, kind: 'money', currency: cur },
      { key: 'costOriginal', label: 'Garment cost as paid', kind: 'text', width: 1.4 },
      { key: 'margin', label: `Margin (${cur})`, kind: 'money', currency: cur },
    ],
    rows: r.byGarment.map((g) => {
      const gt = d.lk.garment(g.gt);
      return { code: gt?.code ?? g.gt, name: gt?.name ?? '', sold: g.sold, sales: g.sales, cost: g.cost, costOriginal: totalsText(g.costOriginal), margin: g.cost === null ? null : g.sales - g.cost };
    }),
  });
  d.tables.push({
    title: 'Exchange rates used',
    note: r.ratesUsed.length ? 'Amounts already in the report currency are not converted.' : 'No conversion was needed.',
    columns: [
      { key: 'pair', label: 'Rate', kind: 'text', width: 2.2 },
      { key: 'date', label: 'Valid from / published', kind: 'date' },
      { key: 'basis', label: 'Basis', kind: 'text', width: 1.2 },
      { key: 'source', label: 'Source', kind: 'text', width: 2.4 },
    ],
    rows: r.ratesUsed.map((u) => ({ pair: rateText(u), date: u.effectiveDate, basis: RATE_BASIS_LABEL[u.basis], source: u.source })),
  });
  const kinds: Record<string, Cell>[] = [
    ...Object.entries(r.shipmentCostsByCategory).map(([k, v]) => ({ kind: `Shipment · ${SHIP_COST_LABEL[k as keyof typeof SHIP_COST_LABEL] ?? k}`, amount: v })),
    ...Object.entries(r.expensesByCategory).map(([k, v]) => ({ kind: `Expense · ${EXPENSE_LABEL[k as keyof typeof EXPENSE_LABEL] ?? k}`, amount: v })),
  ];
  d.tables.push({ title: 'Costs by kind', columns: [{ key: 'kind', label: 'Kind', kind: 'text', width: 2 }, { key: 'amount', label: `Amount (${cur})`, kind: 'money', currency: cur }], rows: kinds });
  return finish(d);
}

export type { Table };
