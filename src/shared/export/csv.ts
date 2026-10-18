// CSV: a short heading block (report, filters, time), then each table with
// its column names. Money is a plain number in the currency's own units with
// the currency in its own column, so spreadsheets can add it up.

import { businessDateTime, cellText, filterSummary, type Cell, type ReportDoc } from '../report-doc';

const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(doc: ReportDoc): string {
  const lines: string[][] = [
    [`${doc.business} — ${doc.title}`],
    ['Filters', filterSummary(doc)],
    ['Generated', `${businessDateTime(doc.generatedAt)} (East Africa Time) by ${doc.generatedBy}`],
    ...doc.notes.map((n) => ['Note', n]),
  ];
  for (const t of doc.tables) {
    lines.push([]);
    lines.push([t.title]);
    if (t.note) lines.push(['Note', t.note]);
    lines.push(t.columns.map((c) => c.label));
    const out = (row: Record<string, Cell>) => t.columns.map((c) => cellText(c, row, 'csv'));
    for (const r of t.rows) lines.push(out(r));
    for (const r of t.totals ?? []) lines.push(out(r));
  }
  return '﻿' + lines.map((l) => l.map(esc).join(',')).join('\r\n') + '\r\n';
}
