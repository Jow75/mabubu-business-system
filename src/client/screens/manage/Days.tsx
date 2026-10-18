import { useMemo, useState, type ReactNode } from 'react';
import { store, useApp } from '../../lib/store';
import { describeOp, useLookups } from '../../lib/lookups';
import { href, navigate } from '../../lib/router';
import { dayLines } from '../../../shared/queries';
import { REVIEW_FILTERS, REVIEW_LABEL, dayTotals, salesDaysReport, salesLinesReport, selectDays, workerRecordsReport, type DayFilter, type ReviewFilter } from '../../../shared/reports';
import { K, type WorkerDay } from '../../../shared/model';
import { businessDate, fmtDate, fmtDateShort, fmtDuration, fmtTime } from '../../../shared/time';
import { FLAG_LABEL } from '../../lib/labels';
import { reportCtx } from '../../lib/report-ctx';
import { Icon } from '../../ui/Icon';
import { Empty, Field, GarmentLabel, Money, Monogram, PageHead, Sheet, save } from '../../ui/kit';
import { DateRangeControl, DownloadButton, PlaceNotice, PlaceSelect, useDateRange } from '../../ui/Reporting';
import { VoidButton } from '../../ui/VoidButton';

function VarianceCell({ d }: { d: WorkerDay }) {
  const s = d.settlement;
  if (!s) return <span className="pill saffron">Open</span>;
  if (s.variance === 0) return <span className="pill green">Balanced</span>;
  return (
    <span className={`pill ${s.variance > 0 ? 'red' : 'saffron'}`}>
      {s.variance > 0 ? 'Short ' : 'Over '}
      <Money amount={Math.abs(s.variance)} currency={s.currency} />
    </span>
  );
}

