import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../../lib/store';
import { useLookups } from '../../lib/lookups';
import { href } from '../../lib/router';
import { useMarketRates } from '../../lib/fx';
import { reportCtx } from '../../lib/report-ctx';
import { profitReport, weightedCosts } from '../../../shared/queries';
import { CONVERSION_BASIS_LABEL, RATE_BASIS_LABEL, type ConversionBasis } from '../../../shared/fx';
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
  const trace = (t: Partial<Record<Currency, number>>) => {
    const others = (Object.keys(t) as Currency[]).filter((c) => c !== cur);
    return others.length ? <span className="trace">as paid: {totalsText(t)}</span> : null;
  };

  return (
    <div className="page">
      <PageHead
        title="Reports"
        lead={`${fmtDate(range.from)} – ${fmtDate(range.to)} · ${scope ? lk.locName(scope) : 'all places'}. Sales are not profit: the lines below show each cost taken away.`}
        actions={
          <>
            <Seg value={period} onChange={setPeriod} options={(['month', 'last', '30', 'custom'] as const).map((k) => ({ value: k, label: k === 'custom' ? 'Custom' : PERIOD_LABEL[k] }))} />
            <PlaceSelect />
            <select className="select" style={{ width: 'auto' }} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} aria-label="Report currency">
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  Show in {c}
                </option>
              ))}
            </select>
            {user!.caps.includes('costs.view') && <DownloadButton build={() => profitDoc(reportCtx(), r, { locationId: scope ?? null, preset: PERIOD_LABEL[period] })} />}
          </>
        }
      />
      {period === 'custom' && (
        <div className="row">
          <Field label="From">
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      )}
      <PlaceNotice hidden={hiddenDays} what="closed sales days in this period" />
      <div className="row-between">
        <span className="row" style={{ gap: 10 }}>
          <span className="muted">Convert with</span>
          <Seg value={basis} onChange={setBasis} options={[{ value: 'transaction', label: 'Recorded rates (cost)' }, { value: 'market', label: 'Today’s market (value now)' }]} />
        </span>
        <span className="hint">{CONVERSION_BASIS_LABEL[basis]}</span>
      </div>
      {basis === 'market' && (
        <div className={market.rates && !market.stale ? 'info-box' : 'note-box'}>
          {market.rates ? (
            <>
              {market.stale && <strong>Market rates may be out of date. </strong>}
              Using market reference rates published {fmtDateTime(market.rates.publishedAt)}. This shows what the amounts are worth at today’s rates; it is not the historical cost, and past profit is not rewritten.
            </>
          ) : (
            <>No market rates on this device yet{market.error ? ` (${market.error})` : ''}. Amounts in other currencies are left out until rates load.</>
          )}
        </div>
      )}
      {!r.complete && (
        <div className="error-box" role="alert">
          <strong>Incomplete — do not use these totals as the final profit.</strong>{' '}
          {r.missingRates.length > 0 && (
            <>
              No exchange rate for {r.missingRates.slice(0, 4).join('; ')}
              {r.missingRates.length > 4 ? ` and ${r.missingRates.length - 4} more` : ''}: those amounts are left out. {basis === 'transaction' && <>Add rates in <a href={href('/settings')}>Settings</a> or the <a href={href('/convert')}>converter</a>. </>}
            </>
          )}
          {r.missingCosts.length > 0 && <>No purchase cost known for {r.missingCosts.join(', ')}. </>}
          The app never guesses a rate.
        </div>
      )}
      <div className="grid cols-2">
        <section className="card card-pad selvedge" style={{ paddingLeft: 28 }}>
          <span className="section-title">Profit for the period</span>
          <dl className="kv" style={{ marginTop: 14 }}>
            <dt>
              Sales value ({r.piecesSold} pieces, {r.counts.closedDays} closed day{r.counts.closedDays === 1 ? '' : 's'})
            </dt>
            <dd>
              <Money amount={r.salesValue} currency={cur} />
              {trace(r.original.sales)}
            </dd>
            <dt>− Cost of those garments</dt>
            <dd>
              <Money amount={-r.costOfGoods} currency={cur} />
              {trace(r.original.costOfGoods)}
            </dd>
            <dt className="total">Gross margin</dt>
            <dd className="total">
              <Money amount={r.grossMargin} currency={cur} strong />
            </dd>
            <dt>− Cash short (+) / over (−) from sales days</dt>
            <dd>
              <Money amount={-r.cashDifference} currency={cur} />
              {trace(r.original.cashDifference)}
            </dd>
            <dt>− Spent by workers from sales</dt>
            <dd>
              <Money amount={-r.workerExpenses} currency={cur} />
              {trace(r.original.workerExpenses)}
            </dd>
            <dt>− Shipment costs</dt>
            <dd>
              <Money amount={-r.shipmentCosts} currency={cur} />
              {trace(r.original.shipmentCosts)}
            </dd>
            <dt>− Other expenses</dt>
            <dd>
              <Money amount={-r.expenses} currency={cur} />
              {trace(r.original.expenses)}
            </dd>
            <dt className="total">{r.complete ? 'Net for the period' : 'Net (incomplete)'}</dt>
            <dd className="total" style={{ color: !r.complete ? 'var(--ink-3)' : r.periodNet < 0 ? 'var(--hibiscus)' : 'var(--mangrove)' }}>
              <Money amount={r.periodNet} currency={cur} strong />
            </dd>
          </dl>
          {r.counts.closedDays === 0 && <p className="hint" style={{ marginTop: 10 }}>No closed sales days in this period{scope ? ` at ${lk.locName(scope)}` : ''}, so there is no sales value. Costs dated in the period still count.</p>}
          {r.estimatedShipmentCosts > 0 && (
            <p className="hint" style={{ marginTop: 10 }}>
              Includes <Money amount={r.estimatedShipmentCosts} currency={cur} /> of shipment costs that are still estimates.
            </p>
          )}
        </section>
        <section className="card card-pad stack">
          <span className="section-title">How these numbers are worked out</span>
          <ul className="soft" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Sales value counts only closed sales days dated in the period, at the prices recorded when each day was closed.</li>
            <li>Garment cost = pieces sold × the average purchase price of that garment type (accepted pieces only). Each purchase is converted with the rate in force on its own date.</li>
            <li>Shipment costs and expenses count in the period they are dated. They are not yet spread per piece.</li>
            <li>Every amount stays saved in the currency it was paid in; “as paid” under each line shows those original amounts, so the conversion can be checked.</li>
          </ul>
          <span className="section-title" style={{ marginTop: 6 }}>
            Exchange rates used
          </span>
          {r.ratesUsed.length === 0 ? (
            <span className="muted">{r.missingRates.length ? 'None available.' : `No conversion needed — everything was already in ${cur}.`}</span>
          ) : (
            <div className="stack-sm">
              {r.ratesUsed.map((u) => (
                <div key={`${u.ref}-${u.from}`}>
                  <span className="num">{rateText(u)}</span>
                  <div className="trace">
                    {RATE_BASIS_LABEL[u.basis]} · {u.basis === 'live' ? `published ${fmtDate(u.effectiveDate)}` : `since ${fmtDate(u.effectiveDate)}`} · {u.source}
                  </div>
                </div>
              ))}
            </div>
          )}
          <span className="section-title" style={{ marginTop: 6 }}>
            Costs by kind
          </span>
          <dl className="kv">
            {Object.entries(r.shipmentCostsByCategory).map(([k, v]) => (
              <Pair key={`s-${k}`} k={SHIP_COST_LABEL[k as keyof typeof SHIP_COST_LABEL] ?? k} v={<Money amount={v} currency={cur} />} />
            ))}
            {Object.entries(r.expensesByCategory).map(([k, v]) => (
              <Pair key={`e-${k}`} k={EXPENSE_LABEL[k as keyof typeof EXPENSE_LABEL] ?? k} v={<Money amount={v} currency={cur} />} />
            ))}
            {Object.keys(r.shipmentCostsByCategory).length + Object.keys(r.expensesByCategory).length === 0 && <span className="muted">No costs in this period.</span>}
          </dl>
        </section>
      </div>
      <section className="card">
        <div className="card-head">
          <span className="section-title">By garment</span>
        </div>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Garment</th>
                <th className="n">Sold</th>
                <th className="n">Sales value</th>
                <th className="n">Garment cost</th>
                <th className="n">Margin</th>
                <th className="n">Avg cost / piece</th>
              </tr>
            </thead>
            <tbody>
              {r.byGarment.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No closed sales in this period{scope ? ` at ${lk.locName(scope)}` : ''}.
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
      <span className="section-title">Downloads</span>
      <p className="hint">PDF to read or share, Excel or CSV for a spreadsheet. Each page also has its own Download button that follows the filters chosen there{prefs.scope ? '; these use the place filter that is on now' : ''}.</p>
      <div className="list">
        {mine.map((i) => (
          <div key={i.id} className="list-item">
            <span style={{ flex: 1 }}>
              {i.label}
              {i.where && (
                <>
                  {' '}
                  · <a href={href(i.where)}>open page</a>
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
