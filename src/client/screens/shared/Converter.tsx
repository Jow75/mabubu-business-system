import { useState } from 'react';
import { store, useApp } from '../../lib/store';
import { useLookups } from '../../lib/lookups';
import { refreshMarketRates, useMarketRates } from '../../lib/fx';
import { uuidv7 } from '../../../shared/ids';
import { MARKET_PROVIDER, findRecordedRate, marketRate } from '../../../shared/fx';
import { errText, rich, useT } from '../../lib/i18n';
import type { Key } from '../../../shared/i18n';
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
  const t = useT();
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
      <PageHead eyebrow={t('tool.eyebrow')} title={t('nav.convert')} lead={t('cv.lead')} />

      <section className="card card-pad stack">
        <div className="fx-pair">
          <Field label={t('cv.from')}>
            <select className="select" value={from} onChange={(e) => setBoth({ from: e.target.value as Currency, to })}>
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c} · {t(`cur.${c}` as Key)}
                </option>
              ))}
            </select>
          </Field>
          <button className="btn fx-swap" aria-label={t('cv.swap')} title={t('cv.swapShort')} onClick={() => setBoth({ from: to, to: from })}>
            <Icon name="swap" />
          </button>
          <Field label={t('cv.to')}>
            <select className="select" value={to} onChange={(e) => setBoth({ from, to: e.target.value as Currency })}>
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c} · {t(`cur.${c}` as Key)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t('cv.amountIn', { currency: from })} htmlFor="cv-amount">
          <div style={{ position: 'relative' }}>
            <input id="cv-amount" className="input big" inputMode={CURRENCIES[from].exp ? 'decimal' : 'numeric'} value={text} onChange={(e) => setText(e.target.value)} style={{ paddingRight: 64 }} />
            <span className="muted" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontWeight: 650 }}>
              {CURRENCIES[from].prefix}
            </span>
          </div>
          {text !== '' && amount === null && <span className="hint" style={{ color: 'var(--hibiscus)' }}>{t('cv.invalid', { currency: from })}
              {CURRENCIES[from].exp === 0 ? t('cv.whole') : ''}</span>}
        </Field>

        <div className="selvedge" style={{ paddingLeft: 18 }}>
          <div className="eyebrow">{t('cv.market')}</div>
          <div className="fx-result">{result !== null ? formatMoney(to, result) : '—'}</div>
          {result !== null && to === 'KMF' && <div className="local">{t('cv.countingAid', { amount: formatLocalCount(result), label: lk.settings.localCountLabel })}</div>}
          {mr && from !== to && (
            <div className="trace" style={{ marginTop: 6 }}>
              {t('cv.viaUsd', { rate: rateLine(mr.rate, from, to), a: String(mr.legs[0]?.perBase ?? ''), from, b: String(mr.legs[1]?.perBase ?? ''), to })}
            </div>
          )}
        </div>

        {m.rates ? (
          <div className={m.stale ? 'note-box' : 'info-box'} role="status">
            {m.stale ? <strong>{t('cv.stale')} </strong> : null}
            {t('cv.published', { time: fmtDateTime(m.rates.publishedAt), age: m.ageMs !== null ? t('cv.ago', { d: fmtDuration(m.ageMs) }) : '', provider: MARKET_PROVIDER.name })}
            {m.rates.nextUpdateAt && !m.stale && <> {t('cv.nextUpdate', { time: fmtDateTime(m.rates.nextUpdateAt) })}</>}
            {m.error && <div style={{ marginTop: 4 }}>{errText(m.error)}</div>}
          </div>
        ) : (
          <div className="note-box" role="status">
            {m.loading ? t('cv.getting') : <>{t('cv.noRates')} {m.error ? errText(m.error) : t('cv.connectOnce')}</>}
          </div>
        )}
        {m.rates && !mr && from !== to && <div className="error-box">{t('cv.noProviderRate', { from, to })}</div>}
        <div className="row-between">
          <button className="btn btn-sm" disabled={m.loading} onClick={() => void refreshMarketRates(true)}>
            <Icon name="refresh" size={16} /> {m.loading ? t('cv.checking') : t('cv.check')}
          </button>
          <a className="hint" href={MARKET_PROVIDER.attribution.href} target="_blank" rel="noreferrer">
            {MARKET_PROVIDER.attribution.text}
          </a>
        </div>
      </section>

      {from !== to && (user!.caps.includes('costs.view') || user!.caps.includes('pricing.manage')) && (
        <section className="card card-pad stack">
          <span className="section-title">{t('cv.recordedTitle')}</span>
          {recorded ? (
            <>
              <div className="row-between">
                <span>
                  {rateLine(recorded.rate, from, to)}
                  <div className="trace">
                    {t('cv.sinceSource', { basis: t(`basis.${recorded.basis}` as Key), date: fmtDate(recorded.effectiveDate), source: recorded.source })}
                    {recorded.inverse && t('cv.recordedAs', { from: recorded.recorded.from, rate: recorded.recorded.rate, to: recorded.recorded.to })}
                  </div>
                </span>
                {recordedResult !== null && <strong className="num">{formatMoney(to, recordedResult)}</strong>}
              </div>
              {mr && <p className="hint">{t('cv.differs', { pct: (((mr.rate - recorded.rate) / recorded.rate) * 100).toFixed(1) })}</p>}
            </>
          ) : (
            <p className="soft">{t('cv.noRecorded', { from, to })}</p>
          )}
          {canRecord && (
            <div>
              <button className="btn btn-wrap" onClick={() => setSaveOpen(true)}>
                {t('cv.saveMarket')}
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
  const t = useT();
  const [date, setDate] = useState(businessDate());
  const source = `${MARKET_PROVIDER.name} market reference, published ${publishedAt.slice(0, 16).replace('T', ' ')} UTC`;
  return (
    <Sheet
      title={t('cv.saveTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('c.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={!isValidRate(rate)}
            onClick={async () => {
              if (await save(() => store.submit('fx.set', { id: uuidv7(), from, to, rate, date, source, basis: 'market' }), t('fx.saved'))) onClose();
            }}
          >
            {t('fx.save')}
          </button>
        </>
      }
    >
      <p className="soft">{rich(t('cv.saveBody', { from, to }), { rate: <strong className="num">1 {from} = {rate} {to}</strong> })}</p>
      <Field label={t('fx.validFrom')}>
        <input type="date" className="input" value={date} max={businessDate()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <p className="hint">{t('cv.sourceSaved', { source })}</p>
    </Sheet>
  );
}
