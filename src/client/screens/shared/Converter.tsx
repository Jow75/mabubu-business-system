import { useState } from 'react';
import { store, useApp } from '../../lib/store';
import { useLookups } from '../../lib/lookups';
import { refreshMarketRates, useMarketRates } from '../../lib/fx';
import { uuidv7 } from '../../../shared/ids';
import { MARKET_PROVIDER, RATE_BASIS_LABEL, findRecordedRate, marketRate } from '../../../shared/fx';
import { CURRENCIES, CURRENCY_CODES, convertMinor, formatLocalCount, formatMoney, isValidRate, parseMoney, type Currency } from '../../../shared/money';
import { businessDate, fmtDate, fmtDateTime, fmtDuration } from '../../../shared/time';
import { Icon } from '../../ui/Icon';
import { Field, PageHead, Sheet, save } from '../../ui/kit';

const PREF_KEY = 'mabubu.converter';

function loadPair(): { from: Currency; to: Currency } {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as { from?: Currency; to?: Currency };
    if (p.from && p.to && CURRENCY_CODES.includes(p.from) && CURRENCY_CODES.includes(p.to)) return { from: p.from, to: p.to };
  } catch {
    /* ignore */
  }
  return { from: 'KES', to: 'KMF' };
}

/** A rate as text that a recorded rate accepts (up to 10 decimals). */
function rateString(rate: number): string {
  const s = rate.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
  return s === '0' ? rate.toPrecision(4) : s;
}

