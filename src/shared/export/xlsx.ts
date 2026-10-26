// Excel (.xlsx) writer. One "About" sheet with the NAS Mabubu System logo and
// letterhead, the report, filters, time and notes, then one sheet per table
// with a bold, frozen, filterable header row (the logo stays on "About" so the
// data sheets remain plain tables that sort and filter).
// Amounts are real numbers (not text) with the currency in its own column;
// dates are real Excel dates. Written by hand to keep the app small.

import { CURRENCIES } from '../money';
import { businessDateTime, cellCurrency, contactLine, filterSummary, moneyMajor, pngSize, type Branding, type Cell, type Column, type ReportDoc, type Table } from '../report-doc';
import { zip } from './zip';

// Style indexes into cellXfs below.
const S = { text: 0, head: 1, int: 2, money2: 3, date: 4, boldInt: 5, boldMoney2: 6, bold: 7, title: 8, wrap: 9 } as const;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDE7DC"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF2E3A87"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export const xmlEsc = (s: string) =>
  s
    // Characters XML 1.0 does not allow.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Excel serial date for YYYY-MM-DD (days since 1899-12-30). */
export function excelDate(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`) / 86_400_000 + 25569;
}

type XCell = { kind: 'str'; v: string; s: number } | { kind: 'num'; v: number; s: number } | null;

function toXCell(col: Column, row: Record<string, Cell>, bold: boolean): XCell {
  const v = row[col.key];
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string' && col.kind !== 'text' && col.kind !== 'datetime' && !(col.kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v))) {
    return { kind: 'str', v, s: bold ? S.bold : S.text };
  }
  switch (col.kind) {
    case 'int':
      return { kind: 'num', v: Number(v), s: bold ? S.boldInt : S.int };
    case 'decimal':
      return { kind: 'num', v: Number(v), s: S.text };
    case 'money': {
      const cur = cellCurrency(col, row);
      if (!cur || typeof v !== 'number') return { kind: 'str', v: String(v), s: S.text };
      const two = CURRENCIES[cur].exp > 0;
      return { kind: 'num', v: moneyMajor(v, cur), s: two ? (bold ? S.boldMoney2 : S.money2) : bold ? S.boldInt : S.int };
    }
    case 'date':
      return { kind: 'num', v: excelDate(String(v)), s: S.date };
    case 'datetime':
      return { kind: 'str', v: businessDateTime(String(v)), s: bold ? S.bold : S.text };
    default:
      return { kind: 'str', v: String(v), s: bold ? S.bold : S.text };
  }
}

function cellXml(ref: string, c: XCell): string {
  if (!c) return '';
  if (c.kind === 'num') return Number.isFinite(c.v) ? `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>` : '';
  return `<c r="${ref}" s="${c.s}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.v)}</t></is></c>`;
}

function sheetXml(rows: XCell[][], opts: { widths: number[]; header: boolean; drawing?: boolean }): string {
  const cols = opts.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const body = rows.map((r, i) => `<row r="${i + 1}">${r.map((c, j) => cellXml(`${colName(j)}${i + 1}`, c)).join('')}</row>`).join('');
  const lastCol = colName(Math.max(0, opts.widths.length - 1));
  const view = opts.header
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const filter = opts.header && rows.length > 1 ? `<autoFilter ref="A1:${lastCol}${rows.length}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${view}<sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${body}</sheetData>${filter}${opts.drawing ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
}

function tableRows(t: Table): { rows: XCell[][]; widths: number[] } {
  const header: XCell[] = t.columns.map((c) => ({ kind: 'str', v: c.label, s: S.head }));
  const rows: XCell[][] = [header];
  const widths = t.columns.map((c) => Math.min(40, Math.max(8, c.label.length + 2)));
  const add = (r: Record<string, Cell>, bold: boolean) => {
    const cells = t.columns.map((c) => toXCell(c, r, bold));
    cells.forEach((x, i) => {
      if (x?.kind === 'str') widths[i] = Math.min(60, Math.max(widths[i]!, x.v.length + 2));
      else if (x?.kind === 'num') widths[i] = Math.max(widths[i]!, 12);
    });
    rows.push(cells);
  };
  for (const r of t.rows) add(r, false);
  for (const r of t.totals ?? []) add(r, true);
  return { rows, widths };
}

/** Sheet names: max 31 characters, no []:*?/\ and unique. */
function sheetNames(titles: string[]): string[] {
  const used = new Set<string>();
  return titles.map((t) => {
    const base = t.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`;
    used.add(name.toLowerCase());
    return name;
  });
}

