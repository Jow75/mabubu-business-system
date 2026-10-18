import { describe, expect, it } from 'vitest';
import { buildDemo, DEMO_USERS } from '../src/shared/demo-data';
import { Ledger } from '../src/shared/ledger';
import { profitReport } from '../src/shared/queries';
import {
  ReportForbidden,
  activityReport,
  catalogueReport,
  dayTotals,
  expensesReport,
  expenseTotals,
  movementsReport,
  peopleReport,
  profitDoc,
  purchasesReport,
  salesDaysReport,
  salesLinesReport,
  selectDays,
  selectExpenses,
  shipmentsReport,
  stockReport,
  vendorsReport,
  workerRecordsReport,
  type DayFilter,
  type ReportCtx,
} from '../src/shared/reports';
import { rowCount } from '../src/shared/report-doc';
import { toCsv } from '../src/shared/export/csv';
import { toXlsx } from '../src/shared/export/xlsx';
import { unzipStored } from '../src/shared/export/zip';
import { toPdf } from '../src/client/lib/export/pdf';
import { addDays, businessDate } from '../src/shared/time';
import { canSee } from '../src/shared/visibility';

const TODAY = '2026-10-18';
const owner = DEMO_USERS[0]!;
const amina = DEMO_USERS.find((u) => u.name === 'Amina')!;
const directory = DEMO_USERS.map((u) => ({ id: u.id, name: u.name, role: u.role, active: true, locationId: u.locationId }));

function demoLedger(as = owner) {
  const records = buildDemo(TODAY);
  const byId = new Map(records.map((r) => [r.op.id, r.op]));
  const L = new Ledger();
  L.setUsers(as.role === 'worker' ? directory.filter((d) => d.id === as.id) : directory);
  for (const r of records) if (canSee(r.op, 'applied', as, (id) => byId.get(id))) L.apply(r.op, null);
  return L;
}
const ctxFor = (L: Ledger, as = owner): ReportCtx => ({ ledger: L, directory, user: as, now: new Date('2026-10-18T09:00:00Z') });
const last7: DayFilter = { from: addDays(TODAY, -6), to: TODAY, workerId: null, locationId: null, review: 'all', preset: 'Last 7 days' };

describe('report filters select exactly the matching records', () => {
  it('Amina, last 7 days: only Amina’s days in that range, and the filters are written on the report', () => {
    const L = demoLedger();
    const f = { ...last7, workerId: amina.id };
    const doc = salesDaysReport(ctxFor(L), f);
    const rows = doc.tables[0]!.rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.worker).toBe('Amina');
      expect(String(r.date) >= f.from! && String(r.date) <= TODAY).toBe(true);
    }
    // Same selection as the screen.
    expect(rows.length).toBe(selectDays(L, f).length);
    expect(doc.filters).toEqual(expect.arrayContaining([{ label: 'Worker', value: 'Amina' }, expect.objectContaining({ label: 'Dates', value: expect.stringContaining('Last 7 days') })]));
  });

  it('report totals equal the sum of the included rows and the on-screen totals', () => {
    const L = demoLedger();
    const doc = salesDaysReport(ctxFor(L), last7);
    const t = doc.tables[0]!;
    const sumRows = t.rows.filter((r) => r.currency === 'KMF').reduce((s, r) => s + Number(r.sales ?? 0), 0);
    const total = t.totals!.find((r) => r.currency === 'KMF')!;
    expect(total.sales).toBe(sumRows);
    expect(total.sales).toBe(dayTotals(selectDays(L, last7)).find((x) => x.currency === 'KMF')!.sales);
  });

  it('filters by review status (approved / queried / to review)', () => {
    const L = demoLedger();
    const all = { ...last7, from: null, to: null };
    const approved = selectDays(L, { ...all, review: 'approved' });
    const queried = selectDays(L, { ...all, review: 'queried' });
    const toReview = selectDays(L, { ...all, review: 'to_review' });
    const open = selectDays(L, { ...all, review: 'open' });
    expect(approved.length).toBeGreaterThan(0);
    expect(queried.length).toBe(1);
    expect(approved.length + queried.length + toReview.length + open.length).toBe(selectDays(L, all).length);
    expect(salesDaysReport(ctxFor(L), { ...all, review: 'queried' }).tables[0]!.rows[0]!.status).toBe('Queried');
  });

  it('explains the reported “zero sales”: scoping to Mombasa hides every Comoros day', () => {
    const L = demoLedger();
    expect(selectDays(L, last7).length).toBeGreaterThan(5);
    expect(selectDays(L, { ...last7, locationId: 'loc-msa' })).toHaveLength(0);
    const msa = profitReport(L, '2026-10-01', TODAY, 'KMF', 'loc-msa');
    expect(msa.salesValue).toBe(0);
    expect(msa.counts.closedDays).toBe(0);
    // Only the Mombasa expense is left in a Mombasa view — not because the others are gone.
    expect(selectExpenses(L, { from: null, to: null, locationId: 'loc-msa' }).map((e) => e.description)).toEqual(['Lunch and transport on buying day']);
    expect(selectExpenses(L, { from: null, to: null, locationId: null }).length).toBe(2);
  });

  it('uses business time (UTC+3) for dates', () => {
    expect(businessDate('2026-10-17T21:30:00Z')).toBe('2026-10-18');
    expect(businessDate('2026-10-17T20:59:00Z')).toBe('2026-10-17');
  });

  it('expense totals agree between the screen selection and the export, per currency', () => {
    const L = demoLedger();
    const f = { from: null, to: null, locationId: null };
    const doc = expensesReport(ctxFor(L), f);
    const totals = expenseTotals(selectExpenses(L, f));
    expect(doc.tables[0]!.totals!.map((r) => [r.currency, r.amount])).toEqual([...totals]);
    expect(totals.get('KES')).toBe(150_000);
  });

  it('the profit export carries the same numbers as the screen, the original KES amounts and the rates used', () => {
    const L = demoLedger();
    const r = profitReport(L, '2026-10-01', TODAY, 'KMF');
    const doc = profitDoc(ctxFor(L), r, { locationId: null, preset: 'This month' });
    const st = doc.tables[0]!.rows;
    expect(st[0]!.amount).toBe(r.salesValue);
    expect(st[1]!.amount).toBe(-r.costOfGoods);
    expect(st[1]!.original).toContain('KSh');
    expect(st[7]!.amount).toBe(r.periodNet);
    const rates = doc.tables.find((t) => t.title === 'Exchange rates used')!.rows;
    expect(rates.some((x) => String(x.pair).startsWith('1 KES = 3.5 KMF') && String(x.source).includes('DEMO RATE'))).toBe(true);
    expect(rates.some((x) => String(x.pair).startsWith('1 USD = 450 KMF'))).toBe(true);
  });

  it('every report builds from the demo records', () => {
    const L = demoLedger();
    const c = ctxFor(L);
    const docs = [
      salesLinesReport(c, last7),
      workerRecordsReport(c, last7),
      purchasesReport(c, { status: 'all', vendorId: null, payment: 'any', from: null, to: null }),
      vendorsReport(c),
      catalogueReport(c, TODAY),
      stockReport(c, { locationId: null }),
      movementsReport(c, { from: null, to: null, locationId: 'loc-com' }),
      shipmentsReport(c, 'open'),
      activityReport(c, { from: null, who: null, group: null, flagged: false }),
      peopleReport(c, { people: [], devices: [] }),
    ];
    for (const d of docs) expect(d.tables.length).toBeGreaterThan(0);
    expect(rowCount(docs[2]!)).toBeGreaterThan(3);
    expect(docs[7]!.tables[0]!.rows.map((r) => r.code)).toEqual(['AIR-03']);
  });
});

