import { useEffect, useMemo, useState } from 'react';
import { store, useApp } from '../../lib/store';
import { describeOp, useLookups } from '../../lib/lookups';
import { useRoute } from '../../lib/router';
import { api, ApiError } from '../../lib/api';
import type { AuthEventRow } from '../../../shared/api';
import { addDays, businessDate, fmtDate, fmtDuration, fmtTime, fmtDateTime } from '../../../shared/time';
import { FLAG_LABEL, OP_GROUP } from '../../lib/labels';
import { Empty, Monogram, PageHead, Seg } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { DownloadButton } from '../../ui/Reporting';
import { activityReport, selectActivity, type ActivityFilter } from '../../../shared/reports';
import { reportCtx } from '../../lib/report-ctx';

export function ActivityPage() {
  const { query } = useRoute();
  const [tab, setTab] = useState<'records' | 'signins'>('records');
  return (
    <div className="page">
      <PageHead
        title="Activity log"
        lead="Every record, who made it, when it was entered on the device and when it reached the server. Nothing here can be edited or deleted."
        actions={<Seg value={tab} onChange={setTab} options={[{ value: 'records', label: 'Records' }, { value: 'signins', label: 'Sign-ins & devices' }]} />}
      />
      {tab === 'records' ? <Records flaggedOnly={query.get('flagged') === '1'} /> : <SignIns />}
    </div>
  );
}

