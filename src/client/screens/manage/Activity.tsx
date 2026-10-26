import { useEffect, useMemo, useState } from 'react';
import { store, useApp } from '../../lib/store';
import { describeOp, useLookups } from '../../lib/lookups';
import { useRoute } from '../../lib/router';
import { api, ApiError } from '../../lib/api';
import type { AuthEventRow } from '../../../shared/api';
import { addDays, businessDate, fmtDate, fmtDuration, fmtTime, fmtDateTime } from '../../../shared/time';
import { OP_GROUP } from '../../lib/labels';
import { errText, useT } from '../../lib/i18n';
import type { Key } from '../../../shared/i18n';
import { Empty, Monogram, PageHead, Seg } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { LatePill } from '../../ui/Late';
import { DownloadButton } from '../../ui/Reporting';
import { activityReport, selectActivity, type ActivityFilter } from '../../../shared/reports';
import { reportCtx } from '../../lib/report-ctx';

export function ActivityPage() {
  const { query } = useRoute();
  const [tab, setTab] = useState<'records' | 'signins'>('records');
  const t = useT();
  return (
    <div className="page">
      <PageHead
        title={t('nav.activity')}
        lead={t('act.lead')}
        actions={<Seg value={tab} onChange={setTab} options={[{ value: 'records', label: t('act.records') }, { value: 'signins', label: t('act.signins') }]} />}
      />
      {tab === 'records' ? <Records flaggedOnly={query.get('flagged') === '1'} /> : <SignIns />}
    </div>
  );
}

function Records({ flaggedOnly }: { flaggedOnly: boolean }) {
  const { ledger, version, records } = useApp();
  const lk = useLookups();
  const t = useT();
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
        <Seg value={days} onChange={setDays} options={[{ value: '7', label: t('range.nDays', { n: 7 }) }, { value: '30', label: t('range.nDays', { n: 30 }) }, { value: 'all', label: t('range.allShort') }]} />
        <select className="select" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)} aria-label={t('act.person')}>
          <option value="all">{t('days.everyone')}</option>
          {lk.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.active ? p.name : `${p.name} (${t('pp.archived')})`}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} value={group} onChange={(e) => setGroup(e.target.value)} aria-label={t('ex.kind')}>
          <option value="all">{t('act.allKinds')}</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {t(`grp.${g}` as Key)}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} /> {t('act.onlyWarnings')}
        </label>
        <DownloadButton build={() => activityReport(reportCtx(), filter)} />
      </div>
      {all.length > list.length && <p className="hint">{t('act.showing', { n: list.length, total: all.length })}</p>}
      {list.length === 0 && <Empty icon="clock" title={t('act.nothing')} />}
      {[...byDay].map(([day, items]) => (
        <section key={day} className="card">
          <div className="card-head">
            <span className="section-title">{fmtDate(day)}</span>
            <span className="muted">
              {t('act.nRecords', { n: items.length })}
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
                  <span className="tl-time" title={t('act.deviceTime')}>
                    {fmtTime(o.op.deviceTime)}
                  </span>
                  <span className="tl-rail">
                    <span className={`tl-knot ${o.status === 'rejected' ? (o.review === 'waiting' ? 'saffron' : 'red') : o.voidedBy ? 'muted' : flags.some((f) => f.code !== 'CASH_VARIANCE') ? 'saffron' : ''}`} />
                  </span>
                  <div className="stack-sm">
                    <span className="row" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                      <Monogram small name={rec?.actorName ?? lk.personName(o.op.actorId)} id={o.op.actorId} />
                      <span style={o.voidedBy ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>
                        {(() => {
                          const actor = rec?.actorName ?? lk.personName(o.op.actorId);
                          const text = describeOp(o.op, lk, ledger, t);
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
                      <span className="pill">{t(`grp.${OP_GROUP[o.op.type]}` as Key)}</span>
                      {rec?.status === 'pending' && <span className="pill saffron">{t('act.notOnServer')}</span>}
                      {o.review ? <LatePill rec={o} /> : o.status === 'rejected' && <span className="pill red wrap">{t('act.refused', { error: errText(rec?.error) })}</span>}
                      {o.voidedBy && <span className="pill">{t('c.cancelled')}</span>}
                      {!o.op.createdOnline && <span className="pill lagoon">{t('act.offline')}</span>}
                      {delay !== null && delay > 10 * 60_000 && (
                        <span className="pill lagoon" title={t('act.serverAt', { time: fmtDateTime(rec!.serverTime) })}>
                          {t('act.reachedLater', { delay: fmtDuration(delay) })}
                        </span>
                      )}
                      {flags.map((f, i) => (
                        <span key={i} className={`pill wrap ${f.code === 'CASH_VARIANCE' ? '' : 'saffron'}`} title={f.message}>
                          <Icon name="flag" size={13} /> {t(`lbl.flag.${f.code}` as Key)}: {f.message}
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
      <p className="hint">{t('act.timesNote')}</p>
    </>
  );
}

const EVENTS = new Set(['login_ok', 'login_wrong_code', 'login_unknown_name', 'account_locked', 'login_disabled', 'login_device_blocked', 'login_device_denied', 'device_requested', 'device_approved', 'device_denied', 'device_revoked', 'device_blocked', 'device_unblocked', 'device_mismatch', 'logout', 'setup_owner', 'setup_recover_owner', 'setup_wrong_key', 'person_created', 'person_updated', 'pin_reset', 'person_unlocked', 'report_exported', 'backup_exported', 'device_retired', 'device_reactivated', 'person_archived', 'person_reactivated', 'cutover_backup', 'cutover_completed', 'login_temporary', 'temporary_ended', 'temporary_replaced', 'temporary_refused']);
const BAD = new Set(['login_wrong_code', 'login_unknown_name', 'account_locked', 'device_mismatch', 'setup_wrong_key', 'login_device_blocked', 'login_device_denied', 'temporary_refused']);

function SignIns() {
  const { demo, online } = useApp();
  const lk = useLookups();
  const t = useT();
  const [events, setEvents] = useState<AuthEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (demo) return;
    api<{ events: AuthEventRow[] }>('GET', '/admin/events?limit=200', undefined, store.token)
      .then((r) => setEvents(r.events))
      .catch((e) => setError(e instanceof ApiError ? errText(e.message) : t('act.couldNotLoad')));
  }, [demo, online]);
  if (demo) return <Empty icon="key" title={t('act.signinServer')}>{t('act.signinDemo')}</Empty>;
  if (error) return <div className="error-box">{error}</div>;
  if (!events) return <div className="muted">{t('act.loading')}</div>;
  return (
    <section className="card">
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>{t('act.when')}</th>
              <th>{t('act.what')}</th>
              <th>{t('act.person')}</th>
              <th>{t('ex.by')}</th>
              <th>{t('act.network')}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="nowrap mono">{fmtDateTime(e.at)}</td>
                <td>
                  <span className={`pill ${BAD.has(e.kind) ? 'red' : ''}`}>{EVENTS.has(e.kind) ? t(`ev.${e.kind}` as Key) : e.kind}</span>
                  {typeof e.detail.name === 'string' && <span className="muted"> “{e.detail.name}”</span>}
                  {e.kind === 'report_exported' && (
                    <span className="muted">
                      {' '}
                      {String(e.detail.title ?? e.detail.report)} · {String(e.detail.format ?? '').toUpperCase()} · {t('act.rows', { n: String(e.detail.rows ?? 0) })}{e.detail.filters ? ` · ${String(e.detail.filters)}` : ''}
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
