// Word (.docx) writer, for reports that are printed or handed to a bank or
// another business. Opens with the NAS Mabubu System letterhead (the owner's
// logo, the business name, its contact details and a dashed "stitch" rule),
// then the report title, filters, generation time and notes, and one table per
// section with its header row repeated on every page. Every page's footer
// names the report and carries "Page x of y". Amounts are the report's own
// figures, written exactly as in the PDF. Written by hand, like the Excel
// writer, to keep the app small.

import { businessDateTime, cellText, contactLine, pngSize, type Branding, type Column, type ReportDoc, type Table } from '../report-doc';
import { xmlEsc } from './xlsx';
import { zip } from './zip';

const INDIGO = '2E3A87';
const INK = '211E1A';
const SOFT = '68625A';
const RULE = 'DDD5C7';
const SAFFRON = 'E0A13A';
const PAPER = 'F7F3EC';
/** Logo width on the page: 0.65 inch (EMU: 914400 per inch). */
const LOGO_EMU = 594360;

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

interface RunStyle {
  size?: number;
  bold?: boolean;
  color?: string;
  caps?: boolean;
}

function run(text: string, st: RunStyle = {}): string {
  const rPr = [st.bold ? '<w:b/>' : '', st.caps ? '<w:caps/>' : '', st.color ? `<w:color w:val="${st.color}"/>` : '', st.size ? `<w:sz w:val="${Math.round(st.size * 2)}"/>` : ''].join('');
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`;
}

function para(runs: string, opts: { after?: number; before?: number; align?: 'left' | 'right' | 'center'; keepNext?: boolean; border?: string } = {}): string {
  const pPr = [
    opts.keepNext ? '<w:keepNext/>' : '',
    opts.border ?? '',
    `<w:spacing w:before="${opts.before ?? 0}" w:after="${opts.after ?? 0}"/>`,
    opts.align && opts.align !== 'left' ? `<w:jc w:val="${opts.align}"/>` : '',
  ].join('');
  return `<w:p><w:pPr>${pPr}</w:pPr>${runs}</w:p>`;
}

function logoRun(w: number, h: number): string {
  const cx = LOGO_EMU;
  const cy = Math.round((cx * h) / w);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Logo" descr="NAS Mabubu System logo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

const NO_BORDERS = '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';

/** The letterhead: logo on the left, names and contacts beside it. */
function letterhead(doc: ReportDoc, logo: { w: number; h: number } | null): string {
  const contacts = contactLine(doc);
  const words =
    para(run(doc.app, { size: 13, bold: true, color: INDIGO, caps: true })) +
    para(run(doc.business, { size: 11, color: INK }), { before: 40 }) +
    (contacts ? para(run(contacts, { size: 9, color: SOFT }), { before: 40 }) : '');
  if (!logo) return words;
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${NO_BORDERS}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="1200"/><w:gridCol w:w="8000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${para(logoRun(logo.w, logo.h))}</w:tc><w:tc><w:tcPr><w:tcW w:w="8000" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${words}</w:tc></w:tr></w:tbl>`;
}

const numeric = (c: Column) => c.kind === 'int' || c.kind === 'money' || c.kind === 'decimal';

