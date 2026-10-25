import { useEffect, useState } from 'react';
import { href } from '../../lib/router';
import type { GoLiveStatus } from '../../../shared/golive';
import { store, useApp } from '../../lib/store';
import { useLookups } from '../../lib/lookups';
import { api, ApiError } from '../../lib/api';
import { downloadBlob } from '../../lib/csv';
import { uuidv7 } from '../../../shared/ids';
import { K, type FxSeries } from '../../../shared/model';
import { CURRENCY_CODES, isValidRate, type Currency } from '../../../shared/money';
import { businessDate, fmtDate } from '../../../shared/time';
import { errText, useT } from '../../lib/i18n';
import { LanguageSwitch } from '../auth/Language';
import { Icon } from '../../ui/Icon';
import { Field, LocalCountToggle, PageHead, Seg, Sheet, save, toast } from '../../ui/kit';

export function SettingsPage() {
  const { user, ledger, demo, prefs } = useApp();
  const lk = useLookups();
  const t = useT();
  const caps = user!.caps;
  const [name, setName] = useState(lk.settings.businessName);
  const [label, setLabel] = useState(lk.settings.localCountLabel);
  const [denoms, setDenoms] = useState(lk.settings.denominations.join(', '));
  const [fx, setFx] = useState(false);
  const parsedDenoms = denoms
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
  const denomsOk = parsedDenoms.length > 0 && parsedDenoms.every((n) => Number.isInteger(n) && n > 0);
  const series = CURRENCY_CODES.flatMap((a) => CURRENCY_CODES.map((b) => ledger.get(K.fx(a, b)) as FxSeries | undefined)).filter((s): s is FxSeries => Boolean(s?.entries.length));

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <PageHead title={t('nav.settings')} />
      <section className="card card-pad stack">
        <span className="section-title">{t('st.device')}</span>
        <div className="row-between">
          <span>{t('lang.label')}</span>
          <LanguageSwitch />
        </div>
        <div className="row-between">
          <span>{t('st.showKmf')}</span>
          <LocalCountToggle />
        </div>
        <div className="row-between">
          <span>{t('me.theme')}</span>
          <Seg value={prefs.theme} onChange={(theme) => store.setPrefs({ theme })} options={[{ value: 'system', label: t('me.auto') }, { value: 'light', label: t('me.light') }, { value: 'dark', label: t('me.dark') }]} />
        </div>
      </section>

      {caps.includes('settings.manage') && (
        <section className="card card-pad stack">
          <span className="section-title">{t('st.business')}</span>
          <div className="form-grid">
            <Field label={t('st.businessName')}>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t('st.localName')} hint={t('st.localHint')}>
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
          </div>
          <Field label={t('st.denoms')} hint={t('st.denomsHint')}>
            <input className="input mono" value={denoms} onChange={(e) => setDenoms(e.target.value)} />
          </Field>
          <div>
            <button
              className="btn btn-primary"
              disabled={!name.trim() || !label.trim() || !denomsOk}
              onClick={() => void save(() => store.submit('settings.set', { businessName: name.trim(), localCountLabel: label.trim(), denominations: [...new Set(parsedDenoms)].sort((a, b) => b - a) }), t('st.saved'))}
            >
              {t('c.save')}
            </button>
          </div>
        </section>
      )}

      {(caps.includes('pricing.manage') || caps.includes('costs.view')) && (
        <section className="card">
          <div className="card-head">
            <div>
              <span className="section-title">{t('st.rates')}</span>
              <div className="hint">
                {t('st.ratesHint')} <a href="#/convert">{t('nav.convert')}</a>
              </div>
            </div>
            {caps.includes('pricing.manage') && (
              <button className="btn btn-sm" onClick={() => setFx(true)}>
                <Icon name="plus" size={16} /> {t('st.addRate')}
              </button>
            )}
          </div>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>{t('st.from')}</th>
                  <th>{t('st.rate')}</th>
                  <th>{t('st.since')}</th>
                  <th>{t('st.kind')}</th>
                  <th>{t('st.source')}</th>
                </tr>
              </thead>
              <tbody>
                {series.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      {t('st.noRates')}
                    </td>
                  </tr>
                )}
                {series.flatMap((s) =>
                  [...s.entries].reverse().map((e) => (
                    <tr key={e.id}>
                      <td>
                        1 {s.from} → {s.to}
                      </td>
                      <td className="num">{e.rate}</td>
                      <td>{fmtDate(e.date)}</td>
                      <td>{t(`basis.${e.basis ?? 'manual'}`)}</td>
                      <td className="muted">{e.source}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {caps.includes('users.manage') && !demo && <BackupCard />}
      {user!.role === 'owner' && caps.includes('users.manage') && !demo && <GoLiveCard />}

      {demo && (
        <section className="card card-pad stack">
          <span className="section-title">{t('st.demo')}</span>
          <p className="soft">{t('st.demoLead')}</p>
          <div>
            <button className="btn btn-danger" onClick={() => void store.resetDemo()}>
              {t('st.resetDemo')}
            </button>
          </div>
        </section>
      )}
      {fx && <FxSheet onClose={() => setFx(false)} />}
    </div>
  );
}

/** Owner only: the way to the one-time go-live cutover, or its record once done. */
function GoLiveCard() {
  const t = useT();
  const { online } = useApp();
  const [status, setStatus] = useState<GoLiveStatus | null>(null);
  useEffect(() => {
    api<GoLiveStatus>('GET', '/admin/golive', undefined, store.token)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [online]);
  if (!status) return null;
  if (status.phase === 'live')
    return (
      <section className="card card-pad stack">
        <span className="section-title">{t('gl.title')}</span>
        <p className="soft" style={{ margin: 0 }}>
          {t('gl.liveSince', { when: status.cutover ? fmtDate(status.cutover.at.slice(0, 10)) : '—' })}
        </p>
        <a className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} href={href('/golive')}>
          {t('gl.seeRecord')}
        </a>
      </section>
    );
  return (
    <section className="card card-pad stack selvedge">
      <span className="section-title">{t('gl.title')}</span>
      <p className="soft" style={{ margin: 0 }}>
        {t('gl.cardBody')}
      </p>
      <a className="btn" style={{ alignSelf: 'flex-start' }} href={href('/golive')}>
        {t('gl.open')} <Icon name="arrowRight" size={16} />
      </a>
    </section>
  );
}

function BackupCard() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <section className="card card-pad stack">
      <span className="section-title">{t('st.backup')}</span>
      <p className="soft">{t('st.backupLead')}</p>
      <div>
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const data = await api<unknown>('GET', '/admin/export', undefined, store.token);
              downloadBlob(`mabubu-backup-${businessDate()}.json`, new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
              toast(t('st.backupDone'));
            } catch (e) {
              toast(e instanceof ApiError ? errText(e.message) : t('st.backupFailed'), 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="download" size={18} /> {t('st.backupBtn')}
        </button>
      </div>
    </section>
  );
}

function FxSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [from, setFrom] = useState<Currency>('KES');
  const [to, setTo] = useState<Currency>('KMF');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(businessDate());
  const [source, setSource] = useState('');
  const [basis, setBasis] = useState<'actual' | 'manual'>('actual');
  return (
    <Sheet
      title={t('fx.title')}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={!isValidRate(rate) || from === to || !source.trim()}
          onClick={async () => {
            if (await save(() => store.submit('fx.set', { id: uuidv7(), from, to, rate, date, source: source.trim(), basis }), t('fx.saved'))) onClose();
          }}
        >
          {t('fx.save')}
        </button>
      }
    >
      <div className="form-grid">
        <Field label={t('fx.unitOf')}>
          <select className="select" value={from} onChange={(e) => setFrom(e.target.value as Currency)}>
            {CURRENCY_CODES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label={t('fx.equals')}>
          <input className="input num" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} placeholder={t('fx.eg')} />
        </Field>
        <Field label={t('fx.of')}>
          <select className="select" value={to} onChange={(e) => setTo(e.target.value as Currency)}>
            {CURRENCY_CODES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-grid">
        <Field label={t('fx.validFrom')}>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('fx.where')} hint={t('fx.whereHint')}>
          <input className="input" value={source} onChange={(e) => setSource(e.target.value)} />
        </Field>
      </div>
      <Field label={t('fx.kindQ')}>
        <Seg value={basis} onChange={setBasis} options={[{ value: 'actual', label: t('fx.really') }, { value: 'manual', label: t('fx.reference') }]} />
      </Field>
      <p className="hint">{t('fx.hint')}</p>
    </Sheet>
  );
}
