// Turn a report into a file on this device and hand it to the browser. The
// download is also written to the server's log (when online and not in demo).

import type { ExportFormat } from '../../../shared/report-catalog';
import { filterSummary, rowCount, type ReportDoc } from '../../../shared/report-doc';
import { toCsv } from '../../../shared/export/csv';
import { toXlsx } from '../../../shared/export/xlsx';
import { businessDate } from '../../../shared/time';
import { api } from '../api';
import { downloadBlob } from '../csv';
import { store } from '../store';

export const FORMAT_INFO: Record<ExportFormat, { label: string; ext: string; mime: string; hint: string }> = {
  pdf: { label: 'PDF', ext: 'pdf', mime: 'application/pdf', hint: 'To read, print or share' },
  xlsx: { label: 'Excel', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hint: 'Spreadsheet with numbers you can add up' },
  csv: { label: 'CSV', ext: 'csv', mime: 'text/csv;charset=utf-8', hint: 'Plain table for any spreadsheet program' },
};

export async function makeFile(doc: ReportDoc, format: ExportFormat): Promise<Blob> {
  const { mime } = FORMAT_INFO[format];
  if (format === 'csv') return new Blob([toCsv(doc)], { type: mime });
  if (format === 'xlsx') return new Blob([toXlsx(doc) as BlobPart], { type: mime });
  const { toPdf } = await import('./pdf');
  return new Blob([toPdf(doc) as BlobPart], { type: mime });
}

/** Build, download and log. Returns whether the download was written to the server log. */
export async function exportReport(doc: ReportDoc, format: ExportFormat): Promise<{ logged: boolean }> {
  const blob = await makeFile(doc, format);
  downloadBlob(`mabubu-${doc.id}-${businessDate()}.${FORMAT_INFO[format].ext}`, blob);
  const snap = store.getSnapshot();
  if (snap.demo || !store.token || !navigator.onLine) return { logged: false };
  try {
    await api('POST', '/audit/export', { report: doc.id, format, rows: rowCount(doc), filters: filterSummary(doc).slice(0, 500) }, store.token);
    return { logged: true };
  } catch {
    return { logged: false };
  }
}