function tableXml(t: Table): string {
  const many = t.columns.length > 10;
  const size = many ? 7 : 8.5;
  const total = t.columns.reduce((s, c) => s + (c.width ?? 1), 0);
  // Column widths as fiftieths of a percent of the page width.
  const pct = t.columns.map((c) => Math.max(1, Math.round(((c.width ?? 1) / total) * 5000)));
  const cell = (text: string, c: Column, i: number, kind: 'head' | 'body' | 'total', shade?: string) => {
    const fill = shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : '';
    const st: RunStyle = kind === 'head' ? { size, bold: true, color: 'FFFFFF' } : { size, bold: kind === 'total', color: INK };
    return `<w:tc><w:tcPr><w:tcW w:w="${pct[i]}" w:type="pct"/>${fill}</w:tcPr>${para(run(text, st), { align: kind !== 'head' && numeric(c) ? 'right' : 'left' })}</w:tc>`;
  };
  const head = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${t.columns.map((c, i) => cell(c.label, c, i, 'head', INDIGO)).join('')}</w:tr>`;
  const body = t.rows
    .map((r, n) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${t.columns.map((c, i) => cell(cellText(c, r, 'pdf'), c, i, 'body', n % 2 ? 'FCFAF6' : undefined)).join('')}</w:tr>`)
    .join('');
  const totals = (t.totals ?? []).map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${t.columns.map((c, i) => cell(cellText(c, r, 'pdf'), c, i, 'total', PAPER)).join('')}</w:tr>`).join('');
  const line = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/>`;
  const borders = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(line).join('')}</w:tblBorders>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${borders}<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="70" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${pct.map(() => '<w:gridCol/>').join('')}</w:tblGrid>${head}${body}${totals}</w:tbl>`;
}

export function toDocx(doc: ReportDoc, brand: Branding = {}): Uint8Array {
  const enc = new TextEncoder();
  const logo = brand.logoPng ? pngSize(brand.logoPng) : null;
  const wide = doc.tables.some((t) => t.columns.length > 7);
  const generated = `${businessDateTime(doc.generatedAt)} (East Africa Time) by ${doc.generatedBy}`;
  const stitch = `<w:pBdr><w:bottom w:val="dashed" w:sz="8" w:space="4" w:color="${SAFFRON}"/></w:pBdr>`;

  const parts: string[] = [letterhead(doc, logo), para('', { after: 200, border: stitch })];
  parts.push(para(run(doc.title, { size: 18, bold: true, color: INK }), { before: 160, after: 120 }));
  for (const f of doc.filters) parts.push(para(run(`${f.label}: ${f.value}`, { size: 9.5, color: SOFT }), { after: 20 }));
  parts.push(para(run(`Generated ${generated}`, { size: 9.5, color: SOFT }), { after: 120 }));
  for (const n of doc.notes) parts.push(para(run(`• ${n}`, { size: 8.5, color: SOFT }), { after: 20 }));
  for (const t of doc.tables) {
    parts.push(para(run(t.title, { size: 12, bold: true, color: INK }), { before: 280, after: 60, keepNext: true }));
    if (t.note) parts.push(para(run(t.note, { size: 8.5, color: SOFT }), { after: 60, keepNext: true }));
    parts.push(t.rows.length ? tableXml(t) : para(run('No records match these filters.', { size: 9, color: SOFT })));
  }
  const page = wide ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' : '<w:pgSz w:w="11906" w:h="16838"/>';
  const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/>${page}<w:pgMar w:top="720" w:right="720" w:bottom="900" w:left="720" w:header="360" w:footer="400" w:gutter="0"/></w:sectPr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${parts.join('')}${sect}</w:body></w:document>`;

  const textWidth = (wide ? 16838 : 11906) - 1440;
  const field = (instr: string) => `<w:fldSimple w:instr=" ${instr} "><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="${SOFT}"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${NS}><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="${RULE}"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="${textWidth}"/></w:tabs><w:spacing w:before="0" w:after="0"/></w:pPr>${run(`${doc.app} · ${doc.business} — ${doc.title}`, { size: 8, color: SOFT })}<w:r><w:tab/></w:r>${run('Page ', { size: 8, color: SOFT })}${field('PAGE')}${run(' of ', { size: 8, color: SOFT })}${field('NUMPAGES')}</w:p></w:ftr>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;

  const files: { name: string; data: Uint8Array }[] = [
    {
      name: '[Content_Types].xml',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${logo ? '<Default Extension="png" ContentType="image/png"/>' : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    },
    {
      name: '_rels/.rels',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    },
    {
      name: 'docProps/core.xml',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(`${doc.app} — ${doc.business} — ${doc.title}`)}</dc:title><dc:creator>${xmlEsc(doc.generatedBy)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${doc.generatedAt.slice(0, 19)}Z</dcterms:created></cp:coreProperties>`),
    },
    {
      name: 'word/_rels/document.xml.rels',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${logo ? '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>' : ''}</Relationships>`),
    },
    { name: 'word/document.xml', data: enc.encode(document) },
    { name: 'word/styles.xml', data: enc.encode(styles) },
    { name: 'word/footer1.xml', data: enc.encode(footer) },
  ];
  if (logo) files.push({ name: 'word/media/logo.png', data: brand.logoPng! });
  return zip(files, new Date(doc.generatedAt));
}
