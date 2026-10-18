import { useMemo, useState } from 'react';
import { useApp, store } from '../../lib/store';
import { describeOp, useLookups } from '../../lib/lookups';
import { href, navigate } from '../../lib/router';
import { stockByLocation, sumRows, vendorAccounts, workerDays } from '../../../shared/queries';
import { addDays, businessDate, fmtDate, fmtDateShort, fmtTime } from '../../../shared/time';
import type { Purchase, Shipment, WorkerDay } from '../../../shared/model';
import { formatMoney, type Currency } from '../../../shared/money';
import { rich, useT } from '../../lib/i18n';
import type { Key } from '../../../shared/i18n';
import { useGreeting } from '../../ui/Greeting';
import { Icon } from '../../ui/Icon';
import { Money, Monogram, PageHead, Seg, Stat } from '../../ui/kit';

export function ScopeSwitch() {
  const { prefs } = useApp();
  const lk = useLookups();
  const t = useT();
  return (
    <Seg
      label={t('scope.label')}
      value={prefs.scope ?? 'all'}
      onChange={(v) => store.setPrefs({ scope: v === 'all' ? null : v })}
      options={[{ value: 'all', label: t('scope.all') }, ...lk.locations.filter((l) => l.active).map((l) => ({ value: l.id, label: l.name }))]}
    />
  );
}

