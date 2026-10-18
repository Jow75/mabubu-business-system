import { useMemo, useState } from 'react';
import { useApp, store } from '../../lib/store';
import { describeOp, useLookups } from '../../lib/lookups';
import { navigate, href } from '../../lib/router';
import { workerDays, workerHolding, dayLines } from '../../../shared/queries';
import { businessDate, fmtDate, fmtTime } from '../../../shared/time';
import type { WorkerDay } from '../../../shared/model';
import type { Currency } from '../../../shared/money';
import { Icon } from '../../ui/Icon';
import { Empty, GarmentLabel, Money, Qty, save } from '../../ui/kit';
import { errText, rich, useT } from '../../lib/i18n';
import { Greeting } from '../../ui/Greeting';

export function WorkerToday() {
  const { ledger, user, version, records } = useApp();
  const lk = useLookups();
  const today = businessDate();
  const holding = useMemo(() => workerHolding(ledger, user!.id), [ledger, user, version]);
  const held = [...holding.entries()].filter(([, n]) => n > 0);
  const total = held.reduce((s, [, n]) => s + n, 0);
  const days = useMemo(() => workerDays(ledger).filter((d) => d.workerId === user!.id), [ledger, user, version]);
  const todayDay = days.find((d) => d.workDate === today);
  const openEarlier = days.filter((d) => d.status === 'open' && d.workDate < today && (Object.keys(d.issued).length || Object.keys(d.returned).length));
  const t = useT();

  const todayOps = useMemo(
    () =>
      [...ledger.ops.values()]
        .filter((r) => r.op.actorId === user!.id || (r.op.payload as { workerId?: string }).workerId === user!.id)
        .filter((r) => businessDate(r.op.deviceTime) === today)
        .sort((a, b) => b.op.deviceTime.localeCompare(a.op.deviceTime)),
    [ledger, user, version, today],
  );

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div>
        <div className="eyebrow">{fmtDate(today)}</div>
        <Greeting name={user!.name} seed={user!.id} />
      </div>

      {openEarlier.map((d) => (
        <button key={d.key} className="note-box row-between" style={{ border: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => navigate(`/close?date=${d.workDate}`)}>
          <span>
            {t('w.notClosed', { date: fmtDate(d.workDate) })}
          </span>
          <span className="row" style={{ gap: 4, fontWeight: 700 }}>
            {t('w.closeIt')} <Icon name="right" size={16} />
          </span>
        </button>
      ))}

      <section className="worker-hero">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ opacity: 0.75, fontWeight: 600 }}>{t('w.withYou')}</div>
            <div className="big">{total}</div>
            <div style={{ opacity: 0.75 }}>{t('w.pieces')}</div>
          </div>
          {todayDay?.status === 'settled' ? (
            <span className="pill green">{t('w.todayClosed')}</span>
          ) : todayDay ? (
            <span className="pill saffron">{t('w.outSince', { time: fmtTime(todayDay.firstActivityAt) })}</span>
          ) : (
            <span className="pill">{t('w.notStarted')}</span>
          )}
        </div>
        {held.length > 0 && (
          <div className="stack-sm" style={{ marginTop: 16, marginBottom: 14 }}>
            {held.map(([gt, n]) => (
              <div key={gt} className="row-between" style={{ fontSize: 14 }}>
                <span className="gt">
                  <span className="swatch" style={{ background: lk.garment(gt)?.swatch }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{lk.garment(gt)?.code}</span>
                  <span style={{ opacity: 0.8 }}>{lk.garment(gt)?.name}</span>
                </span>
                <strong className="num">{n}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      {todayDay?.status === 'settled' && (
        <div className="note-box">
          <strong>{t('w.closedTitle')}</strong> {t('w.closedBody')}
        </div>
      )}

      <div className="action-grid">
        <button className="action" onClick={() => navigate('/take')} disabled={todayDay?.status === 'settled'}>
          <span className="ico">
            <Icon name="out" size={22} />
          </span>
          <span>
            {t('w.take')}
            <small>{t('w.takeSub')}</small>
          </span>
        </button>
        <button className="action lagoon" onClick={() => navigate('/return')} disabled={total === 0 || todayDay?.status === 'settled'}>
          <span className="ico">
            <Icon name="in" size={22} />
          </span>
          <span>
            {t('w.return')}
            <small>{t('w.returnSub')}</small>
          </span>
        </button>
        <button className="action saffron" onClick={() => navigate('/close')} disabled={todayDay?.status === 'settled'}>
          <span className="ico">
            <Icon name="wallet" size={22} />
          </span>
          <span>
            {t('w.closeDay')}
            <small>{t('w.closeDaySub')}</small>
          </span>
        </button>
      </div>

      {todayDay?.settlement && <SettlementCard day={todayDay} />}

      <section className="card">
        <div className="card-head">
          <span className="section-title">{t('w.todaySoFar')}</span>
          <a href={href('/history')} className="btn btn-ghost btn-sm">
            {t('c.history')}
          </a>
        </div>
        <div className="card-body">
          {todayOps.length === 0 ? (
            <span className="muted">{t('w.nothingToday')}</span>
          ) : (
            <div className="timeline">
              {todayOps.map((r) => {
                const rec = records.get(r.op.id);
                const pending = rec?.status === 'pending';
                const cancelled = Boolean(r.voidedBy);
                const canCancel = !cancelled && r.status !== 'rejected' && (r.op.type === 'worker.issue' || r.op.type === 'worker.return') && r.op.actorId === user!.id && todayDay?.status !== 'settled';
                return (
                  <div key={r.op.id} className="tl-item">
                    <span className="tl-time">{fmtTime(r.op.deviceTime)}</span>
                    <span className="tl-rail">
                      <span className={`tl-knot ${r.status === 'rejected' ? 'red' : cancelled ? 'muted' : r.op.type === 'worker.settle' ? 'green' : r.op.type === 'worker.return' ? 'lagoon' : 'saffron'}`} />
                    </span>
                    <div className="stack-sm">
                      <span style={cancelled ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>{describeOp(r.op, lk, ledger, t)}</span>
                      <span className="row" style={{ gap: 6 }}>
                        {pending && <span className="pill saffron">{t('w.savedOnPhone')}</span>}
                        {r.status === 'rejected' && <span className="pill red">{t('w.notAccepted', { error: errText(rec?.error) })}</span>}
                        {cancelled && <span className="pill">{t('c.cancelled')}</span>}
                        {canCancel && <CancelButton opId={r.op.id} />}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function CancelButton({ opId }: { opId: string }) {
  const t = useT();
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState('');
  if (!ask)
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setAsk(true)}>
        <Icon name="undo" size={15} /> {t('w.wrongCancel')}
      </button>
    );
  return (
    <span className="row" style={{ gap: 6 }}>
      <input className="input" style={{ minHeight: 34, width: 200 }} autoFocus placeholder={t('w.whyPlaceholder')} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn btn-sm btn-danger" disabled={reason.trim().length < 3} onClick={() => void save(() => store.submit('op.void', { targetId: opId, reason: reason.trim() }), t('w.cancelledToast'))}>
        {t('w.cancelRecord')}
      </button>
    </span>
  );
}

function SettlementCard({ day }: { day: WorkerDay }) {
  const t = useT();
  const s = day.settlement!;
  const cur = s.currency as Currency;
  return (
    <section className={`variance ${s.variance === 0 ? 'ok' : s.variance > 0 ? 'short' : 'over'}`}>
      <div className="row-between">
        <strong>{s.variance === 0 ? t('w.dayBalanced') : s.variance > 0 ? t('w.dayShort') : t('w.dayOver')}</strong>
        {day.review && <span className={`pill ${day.review.decision === 'approved' ? 'green' : 'saffron'}`}>{day.review.decision === 'approved' ? t('c.approved') : t('w.managerQuestion')}</span>}
      </div>
      <dl className="kv" style={{ marginTop: 10, color: 'var(--ink)' }}>
        <dt>{t('c.sold')}</dt>
        <dd>
          <Qty n={s.lines.reduce((a, l) => a + l.sold, 0)} />
        </dd>
        <dt>{t('w.salesValue')}</dt>
        <dd>
          <Money amount={s.expected} currency={cur} />
        </dd>
        <dt>{t('c.handedOver')}</dt>
        <dd>
          <Money amount={s.handed} currency={cur} />
        </dd>
        {s.variance !== 0 && (
          <>
            <dt>{t('w.difference')}</dt>
            <dd>
              <Money amount={s.variance} currency={cur} />
            </dd>
          </>
        )}
      </dl>
      {day.review?.note && <p style={{ marginTop: 10, color: 'var(--ink)' }}>{t('w.managerSays', { note: day.review.note })}</p>}
    </section>
  );
}

export function WorkerHistory() {
  const { ledger, user, version } = useApp();
  const lk = useLookups();
  const t = useT();
  const days = useMemo(
    () => workerDays(ledger).filter((d) => d.workerId === user!.id && (d.status === 'settled' || Object.keys(d.issued).length > 0)),
    [ledger, user, version],
  );
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div>
        <div className="eyebrow">{t('w.yourWork')}</div>
        <h1 className="page-title" style={{ marginTop: 6 }}>
          {t('c.history')}
        </h1>
      </div>
      {days.length === 0 && <Empty icon="calendar" title={t('w.noDays')}>{t('w.noDaysBody')}</Empty>}
      {days.map((d) => (
        <section key={d.key} className="card">
          <div className="card-head">
            <span className="section-title">{fmtDate(d.workDate)}</span>
            {d.status === 'settled' ? (
              d.settlement!.variance === 0 ? (
                <span className="pill green">{t('c.balanced')}</span>
              ) : (
                <span className={`pill ${d.settlement!.variance > 0 ? 'red' : 'saffron'}`}>
                  {rich(t(d.settlement!.variance > 0 ? 'w.short' : 'w.over'), { amount: <Money amount={Math.abs(d.settlement!.variance)} currency={d.settlement!.currency} /> })}
                </span>
              )
            ) : (
              <span className="pill saffron">{t('c.open')}</span>
            )}
          </div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t('c.garment')}</th>
                    <th className="n">{t('w.took')}</th>
                    <th className="n">{t('w.back')}</th>
                    <th className="n">{t('c.sold')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dayLines(d).map((l) => (
                    <tr key={l.gt}>
                      <td>
                        <GarmentLabel g={lk.garment(l.gt)} showName={false} />
                      </td>
                      <td className="n">{l.issued}</td>
                      <td className="n">{l.returned}</td>
                      <td className="n">{l.sold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.settlement && (
              <div className="row-between" style={{ marginTop: 10 }}>
                <span className="muted">{t('c.handedOver')}</span>
                <Money amount={d.settlement.handed} currency={d.settlement.currency} strong />
              </div>
            )}
            {d.review?.note && <p className="note-box" style={{ marginTop: 10 }}>{t('w.managerSays', { note: d.review.note })}</p>}
          </div>
        </section>
      ))}
    </div>
  );
}