function Records({ flaggedOnly }: { flaggedOnly: boolean }) {
  const { ledger, version, records } = useApp();
  const lk = useLookups();
  const [who, setWho] = useState('all');
  const [group, setGroup] = useState('all');
  const [flagged, setFlagged] = useState(flaggedOnly);
  const [days, setDays] = useState<'7' | '30' | 'all'>('7');
  const from = days === 'all' ? '0000' : addDays(businessDate(), -Number(days) + 1);
  const groups = [...new Set(Object.values(OP_GROUP))];
  const filter: ActivityFilter = { from: days === 'all' ? null : from, who: who === 'all' ? null : who, group: group === 'all' ? null : group, flagged };
  const all = useMemo(() => selectActivity({ ledger, meta: (id) => records.get(id) }, filter), [ledger, version, records, from, who, group, flagged]);
  const list = all.slice(0, 400);
  const byDay = new Map<string, typeof list>();
  for (const x of list) {
    const d = businessDate(x.o.op.deviceTime);
    byDay.set(d, [...(byDay.get(d) ?? []), x]);
  }
  return (
    <>
      <div className="row">
        <Seg value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: 'all', label: 'All' }]} />
        <select className="select" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Person">
          <option value="all">Everyone</option>
          {lk.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Kind">
          <option value="all">All kinds</option>
          {groups.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} /> Only warnings
        </label>
        <DownloadButton build={() => activityReport(reportCtx(), filter)} />
      </div>
      {all.length > list.length && <p className="hint">Showing the latest {list.length} of {all.length} records. The download contains all {all.length}.</p>}
      {list.length === 0 && <Empty icon="clock" title="Nothing matches" />}
      {[...byDay].map(([day, items]) => (
        <section key={day} className="card">
          <div className="card-head">
            <span className="section-title">{fmtDate(day)}</span>
            <span className="muted">
              {items.length} record{items.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="card-body timeline">
            {items.map(({ o, rec }) => {
              const skew = rec?.clockSkewMs ?? 0;
              const corrected = Date.parse(o.op.deviceTime) + skew;
              const delay = rec?.serverTime ? Date.parse(rec.serverTime) - corrected : null;
              const flags = rec?.flags ?? [];
              return (
                <div key={o.op.id} className="tl-item">
                  <span className="tl-time" title="Time on the device when saved">
                    {fmtTime(o.op.deviceTime)}
                  </span>
                  <span className="tl-rail">
                    <span className={`tl-knot ${o.status === 'rejected' ? 'red' : o.voidedBy ? 'muted' : flags.some((f) => f.code !== 'CASH_VARIANCE') ? 'saffron' : ''}`} />
                  </span>
                  <div className="stack-sm">
                    <span className="row" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                      <Monogram small name={rec?.actorName ?? lk.personName(o.op.actorId)} id={o.op.actorId} />
                      <span style={o.voidedBy ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>
                        {(() => {
                          const actor = rec?.actorName ?? lk.personName(o.op.actorId);
                          const text = describeOp(o.op, lk, ledger);
                          // "Amina took 40…" already names the actor; don't repeat it.
                          return text.startsWith(`${actor} `) ? (
                            <>
                              <strong>{actor}</strong>
                              {text.slice(actor.length)}
                            </>
                          ) : (
                            <>
                              <strong>{actor}</strong> · {text}
                            </>
                          );
                        })()}
                      </span>
                    </span>
                    <span className="row" style={{ gap: 6 }}>
                      <span className="pill">{OP_GROUP[o.op.type]}</span>
                      {rec?.status === 'pending' && <span className="pill saffron">Not on server yet</span>}
                      {o.status === 'rejected' && <span className="pill red">Refused: {rec?.error}</span>}
                      {o.voidedBy && <span className="pill">Cancelled</span>}
                      {!o.op.createdOnline && <span className="pill lagoon">Entered offline</span>}
                      {delay !== null && delay > 10 * 60_000 && (
                        <span className="pill lagoon" title={`Server received at ${fmtDateTime(rec!.serverTime)}`}>
                          Reached server {fmtDuration(delay)} later
                        </span>
                      )}
                      {flags.map((f, i) => (
                        <span key={i} className={`pill ${f.code === 'CASH_VARIANCE' ? '' : 'saffron'}`} title={f.message}>
                          <Icon name="flag" size={13} /> {FLAG_LABEL[f.code]}: {f.message}
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <p className="hint">
        Times are business time (Nairobi / Comoros, UTC+3). A device clock can be changed, so a device time is evidence, not proof; the server time is set by the server.
      </p>
    </>
  );
}

const EVENT_LABEL: Record<string, string> = {
  login_ok: 'Signed in',
  login_wrong_code: 'Wrong code',
  login_unknown_name: 'Unknown name tried',
  account_locked: 'Account locked',
  login_disabled: 'Switched-off account tried',
  login_device_blocked: 'Blocked device tried',
  login_device_denied: 'Refused device tried',
  device_requested: 'New device asked for approval',
  device_approved: 'Device approved',
  device_denied: 'Device refused',
  device_revoked: 'Device access removed',
  device_blocked: 'Device blocked',
  device_unblocked: 'Device unblocked',
  device_mismatch: 'Device identity mismatch',
  logout: 'Signed out',
  setup_owner: 'Owner account created',
  setup_recover_owner: 'Owner recovered with setup key',
  setup_wrong_key: 'Wrong setup key',
  person_created: 'Person added',
  person_updated: 'Person changed',
  pin_reset: 'Code reset',
  person_unlocked: 'Account unlocked',
  report_exported: 'Report downloaded',
  backup_exported: 'Backup downloaded',
};
const BAD = new Set(['login_wrong_code', 'login_unknown_name', 'account_locked', 'device_mismatch', 'setup_wrong_key', 'login_device_blocked', 'login_device_denied']);

function SignIns() {
  const { demo, online } = useApp();
  const lk = useLookups();
  const [events, setEvents] = useState<AuthEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (demo) return;
    api<{ events: AuthEventRow[] }>('GET', '/admin/events?limit=200', undefined, store.token)
      .then((r) => setEvents(r.events))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load'));
  }, [demo, online]);
  if (demo) return <Empty icon="key" title="Sign-in history lives on the server">In the real system this shows every sign-in, wrong code, lockout and device approval.</Empty>;
  if (error) return <div className="error-box">{error}</div>;
  if (!events) return <div className="muted">Loading…</div>;
  return (
    <section className="card">
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>What</th>
              <th>Person</th>
              <th>By</th>
              <th>Network</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="nowrap mono">{fmtDateTime(e.at)}</td>
                <td>
                  <span className={`pill ${BAD.has(e.kind) ? 'red' : ''}`}>{EVENT_LABEL[e.kind] ?? e.kind}</span>
                  {typeof e.detail.name === 'string' && <span className="muted"> “{e.detail.name}”</span>}
                  {e.kind === 'report_exported' && (
                    <span className="muted">
                      {' '}
                      {String(e.detail.title ?? e.detail.report)} · {String(e.detail.format ?? '').toUpperCase()} · {String(e.detail.rows ?? 0)} rows{e.detail.filters ? ` · ${String(e.detail.filters)}` : ''}
                    </span>
                  )}
                </td>
                <td>{lk.personName(e.userId)}</td>
                <td className="muted">{e.actorId ? lk.personName(e.actorId) : ''}</td>
                <td className="mono muted">{e.ip ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