/** The logo on the About sheet, its top-left corner at A1, 64 px square (EMU: 9525 per pixel). */
function drawingXml(w: number, h: number): string {
  const cx = 64 * 9525;
  const cy = Math.round((cx * h) / w);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo" descr="NAS Mabubu System logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;
}

export function toXlsx(doc: ReportDoc, brand: Branding = {}): Uint8Array {
  const enc = new TextEncoder();
  const logo = brand.logoPng ? pngSize(brand.logoPng) : null;
  const contacts = contactLine(doc);
  const about: XCell[][] = [
    // Letterhead: beside the logo (A1:A4) when there is one.
    [null, { kind: 'str', v: doc.app, s: S.title }],
    [null, { kind: 'str', v: doc.business, s: S.bold }],
    [null, contacts ? { kind: 'str', v: contacts, s: S.text } : null],
    [],
    [{ kind: 'str', v: doc.title, s: S.title }],
    [],
    [{ kind: 'str', v: 'Filters', s: S.bold }, { kind: 'str', v: filterSummary(doc) || 'None', s: S.wrap }],
    ...doc.filters.map((f): XCell[] => [{ kind: 'str', v: `  ${f.label}`, s: S.text }, { kind: 'str', v: f.value, s: S.text }]),
    [{ kind: 'str', v: 'Generated', s: S.bold }, { kind: 'str', v: `${businessDateTime(doc.generatedAt)} (East Africa Time) by ${doc.generatedBy}`, s: S.text }],
    [],
    [{ kind: 'str', v: 'Sheets', s: S.bold }],
    ...doc.tables.map((t): XCell[] => [{ kind: 'str', v: `  ${t.title}`, s: S.text }, { kind: 'str', v: `${t.rows.length} rows${t.note ? ` — ${t.note}` : ''}`, s: S.text }]),
    [],
    [{ kind: 'str', v: 'Notes', s: S.bold }],
    ...doc.notes.map((n): XCell[] => [{ kind: 'str', v: '', s: S.text }, { kind: 'str', v: n, s: S.wrap }]),
  ];
  const names = sheetNames(['About', ...doc.tables.map((t) => t.title)]);
  const sheets = [sheetXml(about, { widths: [22, 110], header: false, drawing: Boolean(logo) }), ...doc.tables.map((t) => {
    const { rows, widths } = tableRows(t);
    return sheetXml(rows, { widths, header: true });
  })];
  const files = [
    {
      name: '[Content_Types].xml',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${logo ? '<Default Extension="png" ContentType="image/png"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    },
    {
      name: 'docProps/core.xml',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(`${doc.app} — ${doc.business} — ${doc.title}`)}</dc:title><dc:creator>${xmlEsc(doc.generatedBy)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${doc.generatedAt.slice(0, 19)}Z</dcterms:created></cp:coreProperties>`,
    },
    {
      name: 'xl/workbook.xml',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', xml: STYLES },
    ...sheets.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, xml })),
  ];
  if (logo) {
    files.push(
      {
        name: 'xl/worksheets/_rels/sheet1.xml.rels',
        xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`,
      },
      { name: 'xl/drawings/drawing1.xml', xml: drawingXml(logo.w, logo.h) },
      {
        name: 'xl/drawings/_rels/drawing1.xml.rels',
        xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`,
      },
    );
  }
  const entries: { name: string; data: Uint8Array }[] = files.map((f) => ({ name: f.name, data: enc.encode(f.xml) }));
  if (logo) entries.push({ name: 'xl/media/image1.png', data: brand.logoPng! });
  return zip(entries, new Date(doc.generatedAt));
}
