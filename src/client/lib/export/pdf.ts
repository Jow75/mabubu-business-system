// PDF writer (loaded only when someone downloads a PDF). A4, with the report
// title, filters, generation time and notes first; tables repeat their
// header on every page, long text wraps instead of being cut, and every page
// carries "page x of y".

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { businessDateTime, cellText, type ReportDoc } from '../../../shared/report-doc';

// The built-in PDF fonts cover Latin-1 only; replace the few other symbols we use.
export function pdfSafe(s: string): string {
  return s
    .replace(/[−–—]/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, '->')
    .replace(/…/g, '...')
    .replace(/€ ?/g, 'EUR ')
    .replace(/[^\u0000-ÿ]/g, '?');
}

const INDIGO: [number, number, number] = [46, 58, 135];
const INK: [number, number, number] = [33, 30, 26];
const SOFT: [number, number, number] = [104, 98, 90];
const PAPER: [number, number, number] = [247, 243, 236];

export function toPdf(doc: ReportDoc): Uint8Array {
  const wide = doc.tables.some((t) => t.columns.length > 7);
  const pdf = new jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  pdf.setProperties({ title: pdfSafe(`${doc.business} - ${doc.title}`), author: pdfSafe(doc.generatedBy), creator: 'Mabubu' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 36;
  const generated = `${businessDateTime(doc.generatedAt)} (East Africa Time) by ${doc.generatedBy}`;
  let y = M;

  const text = (s: string, size: number, opts: { bold?: boolean; color?: [number, number, number]; gap?: number } = {}) => {
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...(opts.color ?? INK));
    const lines = pdf.splitTextToSize(pdfSafe(s), W - 2 * M) as string[];
    for (const line of lines) {
      if (y + size > H - M - 14) {
        pdf.addPage();
        y = M + 20;
      }
      pdf.text(line, M, y + size);
      y += size * 1.3;
    }
    y += opts.gap ?? 0;
  };

  text(doc.business.toUpperCase(), 9, { bold: true, color: INDIGO, gap: 2 });
  text(doc.title, 18, { bold: true, gap: 6 });
  for (const f of doc.filters) text(`${f.label}: ${f.value}`, 9.5, { color: SOFT });
  text(`Generated ${generated}`, 9.5, { color: SOFT, gap: 6 });
  for (const n of doc.notes) text(`• ${n}`, 8.5, { color: SOFT });
  y += 8;

  for (const t of doc.tables) {
    if (y > H - M - 80) {
      pdf.addPage();
      y = M + 20;
    }
    text(t.title, 12, { bold: true, gap: 2 });
    if (t.note) text(t.note, 8.5, { color: SOFT, gap: 2 });
    if (!t.rows.length) {
      text('No records match these filters.', 9, { color: SOFT, gap: 10 });
      continue;
    }
    const numeric = (k: string) => ['int', 'money', 'decimal'].includes(k);
    const many = t.columns.length > 10;
    autoTable(pdf, {
      startY: y + 2,
      margin: { left: M, right: M, top: M + 20, bottom: M + 10 },
      head: [t.columns.map((c) => pdfSafe(c.label))],
      body: t.rows.map((r) => t.columns.map((c) => pdfSafe(cellText(c, r, 'pdf')))),
      foot: t.totals?.length ? t.totals.map((r) => t.columns.map((c) => pdfSafe(cellText(c, r, 'pdf')))) : undefined,
      showHead: 'everyPage',
      showFoot: 'lastPage',
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: many ? 6.5 : 8, cellPadding: many ? 2.5 : 3.5, overflow: 'linebreak', textColor: INK, lineColor: [221, 213, 199], lineWidth: 0.4, valign: 'top' },
      headStyles: { fillColor: INDIGO, textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: PAPER, textColor: INK, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 250, 246] },
      columnStyles: Object.fromEntries(t.columns.map((c, i) => [i, numeric(c.kind) ? { halign: 'right' as const } : {}])),
    });
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  }

  // Running header and page numbers on every page.
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...SOFT);
    if (i > 1) pdf.text(pdfSafe(`${doc.business} - ${doc.title}`), M, M);
    pdf.text(pdfSafe(`Generated ${generated}`), M, H - M / 2);
    pdf.text(`Page ${i} of ${pages}`, W - M, H - M / 2, { align: 'right' });
  }
  return new Uint8Array(pdf.output('arraybuffer'));
}