export function Overview() {
  const { ledger, user, version, prefs, records, demo } = useApp();
  const lk = useLookups();
  const t = useT();
  const greet = useGreeting(user!.name, user!.id);
  const caps = user!.caps;
  const today = businessDate();
  const scope = prefs.scope;

  const data = useMemo(() => {
    const byLoc = stockByLocation(ledger);
    const rows = scope ? [...(byLoc.get(scope)?.values() ?? [])] : [...byLoc.values()].flatMap((m) => [...m.values()]);
    const totals = sumRows(rows);
    const days = workerDays(ledger).filter((d) => !scope || d.locationId === scope);
    const shipments = ledger.list<Shipment>('shipment');
    const purchases = ledger.list<Purchase>('purchase');
    return { totals, days, shipments, purchases };
  }, [ledger, version, scope]);

  const sellCurrency = (lk.loc(scope)?.kind === 'selling' ? lk.loc(scope)?.currency : lk.locations.find((l) => l.kind === 'selling')?.currency) ?? 'KMF';
  const todayDays = data.days.filter((d) => d.workDate === today && (d.status === 'settled' || Object.keys(d.issued).length));
  const salesToday = todayDays.reduce((s, d) => s + (d.settlement?.currency === sellCurrency ? d.settlement.expected : 0), 0);
  const weekAgo = addDays(today, -6);
  const weekDays = data.days.filter((d) => d.settlement && d.workDate >= weekAgo && d.settlement.currency === sellCurrency);
  const weekVariance = weekDays.reduce((s, d) => s + d.settlement!.variance, 0);
  const owed = vendorAccounts(ledger).filter((b) => b.balance > 0);
  const inTransit = data.shipments.filter((s) => s.status === 'in_transit' || s.status === 'partial');

  // Things a manager should look at
  const attention: { key: string; text: string; to: string; tone: 'red' | 'saffron' | 'lagoon' }[] = [];
  const rejectedMine = [...records.values()].filter((r) => r.status === 'rejected');
  if (rejectedMine.length) attention.push({ key: 'rej', text: t('ov.att.rejected', { n: rejectedMine.length }), to: '/me', tone: 'red' });
  for (const d of data.days) {
    if (d.status === 'settled' && !d.review && d.settlement!.variance !== 0) {
      attention.push({ key: `v-${d.key}`, text: t(d.settlement!.variance > 0 ? 'ov.att.short' : 'ov.att.over', { name: lk.personName(d.workerId), amount: formatMoney(d.settlement!.currency, Math.abs(d.settlement!.variance)), date: fmtDateShort(d.workDate) }), to: `/days/${d.workerId}/${d.workDate}`, tone: d.settlement!.variance > 0 ? 'red' : 'saffron' });
    }
    if (d.status === 'open' && d.workDate < today && Object.keys(d.issued).length) {
      attention.push({ key: `o-${d.key}`, text: t('ov.att.notClosed', { name: lk.personName(d.workerId), date: fmtDateShort(d.workDate) }), to: `/days/${d.workerId}/${d.workDate}`, tone: 'saffron' });
    }
  }
  for (const s of inTransit) {
    if (s.expectedDate && s.expectedDate < today) attention.push({ key: `s-${s.id}`, text: t('ov.att.late', { code: s.code, date: fmtDateShort(s.expectedDate) }), to: `/shipments/${s.id}`, tone: 'saffron' });
  }
  for (const p of data.purchases) {
    if (p.status === 'active' && p.intake === 'inspection' && p.lines.some((l) => l.qty - l.accepted - l.rejected > 0)) {
      attention.push({ key: `p-${p.id}`, text: t('ov.att.inspect', { vendor: lk.vendor(p.vendorId)?.name ?? t('c.vendor'), date: fmtDateShort(p.date) }), to: `/purchases/${p.id}`, tone: 'lagoon' });
    }
  }
  if (caps.includes('audit.view')) {
    const flagged = [...ledger.ops.values()]
      .map((r) => ({ r, rec: records.get(r.op.id) }))
      .filter(({ r, rec }) => !r.voidedBy && (rec?.flags ?? []).some((f) => f.code !== 'CASH_VARIANCE') && businessDate(r.op.deviceTime) >= addDays(today, -7));
    if (flagged.length) attention.push({ key: 'flags', text: t('ov.att.flags', { n: flagged.length, list: [...new Set(flagged.flatMap(({ rec }) => rec!.flags.map((f) => t(`lbl.flag.${f.code}` as Key))))].slice(0, 3).join(', ') }), to: '/activity?flagged=1', tone: 'saffron' });
  }

  const recent = [...ledger.ops.values()].filter((r) => r.status !== 'rejected').sort((a, b) => b.op.deviceTime.localeCompare(a.op.deviceTime)).slice(0, 7);

  return (
    <div className="page">
      <PageHead
        eyebrow={fmtDate(today)}
        title={greet.main}
        lead={
          greet.second || demo ? (
            <>
              {greet.second && (
                <span className="greeting-alt" lang="fr" style={{ display: 'block' }}>
                  {greet.second}
                </span>
              )}
              {demo && t('ov.demoLead')}
            </>
          ) : undefined
        }
        actions={<ScopeSwitch />}
      />

      <div className="grid cols-4">
        <Stat label={t('ov.ready')} value={data.totals.avail.toLocaleString('en-US')} sub={scope ? t('ov.piecesIn', { place: lk.locName(scope) }) : t('ov.piecesAll')} />
        <Stat label={t('ov.withWorkers')} value={data.totals.withWorkers.toLocaleString('en-US')} sub={t('ov.outToday', { n: todayDays.filter((d) => d.status === 'open').length })} tone="saffron" />
        <Stat label={t('ov.onTheWay')} value={data.totals.incoming.toLocaleString('en-US')} sub={t('ov.notReceived', { n: inTransit.length })} tone="lagoon" />
        {caps.includes('costs.view') || caps.includes('workers.reconcile') ? (
          <Stat
            label={t('ov.salesToday')}
            value={<Money amount={salesToday} currency={sellCurrency} />}
            sub={
              <>
                {t('ov.last7')}{' '}
                {weekVariance === 0 ? (
                  t('ov.cashBalanced')
                ) : (
                  <span style={{ color: weekVariance > 0 ? 'var(--hibiscus)' : 'var(--saffron-ink)', fontWeight: 650 }}>
                    {rich(t(weekVariance > 0 ? 'ov.shortAmt' : 'ov.overAmt'), { amount: <Money amount={Math.abs(weekVariance)} currency={sellCurrency} /> })}
                  </span>
                )}
              </>
            }
          />
        ) : (
          <Stat label={t('ov.awaitInspection')} value={data.totals.inspection.toLocaleString('en-US')} sub={t('w.pieces')} />
        )}
      </div>

      <div className="grid cols-2">
        <section className="card">
          <div className="card-head">
            <span className="section-title">{t('ov.attention')}</span>
            <span className="muted">{attention.length || ''}</span>
          </div>
          <div className="list" style={{ marginTop: 8 }}>
            {attention.length === 0 && <div className="list-item muted">{t('ov.nothingWaiting')}</div>}
            {attention.slice(0, 8).map((a) => (
              <a key={a.key} className="list-item" href={href(a.to)}>
                <span className={`pill ${a.tone}`} style={{ padding: 4 }}>
                  <Icon name={a.tone === 'red' ? 'alert' : a.tone === 'lagoon' ? 'inspect' : 'flag'} size={15} />
                </span>
                <span style={{ flex: 1 }}>{a.text}</span>
                <Icon name="right" size={16} />
              </a>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <span className="section-title">{t('ov.workersToday')}</span>
            {caps.includes('workers.reconcile') && (
              <a className="btn btn-ghost btn-sm" href={href('/days')}>
                {t('ov.allDays')}
              </a>
            )}
          </div>
          <div className="list" style={{ marginTop: 8 }}>
            {todayDays.length === 0 && <div className="list-item muted">{t('ov.noOneToday')}</div>}
            {todayDays.map((d) => (
              <TodayWorker key={d.key} day={d} />
            ))}
          </div>
        </section>
      </div>

      {(caps.includes('costs.view') || caps.includes('workers.reconcile')) && <DailySales days={data.days} currency={sellCurrency as Currency} today={today} />}

      <div className="grid cols-2">
        {caps.includes('costs.view') && (
          <section className="card">
            <div className="card-head">
              <span className="section-title">{t('ov.owed')}</span>
              <a className="btn btn-ghost btn-sm" href={href('/vendors')}>
                {t('nav.vendors')}
              </a>
            </div>
            <div className="list" style={{ marginTop: 8 }}>
              {owed.length === 0 && <div className="list-item muted">{t('ov.nothingOwed')}</div>}
              {owed.map((b) => (
                <a key={b.vendorId + b.currency} className="list-item" href={href(`/vendors/${b.vendorId}`)}>
                  <span style={{ flex: 1 }}>{lk.vendor(b.vendorId)?.name}</span>
                  <Money amount={b.balance} currency={b.currency} strong />
                </a>
              ))}
            </div>
          </section>
        )}
        <section className="card">
          <div className="card-head">
            <span className="section-title">{t('ov.latest')}</span>
            {caps.includes('audit.view') && (
              <a className="btn btn-ghost btn-sm" href={href('/activity')}>
                {t('nav.activity')}
              </a>
            )}
          </div>
          <div className="card-body">
            <div className="timeline">
              {recent.map((r) => (
                <div key={r.op.id} className="tl-item">
                  <span className="tl-time">{businessDate(r.op.deviceTime) === today ? fmtTime(r.op.deviceTime) : fmtDateShort(businessDate(r.op.deviceTime))}</span>
                  <span className="tl-rail">
                    <span className={`tl-knot ${r.voidedBy ? 'muted' : ''}`} />
                  </span>
                  <span style={r.voidedBy ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>
                    {describeOp(r.op, lk, ledger, t)}
                    <span className="muted"> · {records.get(r.op.id)?.actorName ?? lk.personName(r.op.actorId)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function TodayWorker({ day }: { day: WorkerDay }) {
  const lk = useLookups();
  const t = useT();
  const took = Object.values(day.issued).reduce((s, n) => s + n, 0);
  const s = day.settlement;
  return (
    <a className="list-item" href={href(`/days/${day.workerId}/${day.workDate}`)}>
      <Monogram name={lk.personName(day.workerId)} id={day.workerId} small />
      <span style={{ flex: 1 }}>
        <strong>{lk.personName(day.workerId)}</strong>
        <span className="muted">
          {' '}
          · {t('ov.tookAt', { n: took, time: fmtTime(day.firstActivityAt) })}
        </span>
      </span>
      {s ? (
        s.variance === 0 ? (
          <span className="pill green">{t('ov.closedBalanced')}</span>
        ) : (
          <span className={`pill ${s.variance > 0 ? 'red' : 'saffron'}`}>
            {rich(t(s.variance > 0 ? 'w.short' : 'w.over'), { amount: <Money amount={Math.abs(s.variance)} currency={s.currency} /> })}
          </span>
        )
      ) : (
        <span className="pill saffron">{t('ov.outSelling')}</span>
      )}
    </a>
  );
}

/** Sales value per day, last 14 days. One series → one hue; today highlighted. */
function DailySales({ days, currency, today }: { days: WorkerDay[]; currency: Currency; today: string }) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const series = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(today, i - 13);
    const value = days.filter((d) => d.workDate === date && d.settlement?.currency === currency).reduce((s, d) => s + d.settlement!.expected, 0);
    return { date, value };
  });
  const max = Math.max(1, ...series.map((s) => s.value));
  const nice = niceCeil(max);
  const W = 700;
  const H = 180;
  const left = 8;
  const bottom = 22;
  const bw = (W - left) / series.length;
  const total = series.reduce((s, d) => s + d.value, 0);
  const h = hover !== null ? series[hover]! : null;
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <span className="section-title">{t('ov.chartTitle')}</span>
          <div className="hint">{t('ov.chartHint', { amount: formatMoney(currency, total) })}</div>
        </div>
        <div className="muted num" style={{ minHeight: 20 }} aria-live="polite">
          {h ? (
            <>
              {fmtDate(h.date)}: <Money amount={h.value} currency={currency} strong />
            </>
          ) : (
            t('ov.chartHover')
          )}
        </div>
      </div>
      <div className="card-body">
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('ov.chartAria', { amount: formatMoney(currency, total) })} onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line className="grid-line" x1={left} x2={W} y1={(H - bottom) * (1 - f)} y2={(H - bottom) * (1 - f)} />
              {f > 0 && (
                <text x={left} y={(H - bottom) * (1 - f) - 4} textAnchor="start">
                  {formatMoney(currency, nice * f)}
                </text>
              )}
            </g>
          ))}
          {series.map((s, i) => {
            const bh = (s.value / nice) * (H - bottom);
            const w = Math.min(28, bw * 0.5);
            const x = left + i * bw + (bw - w) / 2;
            const y = H - bottom - bh;
            const r = Math.min(4, bh / 2, w / 2);
            return (
              <g key={s.date} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} style={{ cursor: 'default' }}>
                <rect x={left + i * bw} y={0} width={bw} height={H} fill="transparent" />
                {bh > 0 && (
                  <path
                    className={`bar-rect ${s.date === today ? 'today' : ''}`}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                    d={`M${x},${H - bottom} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${H - bottom} Z`}
                  />
                )}
                {(i % 2 === 1 || s.date === today) && (
                  <text x={x + w / 2} y={H - 6} textAnchor="middle">
                    {s.date === today ? t('ov.today') : fmtDateShort(s.date)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => navigate('/reports')}>
          {t('ov.fullReport')} <Icon name="right" size={15} />
        </button>
      </div>
    </section>
  );
}

function niceCeil(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