describe('who may download what', () => {
  it('a worker cannot build management reports', () => {
    const L = demoLedger(amina);
    const c = ctxFor(L, amina);
    expect(() => purchasesReport(c, { status: 'all', vendorId: null, payment: 'any', from: null, to: null })).toThrow(ReportForbidden);
    expect(() => vendorsReport(c)).toThrow(ReportForbidden);
    expect(() => profitDoc(c, profitReport(L, '2026-10-01', TODAY, 'KMF'), { locationId: null })).toThrow(ReportForbidden);
    expect(() => activityReport(c, { from: null, who: null, group: null, flagged: false })).toThrow(ReportForbidden);
    expect(() => salesDaysReport(c, last7)).toThrow(ReportForbidden);
  });

  it('even the worker’s own device holds no purchase or vendor records to export', () => {
    const L = demoLedger(amina);
    expect(L.list('purchase')).toHaveLength(0);
    expect(L.list('vendor')).toHaveLength(0);
  });
});

describe('file formats', () => {
  const L = demoLedger();
  const doc = purchasesReport(ctxFor(L), { status: 'all', vendorId: 'ven-yasmin', payment: 'any', from: null, to: null });

  it('CSV keeps the filters, column names, ids and currencies, with numbers as numbers', () => {
    const csv = toCsv(doc);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Filters,"Show: All purchases');
    expect(csv).toContain('Vendor: Mama Yasmin');
    expect(csv).toContain('Date,Vendor,Goods to,How,Pieces,Currency,Value,Owed,Paid,Balance');
    // KSh 47,000 purchase, KSh 30,000 paid, KSh 17,000 balance — plain numbers, own currency column.
    expect(csv).toMatch(/Mama Yasmin,Mombasa,To collect later,500,KES,47000\.00,47000\.00,30000\.00,17000\.00/);
    expect(csv).toContain('pur-yasmin-1');
  });

  it('Excel: a valid package with an About sheet, one sheet per table, and numeric amounts', () => {
    const files = unzipStored(toXlsx(doc));
    expect([...files.keys()]).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']));
    const dec = new TextDecoder();
    const wb = dec.decode(files.get('xl/workbook.xml'));
    expect(wb).toContain('name="About"');
    expect(wb).toContain('name="Purchases"');
    expect(wb).toContain('name="Purchase lines"');
    const about = dec.decode(files.get('xl/worksheets/sheet1.xml'));
    expect(about).toContain('Vendor: Mama Yasmin');
    const sheet = dec.decode(files.get('xl/worksheets/sheet2.xml'));
    expect(sheet).toMatch(/<c r="J2" s="3"><v>17000<\/v><\/c>/); // balance, a real number with 2 decimals format
    expect(sheet).toMatch(/<c r="A2" s="4"><v>\d{5}<\/v><\/c>/); // a real Excel date
    expect(sheet).toContain('<autoFilter ref="A1:');
  });

  it('PDF: a real PDF with the title, filters, data and page numbers', () => {
    const bytes = toPdf(doc);
    const head = new TextDecoder('latin1').decode(bytes.slice(0, 8));
    expect(head.startsWith('%PDF-')).toBe(true);
    const all = new TextDecoder('latin1').decode(bytes);
    expect(all).toContain('%%EOF');
    expect(all).toContain('Mama Yasmin');
    expect(all).toContain('Page 1 of');
    expect(all).toContain(`KSh${String.fromCharCode(0xa0)}17,000`); // currency and amount kept on one line
  });
});
