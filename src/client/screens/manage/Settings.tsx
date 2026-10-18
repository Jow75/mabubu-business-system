import { useState } from 'react';
import { store, useApp } from '../../lib/store';
import { useLookups } from '../../lib/lookups';
import { api, ApiError } from '../../lib/api';
import { downloadBlob } from '../../lib/csv';
import { uuidv7 } from '../../../shared/ids';
import { K, type FxSeries } from '../../../shared/model';
import { CURRENCY_CODES, isValidRate, type Currency } from '../../../shared/money';
import { businessDate, fmtDate } from '../../../shared/time';
import { RATE_BASIS_LABEL } from '../../../shared/fx';
import { Icon } from '../../ui/Icon';
import { Field, LocalCountToggle, PageHead, Seg, Sheet, save, toast } from '../../ui/kit';

export function SettingsPage() {
  const { user, ledger, demo, prefs } = useApp();
  const lk = useLookups();
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
      <PageHead title="Settings" />
      <section className="card card-pad stack">
        <span className="section-title">On this device</span>
        <div className="row-between">
          <span>Show Comorian francs as</span>
          <LocalCountToggle />
        </div>
        <div className="row-between">
          <span>Theme</span>
          <Seg value={prefs.theme} onChange={(theme) => store.setPrefs({ theme })} options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </div>
      </section>

      {caps.includes('settings.manage') && (
        <section className="card card-pad stack">
          <span className="section-title">Business</span>
          <div className="form-grid">
            <Field label="Business name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Name for the local count (÷5)" hint="Shown next to amounts, e.g. “local count”. Use the family’s own word.">
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
          </div>
          <Field label="Banknote values for the counter (KMF)" hint="Check these against real notes. Separate with commas.">
            <input className="input mono" value={denoms} onChange={(e) => setDenoms(e.target.value)} />
          </Field>
          <div>
            <button
              className="btn btn-primary"
              disabled={!name.trim() || !label.trim() || !denomsOk}
              onClick={() => void save(() => store.submit('settings.set', { businessName: name.trim(), localCountLabel: label.trim(), denominations: [...new Set(parsedDenoms)].sort((a, b) => b - a) }), 'Settings saved')}
            >
              Save
            </button>
          </div>
        </section>
      )}

      {(caps.includes('pricing.manage') || caps.includes('costs.view')) && (
        <section className="card">
          <div className="card-head">
            <div>
              <span className="section-title">Exchange rates</span>
              <div className="hint">Reports convert each amount with the rate in force on its date. Records always keep the currency actually paid. For today’s market rates, open the <a href="#/convert">currency converter</a>.</div>
            </div>
            {caps.includes('pricing.manage') && (
              <button className="btn btn-sm" onClick={() => setFx(true)}>
                <Icon name="plus" size={16} /> Add rate
              </button>
            )}
          </div>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Rate</th>
                  <th>Since</th>
                  <th>Kind</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {series.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No rates yet. Reports in another currency will ask for one.
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
                      <td>{RATE_BASIS_LABEL[e.basis ?? 'manual']}</td>
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

      {demo && (
        <section className="card card-pad stack">
          <span className="section-title">Demo</span>
          <p className="soft">Start the sample records again from the beginning.</p>
          <div>
            <button className="btn btn-danger" onClick={() => void store.resetDemo()}>
              Reset demo data
            </button>
          </div>
        </section>
      )}
      {fx && <FxSheet onClose={() => setFx(false)} />}
    </div>
  );
}

function BackupCard() {
  const [busy, setBusy] = useState(false);
  return (
    <section className="card card-pad stack">
      <span className="section-title">Backup</span>
      <p className="soft">
        Download every record from the server as one file. Keep a copy somewhere safe (for example on a USB stick and in Google Drive). The server also keeps 7 days of restore points.
      </p>
      <div>
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const data = await api<unknown>('GET', '/admin/export', undefined, store.token);
              downloadBlob(`mabubu-backup-${businessDate()}.json`, new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
              toast('Backup downloaded');
            } catch (e) {
              toast(e instanceof ApiError ? e.message : 'Backup failed', 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="download" size={18} /> Download full backup
        </button>
      </div>
    </section>
  );
}

function FxSheet({ onClose }: { onClose: () => void }) {
  const [from, setFrom] = useState<Currency>('KES');
  const [to, setTo] = useState<Currency>('KMF');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(businessDate());
  const [source, setSource] = useState('');
  const [basis, setBasis] = useState<'actual' | 'manual'>('actual');
  return (
    <Sheet
      title="Add exchange rate"
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={!isValidRate(rate) || from === to || !source.trim()}
          onClick={async () => {
            if (await save(() => store.submit('fx.set', { id: uuidv7(), from, to, rate, date, source: source.trim(), basis }), 'Rate saved')) onClose();
          }}
        >
          Save rate
        </button>
      }
    >
      <div className="form-grid">
        <Field label="1 unit of">
          <select className="select" value={from} onChange={(e) => setFrom(e.target.value as Currency)}>
            {CURRENCY_CODES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="equals">
          <input className="input num" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 3.45" />
        </Field>
        <Field label="of">
          <select className="select" value={to} onChange={(e) => setTo(e.target.value as Currency)}>
            {CURRENCY_CODES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-grid">
        <Field label="Valid from">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Where the rate came from" hint="e.g. bureau in Moroni, M-Pesa, bank">
          <input className="input" value={source} onChange={(e) => setSource(e.target.value)} />
        </Field>
      </div>
      <Field label="What kind of rate is it?">
        <Seg value={basis} onChange={setBasis} options={[{ value: 'actual', label: 'We really got this rate' }, { value: 'manual', label: 'A reference figure' }]} />
      </Field>
      <p className="hint">The rate actually received when money was changed is the best figure for profit. Reports show which kind each rate is.</p>
    </Sheet>
  );
}
