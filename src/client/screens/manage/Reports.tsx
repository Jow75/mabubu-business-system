import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../../lib/store';
import { useLookups } from '../../lib/lookups';
import { href } from '../../lib/router';
import { useMarketRates } from '../../lib/fx';
import { reportCtx } from '../../lib/report-ctx';
import { profitReport, weightedCosts } from '../../../shared/queries';
import type { ConversionBasis } from '../../../shared/fx';
import { errText, rich, useT } from '../../lib/i18n';
import type { Key } from '../../../shared/i18n';
import {
  activityReport,
  catalogueReport,
  expensesReport,
  movementsReport,
  profitDoc,
  purchasesReport,
  rateText,
  salesDaysReport,
  salesLinesReport,
  shipmentsReport,
  stockReport,
  totalsText,
  vendorsReport,
  workerRecordsReport,
} from '../../../shared/reports';
import { canExport, type ReportId } from '../../../shared/report-catalog';
import type { ReportDoc } from '../../../shared/report-doc';
import { CURRENCY_CODES, type Currency } from '../../../shared/money';
import { addDays, businessDate, fmtDate, fmtDateTime } from '../../../shared/time';
import { EXPENSE_LABEL, SHIP_COST_LABEL } from '../../lib/labels';
import { Field, GarmentLabel, Money, PageHead, Seg } from '../../ui/kit';
import { DownloadButton, PlaceNotice, PlaceSelect } from '../../ui/Reporting';

function monthStart(d: string) {
  return d.slice(0, 8) + '01';
}
const PERIOD_LABEL = { month: 'This month', last: 'Last month', '30': 'Last 30 days', custom: 'Custom dates' } as const;

