// Turn a report into a file on this device and hand it to the browser. The
// download is also written to the server's log (when online and not in demo).

import type { ExportFormat } from '../../../shared/report-catalog';
import { filterSummary, rowCount, type ReportDoc } from '../../../shared/report-doc';
import { toCsv } from '../../../shared/export/csv';
import { toXlsx } from '../../../shared/export/xlsx';
import { toDocx } from '../../../shared/export/docx';
import { LOGO } from '../../../shared/brand';
import type { Branding } from '../../../shared/report-doc';
import { businessDate } from '../../../shared/time';
import { api } from '../api';
import { downloadBlob } from '../csv';
import { store } from '../store';

export const FORMAT_INFO: Record<ExportFormat, { label: string; ext: string; mime: string; hint: string }> = {
  pdf: { label: 'PDF', ext: 'pdf', mime: 'application/pdf', hint: 'To read, print or share' },
  docx: { label: 'Word', ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', hint: 'A document you can print, edit or attach' },
  xlsx: { label: 'Excel', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hint: 'Spreadsheet with numbers you can add up' },
  csv: { label: 'CSV', ext: 'csv', mime: 'text/csv;charset=utf-8', hint: 'Plain table for any spreadsheet program' },
};

/**
 * The logo printed on reports (kept for offline use by the service worker).
 * Without it — not loaded yet, no connection on a first visit — the file is
 * still made, with the name and the same figures, just without the picture.
 */
let logo: Promise<Uint8Array | undefined> | null = null;
function reportLogo(): Promise<Uint8Array | undefined> {
  logo ??= fetch(LOGO.report)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((b) => new Uint8Array(b))
    .catch(() => {
      logo = null;
      return undefined;
    });
  return logo;
}

export async function makeFile(doc: ReportDoc, format: ExportFormat): Promise<Blob> {
  const { mime } = FORMAT_INFO[format];
  // CSV stays a plain table for other programs: no picture.
  if (format === 'csv') return new Blob([toCsv(doc)], { type: mime });
  const brand: Branding = { logoPng: await reportLogo() };
  if (format === 'xlsx') return new Blob([toXlsx(doc, brand) as BlobPart], { type: mime });
  if (format === 'docx') return new Blob([toDocx(doc, brand) as BlobPart], { type: mime });
  const { toPdf } = await import('./pdf');
  return new Blob([toPdf(doc, brand) as BlobPart], { type: mime });
}

/** Build, download and log. Returns whether the download was written to the server log. */
export async function exportReport(doc: ReportDoc, format: ExportFormat): Promise<{ logged: boolean }> {
  const blob = await makeFile(doc, format);
  downloadBlob(`nas-mabubu-${doc.id}-${businessDate()}.${FORMAT_INFO[format].ext}`, blob);
  const snap = store.getSnapshot();
  if (snap.demo || !store.token || !navigator.onLine) return { logged: false };
  try {
    await api('POST', '/audit/export', { report: doc.id, format, rows: rowCount(doc), filters: filterSummary(doc).slice(0, 500) }, store.token);
    return { logged: true };
  } catch {
    return { logged: false };
  }
}
