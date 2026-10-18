// A downloadable report, independent of file format. Builders in reports.ts
// produce one from the same records and query functions the screens use; the
// CSV, Excel and PDF writers only lay it out. Money stays an integer amount in
// minor units with its own currency until the writer formats it.

import { CURRENCIES, formatMoney, isCurrency, type Currency } from './money';
import type { ReportId } from './report-catalog';
import { BUSINESS_OFFSET_MIN } from './time';

export type CellKind = 'text' | 'int' | 'money' | 'date' | 'datetime' | 'decimal';
export type Cell = string | number | null;

export interface Column {
  key: string;
  label: string;
  kind: CellKind;
  /** For money: the column holding each row's currency code… */
  currencyKey?: string;
  /** …or one currency for the whole column. */
  currency?: Currency;
  /** Relative width hint for PDF layout (default 1). */
  width?: number;
}

export interface Table {
  title: string;
  columns: Column[];
  rows: Record<string, Cell>[];
  /** Summary rows (e.g. totals per currency), shown after the rows. */
  totals?: Record<string, Cell>[];
  /** Shown under the table title. */
  note?: string;
}

export interface ReportDoc {
  id: ReportId;
  title: string;
  business: string;
  /** Every filter applied, in words. Exports must contain exactly these records. */
  filters: { label: string; value: string }[];
  generatedAt: string;
  generatedBy: string;
  /** Definitions, calculation rules and warnings. */
  notes: string[];
  tables: Table[];
}

export function filterSummary(doc: Pick<ReportDoc, 'filters'>): string {
  return doc.filters.map((f) => `${f.label}: ${f.value}`).join(' · ');
}

export function rowCount(doc: ReportDoc): number {
  return doc.tables.reduce((s, t) => s + t.rows.length, 0);
}

export function cellCurrency(col: Column, row: Record<string, Cell>): Currency | null {
  if (col.currency) return col.currency;
  const c = col.currencyKey ? row[col.currencyKey] : null;
  return typeof c === 'string' && isCurrency(c) ? c : null;
}

/** Money cell → number in major units (KSh 1,500.00 → 1500). */
export function moneyMajor(minor: number, currency: Currency): number {
  return minor / 10 ** CURRENCIES[currency].exp;
}

/** Business-time "2026-10-18 09:05" for an ISO instant. */
export function businessDateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms + BUSINESS_OFFSET_MIN * 60_000).toISOString().slice(0, 16).replace('T', ' ');
}

/** A cell as text for CSV/PDF. Money is formatted with its currency in PDF, plain in CSV. */
export function cellText(col: Column, row: Record<string, Cell>, mode: 'csv' | 'pdf'): string {
  const v = row[col.key];
  if (v === null || v === undefined || v === '') return '';
  switch (col.kind) {
    case 'money': {
      if (typeof v !== 'number') return String(v);
      const cur = cellCurrency(col, row);
      if (!cur) return String(v);
      // Keep the currency and the amount together on one line.
      if (mode === 'pdf') return formatMoney(cur, v).replace(' ', String.fromCharCode(0xa0)); // non-breaking space
      const exp = CURRENCIES[cur].exp;
      return (v / 10 ** exp).toFixed(exp);
    }
    case 'int':
      return typeof v === 'number' ? (mode === 'pdf' ? v.toLocaleString('en-US') : String(v)) : String(v);
    case 'decimal':
      return typeof v === 'number' ? String(v) : String(v);
    case 'datetime':
      return typeof v === 'string' ? businessDateTime(v) : String(v);
    default:
      return String(v);
  }
}

export const TIME_NOTE = 'Dates are business dates and times are East Africa Time (UTC+03:00), which is also the time in the Comoros.';