/** Currency calculator. It never creates a purchase, sale, payment or expense. */
export function CurrencyConverter() {
  const { ledger, user } = useApp();
  const lk = useLookups();
  const m = useMarketRates();
  const [pair, setPair] = useState(loadPair);
  const [text, setText] = useState('1000');
  const [saveOpen, setSaveOpen] = useState(false);
  const { from, to } = pair;
  const setBoth = (p: { from: Currency; to: Currency }) => {
    setPair(p);
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  };
  const amount = parseMoney(from, text);
  const mr = m.rates ? marketRate(m.rates, from, to) : null;
  const result = amount !== null && mr ? convertMinor(amount, from, to, mr.rate) : null;
  const recorded = findRecordedRate((k) => ledger.get(k), from, to, businessDate());
  const recordedResult = amount !== null && recorded ? convertMinor(amount, from, to, recorded.rate) : null;
  const canRecord = user!.caps.includes('pricing.manage') && mr !== null && !m.stale && from !== to;
  const rateLine = (r: number, a: Currency, b: Currency) => `1 ${a} = ${Number(r.toPrecision(6)).toLocaleString('en-US', { maximumFractionDigits: 6 })} ${b}`;

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <PageHead eyebrow="Tool" title="Currency converter" lead="A calculator only. Nothing here is saved as a purchase, sale, payment or expense." />

      <section className="card card-pad stack">
        <div className="fx-pair">
          <Field label="From">
            <select className="select" value={from} onChange={(e) => setBoth({ from: e.target.value as Currency, to })}>
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c} · {CURRENCIES[c].name}
                </option>
              ))}
            </select>
          </Field>
          <button className="btn fx-swap" aria-label="Swap currencies" title="Swap" onClick={() => setBoth({ from: to, to: from })}>
            <Icon name="swap" />
          </button>
          <Field label="To">
            <select className="select" value={to} onChange={(e) => setBoth({ from, to: e.target.value as Currency })}>
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c} · {CURRENCIES[c].name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={`Amount in ${from}`}>
          <div style={{ position: 'relative' }}>
            <input className="input big" inputMode={CURRENCIES[from].exp ? 'decimal' : 'numeric'} value={text} onChange={(e) => setText(e.target.value)} style={{ paddingRight: 64 }} />
            <span className="muted" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontWeight: 650 }}>
              {CURRENCIES[from].prefix}
            </span>
          </div>
          {text !== '' && amount === null && <span className="hint" style={{ color: 'var(--hibiscus)' }}>Not a valid {from} amount{CURRENCIES[from].exp === 0 ? ' (whole numbers only)' : ''}</span>}
        </Field>

        <div className="selvedge" style={{ paddingLeft: 18 }}>
          <div className="eyebrow">At today’s market reference rate</div>
          <div className="fx-result">{result !== null ? formatMoney(to, result) : '—'}</div>
          {result !== null && to === 'KMF' && <div className="local">{formatLocalCount(result)} {lk.settings.localCountLabel} (counting aid only)</div>}
          {mr && from !== to && (
            <div className="trace" style={{ marginTop: 6 }}>
              {rateLine(mr.rate, from, to)} · worked out through USD (1 USD = {mr.legs[0]?.perBase} {from} = {mr.legs[1]?.perBase} {to})
            </div>
          )}
        </div>

        {m.rates ? (
          <div className={m.stale ? 'note-box' : 'info-box'} role="status">
            {m.stale ? <strong>These rates may be out of date. </strong> : null}
            Market rates published {fmtDateTime(m.rates.publishedAt)} ({m.ageMs !== null ? `${fmtDuration(m.ageMs)} ago` : ''}) by {MARKET_PROVIDER.name}.
            {m.rates.nextUpdateAt && !m.stale && <> Next update expected {fmtDateTime(m.rates.nextUpdateAt)}.</>}
            {m.error && <div style={{ marginTop: 4 }}>{m.error}</div>}
          </div>
        ) : (
          <div className="note-box" role="status">
            {m.loading ? 'Getting market rates…' : <>No market rates on this device yet. {m.error ?? 'Connect to the internet once to load them.'}</>}
          </div>
        )}
        {m.rates && !mr && from !== to && <div className="error-box">The provider did not publish a rate for {from} or {to}, so no conversion is shown.</div>}
        <div className="row-between">
          <button className="btn btn-sm" disabled={m.loading} onClick={() => void refreshMarketRates(true)}>
            <Icon name="refresh" size={16} /> {m.loading ? 'Checking…' : 'Check for new rates'}
          </button>
          <a className="hint" href={MARKET_PROVIDER.attribution.href} target="_blank" rel="noreferrer">
            {MARKET_PROVIDER.attribution.text}
          </a>
        </div>
      </section>

      {from !== to && (user!.caps.includes('costs.view') || user!.caps.includes('pricing.manage')) && (
        <section className="card card-pad stack">
          <span className="section-title">Rate the family recorded (used in reports)</span>
          {recorded ? (
            <>
              <div className="row-between">
                <span>
                  {rateLine(recorded.rate, from, to)}
                  <div className="trace">
                    {RATE_BASIS_LABEL[recorded.basis]} · since {fmtDate(recorded.effectiveDate)} · {recorded.source}
                    {recorded.inverse && ` · recorded as 1 ${recorded.recorded.from} = ${recorded.recorded.rate} ${recorded.recorded.to}`}
                  </div>
                </span>
                {recordedResult !== null && <strong className="num">{formatMoney(to, recordedResult)}</strong>}
              </div>
              {mr && <p className="hint">Today’s market rate differs from the recorded one by {(((mr.rate - recorded.rate) / recorded.rate) * 100).toFixed(1)}%. Reports keep using recorded rates on each transaction’s date, so past profit does not change with the market.</p>}
            </>
          ) : (
            <p className="soft">No recorded rate for {from} → {to} yet. Reports in another currency need one; add it in Settings, or save today’s market rate below.</p>
          )}
          {canRecord && (
            <div>
              <button className="btn" onClick={() => setSaveOpen(true)}>
                Save today’s market rate as a recorded rate
              </button>
            </div>
          )}
        </section>
      )}
      {saveOpen && mr && m.rates && <SaveRateSheet from={from} to={to} rate={rateString(mr.rate)} publishedAt={m.rates.publishedAt} onClose={() => setSaveOpen(false)} />}
    </div>
  );
}

function SaveRateSheet({ from, to, rate, publishedAt, onClose }: { from: Currency; to: Currency; rate: string; publishedAt: string; onClose: () => void }) {
  const [date, setDate] = useState(businessDate());
  const source = `${MARKET_PROVIDER.name} market reference, published ${publishedAt.slice(0, 16).replace('T', ' ')} UTC`;
  return (
    <Sheet
      title="Save as a recorded rate"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!isValidRate(rate)}
            onClick={async () => {
              if (await save(() => store.submit('fx.set', { id: uuidv7(), from, to, rate, date, source, basis: 'market' }), 'Rate saved')) onClose();
            }}
          >
            Save rate
          </button>
        </>
      }
    >
      <p className="soft">
        From this date, reports will convert {from} amounts to {to} at <strong className="num">1 {from} = {rate} {to}</strong>, until a newer rate is recorded. Amounts dated earlier keep their own rates. If you exchanged money at a different rate, record that actual rate in Settings instead — it is the better figure.
      </p>
      <Field label="Valid from">
        <input type="date" className="input" value={date} max={businessDate()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <p className="hint">Source saved with the rate: {source}</p>
    </Sheet>
  );
}