export function ReportsPage() {
  const { ledger, version, prefs, user } = useApp();
  const lk = useLookups();
  const t = useT();
  const market = useMarketRates();
  const today = businessDate();
  const [period, setPeriod] = useState<keyof typeof PERIOD_LABEL>('month');
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [currency, setCurrency] = useState<Currency>('KMF');
  const [basis, setBasis] = useState<ConversionBasis>('transaction');
  const range = useMemo(() => {
    if (period === 'month') return { from: monthStart(today), to: today };
    if (period === 'last') {
      const end = addDays(monthStart(today), -1);
      return { from: monthStart(end), to: end };
    }
    if (period === '30') return { from: addDays(today, -29), to: today };
    return from <= to ? { from, to } : { from: to, to: from };
  }, [period, from, to, today]);
  const scope = prefs.scope ?? undefined;
  const opts = { basis, market: market.rates };
  const r = useMemo(() => profitReport(ledger, range.from, range.to, currency, scope, opts), [ledger, version, range, currency, scope, basis, market.rates]);
  // Closed days the place filter is hiding, so an empty-looking report is never a mystery.
  const hiddenDays = useMemo(() => (scope ? profitReport(ledger, range.from, range.to, currency, undefined, opts).counts.closedDays - r.counts.closedDays : 0), [ledger, version, range, currency, scope, r, basis, market.rates]);
  const unitCosts = useMemo(() => weightedCosts(ledger, currency, new Set()), [ledger, version, currency]);
  const cur = currency;
  const trace = (tot: Partial<Record<Currency, number>>) => {
    const others = (Object.keys(tot) as Currency[]).filter((c) => c !== cur);
    return others.length ? <span className="trace">{t('rp.asPaid', { list: totalsText(tot) })}</span> : null;
  };

  return (
    <div className="page">
      <PageHead
        title={t('nav.reports')}
        lead={t('rp.lead', { from: fmtDate(range.from), to: fmtDate(range.to), place: scope ? lk.locName(scope) : t('rp.allPlaces') })}
        actions={
          <>
            <Seg value={period} onChange={setPeriod} options={(['month', 'last', '30', 'custom'] as const).map((k) => ({ value: k, label: t(`rp.period.${k}`) }))} />
            <PlaceSelect />
            <select className="select" style={{ width: 'auto' }} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} aria-label={t('rp.currency')}>
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {t('rp.showIn', { currency: c })}
                </option>
              ))}
            </select>
            {user!.caps.includes('costs.view') && <DownloadButton build={() => profitDoc(reportCtx(), r, { locationId: scope ?? null, preset: PERIOD_LABEL[period] })} />}
          </>
        }
      />
      {period === 'custom' && (
        <div className="row">
          <Field label={t('range.from')}>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t('range.toLabel')}>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      )}
      <PlaceNotice hidden={hiddenDays} what="what.closedDays" />
      <div className="row-between">
        <span className="row" style={{ gap: 10, minWidth: 0, maxWidth: '100%' }}>
          <span className="muted">{t('rp.convertWith')}</span>
          <Seg value={basis} onChange={setBasis} options={[{ value: 'transaction', label: t('rp.recorded') }, { value: 'market', label: t('rp.marketNow') }]} />
        </span>
        <span className="hint">{t(`conv.${basis}`)}</span>
      </div>
      {basis === 'market' && (
        <div className={market.rates && !market.stale ? 'info-box' : 'note-box'}>
          {market.rates ? (
            <>
              {market.stale && <strong>{t('rp.marketStale')} </strong>}
              {t('rp.usingMarket', { time: fmtDateTime(market.rates.publishedAt) })}
            </>
          ) : (
            <>{t('rp.noMarket', { error: market.error ? ` (${errText(market.error)})` : '' })}</>
          )}
        </div>
      )}
      {!r.complete && (
        <div className="error-box" role="alert">
          <strong>{t('rp.incomplete')}</strong>{' '}
          {r.missingRates.length > 0 && (
            <>
              {t('rp.noRate', { list: r.missingRates.slice(0, 4).join('; '), more: r.missingRates.length > 4 ? t('rp.andMore', { n: r.missingRates.length - 4 }) : '' })}{' '}
              {basis === 'transaction' && (
                <>
                  {rich(t('rp.addRates'), { settings: <a href={href('/settings')}>{t('nav.settings')}</a>, converter: <a href={href('/convert')}>{t('nav.convert')}</a> })}{' '}
                </>
              )}
            </>
          )}
          {r.missingCosts.length > 0 && <>{t('rp.noCost', { list: r.missingCosts.join(', ') })} </>}
          {t('rp.neverGuess')}
        </div>
      )}
      <div className="grid cols-2">
        <section className="card card-pad selvedge" style={{ paddingLeft: 28 }}>
          <span className="section-title">{t('rp.profit')}</span>
          <dl className="kv" style={{ marginTop: 14 }}>
            <dt>
              {t('rp.salesValue', { pieces: r.piecesSold, days: r.counts.closedDays })}
            </dt>
            <dd>
              <Money amount={r.salesValue} currency={cur} />
              {trace(r.original.sales)}
            </dd>
            <dt>{t('rp.cogs')}</dt>
            <dd>
              <Money amount={-r.costOfGoods} currency={cur} />
              {trace(r.original.costOfGoods)}
            </dd>
            <dt className="total">{t('rp.gross')}</dt>
            <dd className="total">
              <Money amount={r.grossMargin} currency={cur} strong />
            </dd>
            <dt>{t('rp.cashDiff')}</dt>
            <dd>
              <Money amount={-r.cashDifference} currency={cur} />
              {trace(r.original.cashDifference)}
            </dd>
            <dt>{t('rp.workerExp')}</dt>
            <dd>
              <Money amount={-r.workerExpenses} currency={cur} />
              {trace(r.original.workerExpenses)}
            </dd>
            <dt>{t('rp.shipCosts')}</dt>
            <dd>
              <Money amount={-r.shipmentCosts} currency={cur} />
              {trace(r.original.shipmentCosts)}
            </dd>
            <dt>{t('rp.otherExp')}</dt>
            <dd>
              <Money amount={-r.expenses} currency={cur} />
              {trace(r.original.expenses)}
            </dd>
            <dt className="total">{r.complete ? t('rp.net') : t('rp.netIncomplete')}</dt>
            <dd className="total" style={{ color: !r.complete ? 'var(--ink-3)' : r.periodNet < 0 ? 'var(--hibiscus)' : 'var(--mangrove)' }}>
              <Money amount={r.periodNet} currency={cur} strong />
            </dd>
          </dl>
          {r.counts.closedDays === 0 && <p className="hint" style={{ marginTop: 10 }}>{t('rp.noClosed', { at: scope ? t('rp.atPlace', { place: lk.locName(scope) }) : '' })}</p>}
          {r.estimatedShipmentCosts > 0 && (
            <p className="hint" style={{ marginTop: 10 }}>
              {rich(t('rp.estimates'), { amount: <Money amount={r.estimatedShipmentCosts} currency={cur} /> })}
            </p>
          )}
        </section>
        <section className="card card-pad stack">
          <span className="section-title">{t('rp.how')}</span>
          <ul className="soft" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>{t('rp.how1')}</li>
            <li>{t('rp.how2')}</li>
            <li>
              <strong>{t('rp.how3')}</strong>
            </li>
            <li>{t('rp.how4')}</li>
          </ul>
          <span className="section-title" style={{ marginTop: 6 }}>
            {t('rp.ratesUsed')}
          </span>
          {r.ratesUsed.length === 0 ? (
            <span className="muted">{r.missingRates.length ? t('rp.noneAvail') : t('rp.noConversion', { currency: cur })}</span>
          ) : (
            <div className="stack-sm">
              {r.ratesUsed.map((u) => (
                <div key={`${u.ref}-${u.from}`}>
                  <span className="num">{rateText(u)}</span>
                  <div className="trace">
                    {t(`basis.${u.basis}` as Key)} · {u.basis === 'live' ? t('rp.publishedOn', { date: fmtDate(u.effectiveDate) }) : t('rp.sinceDate', { date: fmtDate(u.effectiveDate) })} · {u.source}
                  </div>
                </div>
              ))}
            </div>
          )}
          <span className="section-title" style={{ marginTop: 6 }}>
            {t('rp.byKind')}
          </span>
          <dl className="kv">
            {Object.entries(r.shipmentCostsByCategory).map(([k, v]) => (
              <Pair key={`s-${k}`} k={k in SHIP_COST_LABEL ? t(`lbl.shipCost.${k}` as Key) : k} v={<Money amount={v} currency={cur} />} />
            ))}
            {Object.entries(r.expensesByCategory).map(([k, v]) => (
              <Pair key={`e-${k}`} k={k in EXPENSE_LABEL ? t(`lbl.expense.${k}` as Key) : k} v={<Money amount={v} currency={cur} />} />
            ))}
            {Object.keys(r.shipmentCostsByCategory).length + Object.keys(r.expensesByCategory).length === 0 && <span className="muted">{t('rp.noCosts')}</span>}
          </dl>
        </section>
      </div>
      <section className="card">
        <div className="card-head">
          <span className="section-title">{t('rp.byGarment')}</span>
        </div>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data">
            <thead>
              <tr>
                <th>{t('c.garment')}</th>
                <th className="n">{t('c.sold')}</th>
                <th className="n">{t('w.salesValue')}</th>
                <th className="n">{t('rp.garmentCost')}</th>
                <th className="n">{t('rp.margin')}</th>
                <th className="n">{t('rp.avgCost')}</th>
              </tr>
            </thead>
            <tbody>
              {r.byGarment.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    {t('rp.noClosedSales', { at: scope ? t('rp.atPlace', { place: lk.locName(scope) }) : '' })}
                  </td>
                </tr>
              )}
              {r.byGarment.map((g) => {
                const uc = unitCosts.get(g.gt);
                return (
                  <tr key={g.gt}>
                    <td>
                      <GarmentLabel g={lk.garment(g.gt)} />
                    </td>
                    <td className="n">{g.sold}</td>
                    <td className="n">
                      <Money amount={g.sales} currency={cur} />
                    </td>
                    <td className="n">
                      {g.cost === null ? '—' : <Money amount={g.cost} currency={cur} />}
                      {(Object.keys(g.costOriginal) as Currency[]).some((c) => c !== cur) && <span className="trace" style={{ display: 'block' }}>{totalsText(g.costOriginal)}</span>}
                    </td>
                    <td className="n">{g.cost === null ? '—' : <Money amount={g.sales - g.cost} currency={cur} strong />}</td>
                    <td className="n">{basis === 'transaction' && uc?.cost != null ? <Money amount={Math.round(uc.cost)} currency={cur} /> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <AllDownloads />
    </div>
  );
}

/** Every report, with sensible default filters. Each screen also has its own download with its filters. */
function AllDownloads() {
  const { user, prefs } = useApp();
  const t = useT();
  const today = businessDate();
  const last30 = { from: addDays(today, -29), to: today, preset: 'Last 30 days' };
  const place = prefs.scope ?? null;
  const items: { id: ReportId; label: string; build: () => ReportDoc; where?: string }[] = [
    { id: 'sales-days', label: 'Sales days, last 30 days', where: '/days', build: () => salesDaysReport(reportCtx(), { ...last30, workerId: null, locationId: place, review: 'all' }) },
    { id: 'sales-lines', label: 'Sales by garment, last 30 days', build: () => salesLinesReport(reportCtx(), { ...last30, workerId: null, locationId: place, review: 'all' }) },
    { id: 'worker-records', label: 'Take / return records, last 30 days', build: () => workerRecordsReport(reportCtx(), { ...last30, workerId: null, locationId: place, review: 'all' }) },
    { id: 'purchases', label: 'All purchases', where: '/purchases', build: () => purchasesReport(reportCtx(), { status: 'all', vendorId: null, payment: 'any', from: null, to: null }) },
    { id: 'vendors', label: 'Vendors, balances and payments', where: '/vendors', build: () => vendorsReport(reportCtx()) },
    { id: 'stock', label: 'Stock now', where: '/stock', build: () => stockReport(reportCtx(), { locationId: place }) },
    { id: 'movements', label: 'Stock movements, last 30 days', build: () => movementsReport(reportCtx(), { from: last30.from, to: today, locationId: place }) },
    { id: 'shipments', label: 'All shipments with costs', where: '/shipments', build: () => shipmentsReport(reportCtx(), 'all') },
    { id: 'expenses', label: 'Expenses, last 30 days', where: '/expenses', build: () => expensesReport(reportCtx(), { ...last30, locationId: place }) },
    { id: 'catalogue', label: 'Garments and selling prices', where: '/catalogue', build: () => catalogueReport(reportCtx(), today) },
    { id: 'activity', label: 'Activity log, last 30 days', where: '/activity', build: () => activityReport(reportCtx(), { from: last30.from, who: null, group: null, flagged: false }) },
  ];
  const mine = items.filter((i) => canExport(user!.caps, i.id));
  return (
    <section className="card card-pad stack">
      <span className="section-title">{t('rp.downloads')}</span>
      <p className="hint">
        {t('rp.downloadsHint')}
        {prefs.scope ? t('rp.downloadsPlace') : ''}
      </p>
      <div className="list">
        {mine.map((i) => (
          <div key={i.id} className="list-item">
            <span style={{ flex: 1 }}>
              {t(`rp.dl.${i.id}` as Key)}
              {i.where && (
                <>
                  {' '}
                  · <a href={href(i.where)}>{t('rp.openPage')}</a>
                </>
              )}
            </span>
            <DownloadButton small build={i.build} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Pair({ k, v }: { k: string; v: ReactNode }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}
