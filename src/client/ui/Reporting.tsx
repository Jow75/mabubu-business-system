// Shared pieces for screens that filter and download records: the download
// sheet, the date-range picker, and the notice shown whenever the place
// filter (set on the Overview) is hiding records.

import { useMemo, useState } from 'react';
import { store, useApp } from '../lib/store';
import { useLookups } from '../lib/lookups';
import { exportReport, FORMAT_INFO } from '../lib/export';
import { EXPORT_FORMATS, type ExportFormat } from '../../shared/report-catalog';
import { rowCount, type ReportDoc } from '../../shared/report-doc';
import { ReportForbidden } from '../../shared/reports';
import { addDays, businessDate } from '../../shared/time';
import { Icon } from './Icon';
import { Seg, Sheet, toast } from './kit';

/* ---------------- Download ---------------- */

export function DownloadButton({ build, label = 'Download', small }: { build: () => ReportDoc; label?: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`btn ${small ? 'btn-sm' : ''}`} onClick={() => setOpen(true)}>
        <Icon name="download" size={small ? 16 : 18} /> {label}
      </button>
      {open && <DownloadSheet build={build} onClose={() => setOpen(false)} />}
    </>
  );
}

function DownloadSheet({ build, onClose }: { build: () => ReportDoc; onClose: () => void }) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  // Built once when the sheet opens, from the same records and filters as the screen.
  const result = useMemo(() => {
    try {
      return { doc: build() };
    } catch (e) {
      return { error: e instanceof ReportForbidden ? e.message : 'This report could not be prepared.' };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if ('error' in result) {
    return (
      <Sheet title="Download" onClose={onClose}>
        <div className="error-box">{result.error}</div>
      </Sheet>
    );
  }
  const doc = result.doc;
  const go = async (f: ExportFormat) => {
    setBusy(f);
    try {
      const { logged } = await exportReport(doc, f);
      toast(logged ? `${FORMAT_INFO[f].label} downloaded · noted in the log` : `${FORMAT_INFO[f].label} downloaded`);
      onClose();
    } catch {
      toast('The file could not be made. Nothing was downloaded.', 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet title={`Download: ${doc.title}`} onClose={onClose}>
      <span className="section-title">What will be in the file</span>
      <dl className="kv">
        {doc.filters.map((f) => (
          <FilterRow key={f.label} k={f.label} v={f.value} />
        ))}
        {doc.tables.map((t) => (
          <FilterRow key={t.title} k={t.title} v={`${t.rows.length} row${t.rows.length === 1 ? '' : 's'}`} />
        ))}
      </dl>
      {rowCount(doc) === 0 && <div className="note-box">No records match these filters. The file will say so.</div>}
      <span className="section-title" style={{ marginTop: 6 }}>
        Choose a format
      </span>
      <div className="export-formats">
        {EXPORT_FORMATS.map((f) => (
          <button key={f} className="export-format" disabled={busy !== null} onClick={() => void go(f)}>
            <strong>{busy === f ? 'Preparing…' : FORMAT_INFO[f].label}</strong>
            <span className="hint">{FORMAT_INFO[f].hint}</span>
          </button>
        ))}
      </div>
      <p className="hint">Files are made on this device from the records shown on screen; totals match the screen. Word documents are not offered yet.</p>
    </Sheet>
  );
}

function FilterRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd style={{ textAlign: 'right' }}>{v}</dd>
    </>
  );
}

/* ---------------- Date ranges ---------------- */

export type RangePreset = '7' | '30' | '90' | 'all' | 'custom';
export const PRESET_LABEL: Record<RangePreset, string> = { '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days', all: 'All dates', custom: 'Custom dates' };

export interface DateRangeState {
  preset: RangePreset;
  from: string | null;
  to: string | null;
  label: string;
}

export function useDateRange(initial: RangePreset) {
  const today = businessDate();
  const [preset, setPreset] = useState<RangePreset>(initial);
  const [cFrom, setFrom] = useState(addDays(today, -6));
  const [cTo, setTo] = useState(today);
  const range: DateRangeState =
    preset === 'all'
      ? { preset, from: null, to: null, label: PRESET_LABEL.all }
      : preset === 'custom'
        ? { preset, from: cFrom <= cTo ? cFrom : cTo, to: cFrom <= cTo ? cTo : cFrom, label: PRESET_LABEL.custom }
        : { preset, from: addDays(today, -Number(preset) + 1), to: today, label: PRESET_LABEL[preset] };
  return { range, preset, setPreset, cFrom, cTo, setFrom, setTo };
}

export function DateRangeControl({ r, presets = ['7', '30', 'all', 'custom'] }: { r: ReturnType<typeof useDateRange>; presets?: RangePreset[] }) {
  return (
    <>
      <Seg value={r.preset} onChange={r.setPreset} options={presets.map((p) => ({ value: p, label: p === 'custom' ? 'Dates…' : p === 'all' ? 'All' : `${p} days` }))} />
      {r.preset === 'custom' && (
        <span className="row" style={{ gap: 8 }}>
          <input type="date" className="input" style={{ width: 'auto' }} aria-label="From" value={r.cFrom} onChange={(e) => r.setFrom(e.target.value)} />
          <span className="muted">to</span>
          <input type="date" className="input" style={{ width: 'auto' }} aria-label="To" value={r.cTo} onChange={(e) => r.setTo(e.target.value)} />
        </span>
      )}
    </>
  );
}

/* ---------------- Place filter ---------------- */

/** The place picker, available on every page it affects. */
export function PlaceSelect() {
  const { prefs } = useApp();
  const lk = useLookups();
  return (
    <select className="select" style={{ width: 'auto' }} aria-label="Place" value={prefs.scope ?? ''} onChange={(e) => store.setPrefs({ scope: e.target.value || null })}>
      <option value="">All places</option>
      {lk.locations
        .filter((l) => l.active || l.id === prefs.scope)
        .map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} only
          </option>
        ))}
    </select>
  );
}

/**
 * Shown whenever the place filter is on. The filter is remembered on this
 * device, so without this notice a page could look empty (for example “no
 * sales”) when the records are simply at another place.
 */
export function PlaceNotice({ hidden, what }: { hidden: number; what: string }) {
  const { prefs } = useApp();
  const lk = useLookups();
  if (!prefs.scope) return null;
  return (
    <div className="note-box row-between" role="status">
      <span>
        <strong>Showing {lk.locName(prefs.scope)} only.</strong>{' '}
        {hidden > 0 ? `${hidden} ${what} at other places ${hidden === 1 ? 'is' : 'are'} hidden by this filter.` : `Nothing at other places is hidden here.`}
      </span>
      <button className="btn btn-sm" onClick={() => store.setPrefs({ scope: null })}>
        Show all places
      </button>
    </div>
  );
}