export function DaysPage() {
  const { ledger, version, prefs } = useApp();
  const lk = useLookups();
  const dr = useDateRange('7');
  const [who, setWho] = useState('all');
  const [review, setReview] = useState<ReviewFilter>('all');
  const [startFor, setStartFor] = useState(false);
  const filter: DayFilter = { from: dr.range.from, to: dr.range.to, workerId: who === 'all' ? null : who, locationId: prefs.scope, review, preset: dr.range.label };
  const days = useMemo(() => selectDays(ledger, filter), [ledger, version, filter.from, filter.to, filter.workerId, filter.locationId, filter.review]);
  // Days at other places that the place filter hides (so an empty list is never a mystery).
  const hidden = useMemo(() => (prefs.scope ? selectDays(ledger, { ...filter, locationId: null }).length - days.length : 0), [ledger, version, days, prefs.scope]);
  const workers = lk.people.filter((p) => p.active);
  const sellCurrency = (lk.loc(prefs.scope)?.kind === 'selling' ? lk.loc(prefs.scope)?.currency : lk.locations.find((l) => l.kind === 'selling')?.currency) ?? 'KMF';
  const all = dayTotals(days);
  const totals = all.find((t) => t.currency === sellCurrency) ?? { sales: 0, handed: 0, variance: 0, days: 0 };
  const otherCurrencies = all.filter((t) => t.currency !== sellCurrency);
  return (
    <div className="page">
      <PageHead
        title="Sales days"
        lead="Each worker’s day: garments taken, returned and sold, and whether the money adds up."
        actions={
          <>
            <DownloadButton build={() => salesDaysReport(reportCtx(), filter)} />
            <button className="btn" onClick={() => setStartFor(true)}>
              <Icon name="plus" size={18} /> Record for a worker
            </button>
          </>
        }
      />
      <div className="row">
        <DateRangeControl r={dr} />
        <select className="select" style={{ width: 'auto' }} aria-label="Worker" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="all">Everyone</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} aria-label="Status" value={review} onChange={(e) => setReview(e.target.value as ReviewFilter)}>
          {REVIEW_FILTERS.map((r) => (
            <option key={r} value={r}>
              {REVIEW_LABEL[r]}
            </option>
          ))}
        </select>
        <PlaceSelect />
      </div>
      <PlaceNotice hidden={hidden} what="sales days" />
      <div className="grid cols-3">
        <div className="card stat">
          <span className="eyebrow">Sales value (closed days)</span>
          <span className="stat-value">
            <Money amount={totals.sales} currency={sellCurrency} />
          </span>
          <span className="stat-sub">
            {totals.days} closed day{totals.days === 1 ? '' : 's'} · {dr.range.label.toLowerCase()}
            {otherCurrencies.map((t) => (
              <span key={t.currency}>
                {' '}
                · plus <Money amount={t.sales} currency={t.currency} />
              </span>
            ))}
          </span>
        </div>
        <div className="card stat">
          <span className="eyebrow">Handed over</span>
          <span className="stat-value">
            <Money amount={totals.handed} currency={sellCurrency} />
          </span>
          <span className="stat-sub">cash + mobile money</span>
        </div>
        <div className="card stat">
          <span className="eyebrow">Net difference</span>
          <span className="stat-value" style={{ color: totals.variance > 0 ? 'var(--hibiscus)' : undefined }}>
            {totals.variance === 0 ? 'Balanced' : <Money amount={totals.variance} currency={sellCurrency} />}
          </span>
          <span className="stat-sub">positive = money short</span>
        </div>
      </div>
      <section className="card">
        {days.length === 0 ? (
          <Empty icon="people" title="No sales days match these filters">
            {hidden > 0 ? `${hidden} day${hidden === 1 ? ' is' : 's are'} at other places — choose “All places”.` : 'Try a longer period or “Everyone”.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Worker</th>
                  <th>Out at</th>
                  <th className="n">Took</th>
                  <th className="n">Sold</th>
                  <th className="n">Sales value</th>
                  <th className="n">Handed</th>
                  <th>Money</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  const lines = dayLines(d);
                  return (
                    <tr key={d.key} className="clickable" onClick={() => navigate(`/days/${d.workerId}/${d.workDate}`)}>
                      <td className="nowrap">{fmtDateShort(d.workDate)}</td>
                      <td className="nowrap">
                        <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                          <Monogram small name={lk.personName(d.workerId)} id={d.workerId} />
                          {lk.personName(d.workerId)}
                        </span>
                      </td>
                      <td className="mono muted">{fmtTime(d.firstActivityAt)}</td>
                      <td className="n">{lines.reduce((s, l) => s + l.issued, 0)}</td>
                      <td className="n">{lines.reduce((s, l) => s + l.sold, 0)}</td>
                      <td className="n">{d.settlement ? <Money amount={d.settlement.expected} currency={d.settlement.currency} /> : '—'}</td>
                      <td className="n">{d.settlement ? <Money amount={d.settlement.handed} currency={d.settlement.currency} /> : '—'}</td>
                      <td>
                        <VarianceCell d={d} />
                      </td>
                      <td>{d.review ? <span className={`pill ${d.review.decision === 'approved' ? 'green' : 'saffron'}`}>{d.review.decision === 'approved' ? 'Approved' : 'Queried'}</span> : d.settlement ? <span className="muted">To review</span> : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {days.length > 0 && (
        <div className="row">
          <DownloadButton small label="Sales by garment" build={() => salesLinesReport(reportCtx(), filter)} />
          <DownloadButton small label="Take & return records" build={() => workerRecordsReport(reportCtx(), filter)} />
        </div>
      )}
      {startFor && <StartForSheet onClose={() => setStartFor(false)} />}
    </div>
  );
}

function StartForSheet({ onClose }: { onClose: () => void }) {
  const lk = useLookups();
  const workers = lk.people.filter((p) => p.active);
  const [who, setWho] = useState(workers.find((w) => w.role === 'worker')?.id ?? workers[0]?.id ?? '');
  const [date, setDate] = useState(businessDate());
  return (
    <Sheet title="Record for a worker" onClose={onClose}>
      <p className="soft">Use this when a worker has no phone with them. Records are saved under your name, for their day.</p>
      <Field label="Worker">
        <select className="select" value={who} onChange={(e) => setWho(e.target.value)}>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Day">
        <input type="date" className="input" value={date} max={businessDate()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <button className="btn btn-primary" onClick={() => navigate(`/days/${who}/${date}`)}>
        Open the day
      </button>
    </Sheet>
  );
}

export function DayDetail({ workerId, date }: { workerId: string; date: string }) {
  const { ledger, version, records, user } = useApp();
  const lk = useLookups();
  const [review, setReview] = useState<'approved' | 'queried' | null>(null);
  const day = ledger.get(K.day(workerId, date)) as WorkerDay | undefined;
  const ops = useMemo(
    () =>
      [...ledger.ops.values()]
        .filter((r) => {
          const p = r.op.payload as { workerId?: string; workDate?: string; targetId?: string };
          if (r.op.type === 'op.void') {
            const t = ledger.getOp(p.targetId ?? '');
            const tp = t?.op.payload as { workerId?: string; workDate?: string } | undefined;
            return tp?.workerId === workerId && tp?.workDate === date;
          }
          return p.workerId === workerId && p.workDate === date;
        })
        .sort((a, b) => a.op.deviceTime.localeCompare(b.op.deviceTime)),
    [ledger, version, workerId, date],
  );
  const canAudit = user!.caps.includes('audit.view');
  const q = `?worker=${workerId}&date=${date}${day ? `&loc=${day.locationId}` : ''}`;
  const s = day?.settlement;
  return (
    <div className="page">
      <PageHead
        eyebrow={<a href={href('/days')}>← Sales days</a>}
        title={
          <span className="row" style={{ gap: 12 }}>
            <Monogram name={lk.personName(workerId)} id={workerId} />
            {lk.personName(workerId)}
          </span>
        }
        lead={`${fmtDate(date)}${day ? ` · ${lk.locName(day.locationId)}` : ''}`}
        actions={
          <>
            {(!day || day.status === 'open') && (
              <>
                <a className="btn" href={href(`/take${q}`)}>
                  <Icon name="out" size={18} /> Take
                </a>
                <a className="btn" href={href(`/return${q}`)}>
                  <Icon name="in" size={18} /> Return
                </a>
                <a className="btn btn-primary" href={href(`/close${q}`)}>
                  <Icon name="wallet" size={18} /> Close day
                </a>
              </>
            )}
            {day?.status === 'settled' && (
              <>
                <button className="btn btn-primary" onClick={() => setReview('approved')}>
                  <Icon name="check" size={18} /> Approve
                </button>
                <button className="btn" onClick={() => setReview('queried')}>
                  <Icon name="flag" size={18} /> Ask a question
                </button>
                {s && <VoidButton opId={s.opId} label="Reopen day" small={false} />}
              </>
            )}
          </>
        }
      />
      {!day && <Empty icon="calendar" title="Nothing recorded for this day yet" />}
      {day && (
        <div className="grid cols-2">
          <section className="card">
            <div className="card-head">
              <span className="section-title">Garments</span>
              <VarianceCell d={day} />
            </div>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Garment</th>
                    <th className="n">Took</th>
                    <th className="n">Back</th>
                    <th className="n">Sold</th>
                    <th className="n">Kept</th>
                    <th className="n">Lost</th>
                  </tr>
                </thead>
                <tbody>
                  {dayLines(day).map((l) => {
                    const sl = s?.lines.find((x) => x.garmentTypeId === l.gt);
                    return (
                      <tr key={l.gt}>
                        <td>
                          <GarmentLabel g={lk.garment(l.gt)} showName={false} />
                          {sl && sl.wholesaleQty > 0 && <div className="hint">{sl.wholesaleQty} wholesale</div>}
                        </td>
                        <td className="n">{l.issued}</td>
                        <td className="n">{l.returned}</td>
                        <td className="n">{l.sold}</td>
                        <td className="n">{l.carried || ''}</td>
                        <td className="n" style={l.lost ? { color: 'var(--hibiscus)' } : undefined}>
                          {l.lost || ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card card-pad stack">
            <span className="section-title">Money</span>
            {!s ? (
              <span className="muted">The day is not closed yet.</span>
            ) : (
              <>
                <dl className="kv">
                  <dt>Sales at recorded prices</dt>
                  <dd>
                    <Money amount={s.expected} currency={s.currency} />
                  </dd>
                  {s.expenses.map((e, i) => (
                    <FragmentKV key={i} k={`Spent: ${e.description}`} v={<>− <Money amount={e.amount} currency={s.currency} /></>} />
                  ))}
                  <dt>Cash handed over</dt>
                  <dd>
                    <Money amount={s.cash} currency={s.currency} />
                  </dd>
                  {s.mobile > 0 && <FragmentKV k="Mobile money" v={<Money amount={s.mobile} currency={s.currency} />} />}
                  <dt className="total">{s.variance === 0 ? 'Difference' : s.variance > 0 ? 'Short by' : 'Over by'}</dt>
                  <dd className="total" style={{ color: s.variance > 0 ? 'var(--hibiscus)' : undefined }}>
                    {s.variance === 0 ? 'none' : <Money amount={Math.abs(s.variance)} currency={s.currency} />}
                  </dd>
                </dl>
                {s.note && <div className="note-box">Worker’s note: “{s.note}”</div>}
                {day.review && (
                  <div className={day.review.decision === 'approved' ? 'info-box' : 'note-box'}>
                    {day.review.decision === 'approved' ? 'Approved' : 'Queried'} by {lk.personName(day.review.by)}
                    {day.review.note && <>: “{day.review.note}”</>}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
      {ops.length > 0 && (
        <section className="card">
          <div className="card-head">
            <span className="section-title">What was recorded, and when</span>
            {canAudit && <span className="hint">Device time · time it reached the server</span>}
          </div>
          <div className="card-body timeline">
            {ops.map((r) => {
              const rec = records.get(r.op.id);
              const skew = rec?.clockSkewMs ?? 0;
              const delay = rec?.serverTime ? Date.parse(rec.serverTime) - (Date.parse(r.op.deviceTime) + skew) : null;
              return (
                <div key={r.op.id} className="tl-item">
                  <span className="tl-time">{fmtTime(r.op.deviceTime)}</span>
                  <span className="tl-rail">
                    <span className={`tl-knot ${r.voidedBy ? 'muted' : r.op.type === 'worker.settle' ? 'green' : r.op.type === 'worker.return' ? 'lagoon' : 'saffron'}`} />
                  </span>
                  <div className="stack-sm">
                    <span className="row-between">
                      <span style={r.voidedBy ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>{describeOp(r.op, lk, ledger)}</span>
                      {(r.op.type === 'worker.issue' || r.op.type === 'worker.return') && day?.status === 'open' && <VoidButton opId={r.op.id} label="Cancel" />}
                    </span>
                    {canAudit && (
                      <span className="row" style={{ gap: 6 }}>
                        <span className="hint">by {rec?.actorName ?? lk.personName(r.op.actorId)}</span>
                        {rec?.status === 'pending' && <span className="pill saffron">Not synced yet</span>}
                        {delay !== null && delay > 10 * 60_000 && <span className="pill lagoon">Offline · reached server {fmtDuration(delay)} later ({fmtTime(rec!.serverTime)})</span>}
                        {(rec?.flags ?? []).filter((f) => f.code !== 'CASH_VARIANCE').map((f, i) => (
                          <span key={i} className="pill saffron" title={f.message}>
                            {FLAG_LABEL[f.code]}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {review && <ReviewSheet workerId={workerId} date={date} decision={review} onClose={() => setReview(null)} />}
    </div>
  );
}

function FragmentKV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

function ReviewSheet({ workerId, date, decision, onClose }: { workerId: string; date: string; decision: 'approved' | 'queried'; onClose: () => void }) {
  const [note, setNote] = useState('');
  return (
    <Sheet
      title={decision === 'approved' ? 'Approve this day' : 'Ask the worker a question'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={decision === 'queried' && !note.trim()}
            onClick={async () => {
              if (await save(() => store.submit('worker.review', { workerId, workDate: date, decision, note: note.trim() }), decision === 'approved' ? 'Day approved' : 'Question saved')) onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <Field label={decision === 'approved' ? 'Note (optional)' : 'Question — the worker sees it in their history'}>
        <textarea className="textarea" autoFocus value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Sheet>
  );
}
