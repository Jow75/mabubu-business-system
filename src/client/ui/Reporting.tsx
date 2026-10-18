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
import { errText, useT } from '../lib/i18n';
import type { Key } from '../../shared/i18n';

/* ---------------- Download ---------------- */

export function DownloadButton({ build, label, small }: { build: () => ReportDoc; label?: string; small?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`btn ${small ? 'btn-sm' : ''}`} onClick={() => setOpen(true)}>
        <Icon name="download" size={small ? 16 : 18} /> {label ?? t('dl.download')}
      </button>
      {open && <DownloadSheet build={build} onClose={() => setOpen(false)} />}
    </>
  );
}

function DownloadSheet({ build, onClose }: { build: () => ReportDoc; onClose: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  // Built once when the sheet opens, from the same records and filters as the screen.
  const result = useMemo(() => {
    try {
      return { doc: build() };
    } catch (e) {
      return { error: e instanceof ReportForbidden ? errText(e.message) : t('dl.cannotPrepare') };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if ('error' in result) {
    return (
      <Sheet title={t('dl.download')} onClose={onClose}>
        <div className="error-box">{result.error}</div>
      </Sheet>
    );
  }
  const doc = result.doc;
  const go = async (f: ExportFormat) => {
    setBusy(f);
    try {
      const { logged } = await exportReport(doc, f);
      toast(t(logged ? 'dl.doneLogged' : 'dl.done', { format: FORMAT_INFO[f].label }));
      onClose();
    } catch {
      toast(t('dl.failed'), 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet title={t('dl.title', { title: doc.title })} onClose={onClose}>
      <span className="section-title">{t('dl.contents')}</span>
      <dl className="kv">
        {doc.filters.map((f) => (
          <FilterRow key={f.label} k={f.label} v={f.value} />
        ))}
        {doc.tables.map((tb) => (
          <FilterRow key={tb.title} k={tb.title} v={t('dl.rows', { n: tb.rows.length })} />
        ))}
      </dl>
      {rowCount(doc) === 0 && <div className="note-box">{t('dl.none')}</div>}
      <span className="section-title" style={{ marginTop: 6 }}>
        {t('dl.format')}
      </span>
      <div className="export-formats">
        {EXPORT_FORMATS.map((f) => (
          <button key={f} className="export-format" disabled={busy !== null} onClick={() => void go(f)}>
            <strong>{busy === f ? t('dl.preparing') : FORMAT_INFO[f].label}</strong>
            <span className="hint">{t(`fmt.${f}` as Key)}</span>
          </button>
        ))}
      </div>
      <p className="hint">{t('dl.note')}</p>
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

/** On-screen name of a period (downloads keep the English label in their filter list). */
export function useRangeLabel() {
  const t = useT();
  return (p: RangePreset) => t(`range.${p}` as Key);
}

export function DateRangeControl({ r, presets = ['7', '30', 'all', 'custom'] }: { r: ReturnType<typeof useDateRange>; presets?: RangePreset[] }) {
  const t = useT();
  return (
    <>
      <Seg value={r.preset} onChange={r.setPreset} options={presets.map((p) => ({ value: p, label: p === 'custom' ? t('range.dates') : p === 'all' ? t('range.allShort') : t('range.nDays', { n: p }) }))} />
      {r.preset === 'custom' && (
        <span className="row" style={{ gap: 8 }}>
          <input type="date" className="input" style={{ width: 'auto' }} aria-label={t('range.from')} value={r.cFrom} onChange={(e) => r.setFrom(e.target.value)} />
          <span className="muted">{t('range.to')}</span>
          <input type="date" className="input" style={{ width: 'auto' }} aria-label={t('range.toLabel')} value={r.cTo} onChange={(e) => r.setTo(e.target.value)} />
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
  const t = useT();
  return (
    <select className="select" style={{ width: 'auto' }} aria-label={t('place.label')} value={prefs.scope ?? ''} onChange={(e) => store.setPrefs({ scope: e.target.value || null })}>
      <option value="">{t('scope.all')}</option>
      {lk.locations
        .filter((l) => l.active || l.id === prefs.scope)
        .map((l) => (
          <option key={l.id} value={l.id}>
            {t('place.only', { place: l.name })}
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
export function PlaceNotice({ hidden, what }: { hidden: number; what: Key }) {
  const { prefs } = useApp();
  const lk = useLookups();
  const t = useT();
  if (!prefs.scope) return null;
  return (
    <div className="note-box row-between" role="status">
      <span>
        <strong>{t('place.showing', { place: lk.locName(prefs.scope) })}</strong>{' '}
        {hidden > 0 ? t('place.hidden', { n: hidden, what: t(what) }) : t('place.noneHidden')}
      </span>
      <button className="btn btn-sm" onClick={() => store.setPrefs({ scope: null })}>
        {t('place.showAll')}
      </button>
    </div>
  );
}
