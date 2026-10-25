import { useCallback, useEffect, useState } from 'react';
import { store, useApp } from '../../lib/store';
import { useLookups } from '../../lib/lookups';
import { api, ApiError } from '../../lib/api';
import { TEMP_SIGNIN, type CreatePersonRequest, type DeviceRow, type PeopleResponse, type PersonRow, type TemporarySignInRow } from '../../../shared/api';
import { CAPABILITIES, MIN_PIN_LENGTH, OWNER_ONLY, ROLE_CAPABILITIES, ROLES, pinPolicyError, type Capability, type Role } from '../../../shared/permissions';
import { fmtDateTime } from '../../../shared/time';
import { errText, tNow, useT, type T } from '../../lib/i18n';
import { Icon } from '../../ui/Icon';
import { Empty, Field, Monogram, PageHead, Sheet, toast } from '../../ui/kit';
import { DownloadButton } from '../../ui/Reporting';
import { peopleReport } from '../../../shared/reports';
import { reportCtx } from '../../lib/report-ctx';

async function call<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  try {
    return await api<T>(method, path, body, store.token);
  } catch (e) {
    toast(e instanceof ApiError ? errText(e.message) : tNow()('pp.requestFailed'), 'error');
    return null;
  }
}

function uaSummary(ua: string, t: T) {
  if (/Android/.test(ua)) return t('pp.android');
  if (/iPhone|iPad/.test(ua)) return t('pp.iphone');
  if (/Windows/.test(ua)) return t('pp.windows');
  if (/Mac OS/.test(ua)) return t('pp.mac');
  return t('pp.device');
}

export function PeoplePage() {
  const { demo, online, device } = useApp();
  const t = useT();
  const [data, setData] = useState<PeopleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<PersonRow | 'new' | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<PeopleResponse>('GET', '/admin/people', undefined, store.token));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? (e.offline ? tNow()('pp.onlineOnly') : errText(e.message)) : tNow()('pp.couldNotLoad'));
    }
  }, []);
  useEffect(() => {
    if (!demo) void load();
  }, [demo, online, load]);

  if (demo)
    return (
      <div className="page">
        <PageHead title={t('nav.people')} />
        <Empty icon="key" title={t('pp.managedServer')}>
          {t('pp.demoBody')}
        </Empty>
      </div>
    );

  const pending = data?.devices.flatMap((d) => d.access.filter((a) => a.status === 'pending').map((a) => ({ d, a }))) ?? [];
  const nameOf = (id: string) => data?.people.find((p) => p.id === id)?.name ?? t('pp.unknown');
  return (
    <div className="page">
      <PageHead
        title={t('nav.people')}
        lead={t('pp.lead')}
        actions={
          <>
            {data && <DownloadButton build={() => peopleReport(reportCtx(), data)} />}
            <button className="btn btn-primary" onClick={() => setEdit('new')} disabled={!data}>
              <Icon name="plus" size={18} /> {t('pp.add')}
            </button>
          </>
        }
      />
      {error && <div className="error-box">{error}</div>}
      {pending.length > 0 && (
        <section className="card selvedge" style={{ paddingLeft: 6 }}>
          <div className="card-head">
            <span className="section-title">{t('pp.waiting')}</span>
          </div>
          <div className="list" style={{ marginTop: 8 }}>
            {pending.map(({ d, a }) => (
              <div key={d.id + a.userId} className="list-item">
                <span className="device-code" style={{ fontSize: 18, padding: '6px 10px' }}>
                  {d.code}
                </span>
                <span style={{ flex: 1 }}>
                  <strong>{nameOf(a.userId)}</strong> {t('pp.onDevice', { device: d.label || uaSummary(d.userAgent, t) })}
                  <div className="hint">{t('pp.asked', { time: fmtDateTime(a.requestedAt) })}</div>
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    if (await call('POST', '/admin/access', { deviceId: d.id, userId: a.userId, decision: 'approve' })) {
                      toast(t('pp.approved'));
                      void load();
                    }
                  }}
                >
                  {t('pp.approve')}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={async () => {
                    if (await call('POST', '/admin/access', { deviceId: d.id, userId: a.userId, decision: 'deny' })) void load();
                  }}
                >
                  {t('pp.refuse')}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {data?.temporary && data.temporary.length > 0 && <TemporarySignIns rows={data.temporary} devices={data.devices} nameOf={nameOf} onChange={load} />}
      {data && (
        <section className="card">
          <div className="list">
            {data.people.filter((p) => p.active).map((p) => (
              <button key={p.id} className="list-item" onClick={() => setEdit(p)}>
                <Monogram name={p.name} id={p.id} />
                <span style={{ flex: 1 }}>
                  <strong>{p.name}</strong>
                  <div className="hint">
                    {t(`role.${p.role}`)} · {t('pp.nDevices', { n: data.devices.filter((d) => d.access.some((a) => a.userId === p.id && a.status === 'approved') && !d.revokedAt).length })}
                  </div>
                </span>
                {(p.hardLocked || (p.lockedUntil && Date.parse(p.lockedUntil) > Date.now())) && <span className="pill red">{t('pp.locked')}</span>}
                <Icon name="right" size={16} />
              </button>
            ))}
          </div>
          <ArchivedPeople people={data.people.filter((p) => !p.active)} onChange={load} />
        </section>
      )}
      {data && <Devices devices={data.devices} nameOf={nameOf} onChange={load} myDevice={device?.deviceId ?? ''} />}
      {edit && data && <PersonSheet person={edit === 'new' ? null : edit} devices={data.devices} onClose={() => setEdit(null)} onSaved={load} />}
    </div>
  );
}

/**
 * The owner's temporary sign-ins on computers that are not their devices
 * (ADR-006). A live one can be signed out from here — for a computer left
 * signed in, or one the owner does not recognise.
 */
function TemporarySignIns({ rows, devices, nameOf, onChange }: { rows: TemporarySignInRow[]; devices: DeviceRow[]; nameOf: (id: string) => string; onChange: () => void }) {
  const t = useT();
  const live = rows.filter((r) => r.live);
  const past = rows.filter((r) => !r.live);
  const where = (id: string) => {
    const d = devices.find((x) => x.id === id);
    return d ? `${d.label || uaSummary(d.userAgent, t)} · ${d.code}` : id.slice(0, 8);
  };
  // Not signed out: it ended at its fixed end or after the idle limit, whichever came first.
  const endOf = (r: TemporarySignInRow) => r.endedAt ?? new Date(Math.min(Date.parse(r.expiresAt), Date.parse(r.lastUsedAt) + TEMP_SIGNIN.serverIdleMinutes * 60_000)).toISOString();
  return (
    <section className={live.length ? 'card selvedge' : 'card'} style={live.length ? { paddingLeft: 6 } : undefined}>
      {live.length > 0 && (
        <>
          <div className="card-head">
            <span className="section-title">{t('pp.tempLive')}</span>
            <span className="hint">{t('pp.tempLiveHint')}</span>
          </div>
          <div className="list" style={{ marginTop: 8 }}>
            {live.map((r) => (
              <div key={`${r.deviceId}-${r.createdAt}`} className="list-item">
                <span style={{ flex: 1 }}>
                  <strong>{nameOf(r.userId)}</strong> <span className="mono muted">{where(r.deviceId)}</span>
                  <div className="hint">{t('pp.tempLine', { start: fmtDateTime(r.createdAt), last: fmtDateTime(r.lastUsedAt), end: fmtDateTime(r.expiresAt) })}</div>
                </span>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={async () => {
                    if (await call('POST', '/admin/temporary/end', { deviceId: r.deviceId, userId: r.userId })) {
                      toast(t('pp.tempEndedToast'));
                      onChange();
                    }
                  }}
                >
                  {t('pp.tempEnd')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {past.length > 0 && (
        <details className="retired-devices" style={{ margin: '12px 16px' }}>
          <summary className="section-title" style={{ cursor: 'pointer' }}>
            {t('pp.tempRecent')} ({past.length})
          </summary>
          <div className="list" style={{ marginTop: 8 }}>
            {past.map((r) => (
              <div key={`${r.deviceId}-${r.createdAt}`} className="list-item" style={{ opacity: 0.8 }}>
                <span style={{ flex: 1 }}>
                  <strong>{nameOf(r.userId)}</strong> <span className="mono muted">{where(r.deviceId)}</span>
                  <div className="hint">
                    {fmtDateTime(r.createdAt)} · {t('pp.tempEndedAt', { time: fmtDateTime(endOf(r)) })}
                  </div>
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

/** People no longer working with the business: kept for history, out of the everyday list. */
function ArchivedPeople({ people, onChange }: { people: PersonRow[]; onChange: () => void }) {
  const t = useT();
  const [confirm, setConfirm] = useState<PersonRow | null>(null);
  if (!people.length) return null;
  return (
    <details className="retired-devices" style={{ margin: '14px 16px 12px' }}>
      <summary className="section-title" style={{ cursor: 'pointer' }}>
        {t('pp.archivedPeople')} ({people.length})
      </summary>
      <p className="hint" style={{ margin: '6px 0 2px' }}>{t('pp.archivedHint')}</p>
      <div className="list" style={{ marginTop: 8 }}>
        {people.map((p) => (
          <div key={p.id} className="list-item" style={{ opacity: 0.8 }}>
            <Monogram name={p.name} id={p.id} />
            <span style={{ flex: 1 }}>
              <strong>{p.name}</strong>
              <div className="hint">
                {t(`role.${p.role}`)} · <span className="pill">{t('pp.archived')}</span>
              </div>
            </span>
            <button className="btn btn-sm" onClick={() => setConfirm(p)}>
              {t('pp.reactivate')}
            </button>
          </div>
        ))}
      </div>
      {confirm && (
        <Sheet
          title={t('pp.reactivatePersonTitle', { name: confirm.name })}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirm(null)}>
                {t('c.cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  if (await call('PATCH', `/admin/people/${confirm.id}`, { active: true })) {
                    toast(t('pp.reactivatedPersonToast', { name: confirm.name }));
                    setConfirm(null);
                    onChange();
                  }
                }}
              >
                {t('pp.reactivate')}
              </button>
            </>
          }
        >
          <p className="soft">{t('pp.reactivatePersonBody', { name: confirm.name })}</p>
        </Sheet>
      )}
    </details>
  );
}

function Devices({ devices, nameOf, onChange, myDevice }: { devices: DeviceRow[]; nameOf: (id: string) => string; onChange: () => void; myDevice: string }) {
  const t = useT();
  const [confirm, setConfirm] = useState<{ device: DeviceRow; action: 'retire' | 'reactivate' } | null>(null);
  // In use: someone is allowed on it, or has asked to be. The rest — computers
  // used only for a temporary sign-in, refused or removed requests — are kept
  // for the record, out of the everyday table, like retired devices.
  const inUse = (d: DeviceRow) => d.id === myDevice || d.access.some((a) => a.status === 'approved' || a.status === 'pending');
  const active = devices.filter((d) => !d.retiredAt && inUse(d));
  const unused = devices.filter((d) => !d.retiredAt && !inUse(d));
  const retired = devices.filter((d) => d.retiredAt);
  const allowedNames = (d: DeviceRow) =>
    d.access
      .filter((a) => a.status === 'approved')
      .map((a) => nameOf(a.userId))
      .join(', ') || '—';

  const runConfirm = async () => {
    if (!confirm) return;
    const { device, action } = confirm;
    if (await call('PATCH', `/admin/devices/${device.id}`, { retired: action === 'retire' })) {
      toast(action === 'retire' ? t('pp.retiredToast') : t('pp.reactivatedToast'));
      setConfirm(null);
      onChange();
    }
  };

  const table = (list: DeviceRow[]) => (
    <div className="table-wrap" style={{ marginTop: 8 }}>
      <table className="data">
        <thead>
          <tr>
            <th>{t('pp.device')}</th>
            <th>{t('pp.code')}</th>
            <th>{t('pp.allowed')}</th>
            <th>{t('pp.lastSeen')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((d) => (
            <tr key={d.id} style={d.revokedAt ? { opacity: 0.55 } : undefined}>
              <td>
                {d.label || uaSummary(d.userAgent, t)}
                {d.id === myDevice && <span className="pill indigo" style={{ marginLeft: 6 }}>{t('pp.thisDevice')}</span>}
                {d.revokedAt && <span className="pill red" style={{ marginLeft: 6 }}>{t('pp.blockedStatus')}</span>}
              </td>
              <td className="mono">{d.code}</td>
              <td>{allowedNames(d)}</td>
              <td className="nowrap">{d.lastSeenAt ? fmtDateTime(d.lastSeenAt) : '—'}</td>
              <td>
                {d.id !== myDevice && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={`btn btn-sm ${d.revokedAt ? '' : 'btn-danger'}`}
                      onClick={async () => {
                        if (await call('PATCH', `/admin/devices/${d.id}`, { blocked: !d.revokedAt })) {
                          toast(d.revokedAt ? t('pp.unblocked') : t('pp.blocked'));
                          onChange();
                        }
                      }}
                    >
                      {d.revokedAt ? t('pp.unblock') : t('pp.block')}
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setConfirm({ device: d, action: 'retire' })}>
                      {t('pp.retire')}
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="card">
      <div className="card-head">
        <span className="section-title">{t('pp.devices')}</span>
        <span className="hint">{t('pp.blockHint')}</span>
      </div>
      {table(active)}
      {unused.length > 0 && (
        <details className="retired-devices" style={{ marginTop: 14 }}>
          <summary className="section-title" style={{ cursor: 'pointer' }}>
            {t('pp.otherDevices')} ({unused.length})
          </summary>
          <p className="hint" style={{ margin: '6px 0 2px' }}>{t('pp.otherHint')}</p>
          {table(unused)}
        </details>
      )}
      {retired.length > 0 && (
        <details className="retired-devices" style={{ marginTop: 14 }}>
          <summary className="section-title" style={{ cursor: 'pointer' }}>
            {t('pp.retiredDevices')} ({retired.length})
          </summary>
          <p className="hint" style={{ margin: '6px 0 2px' }}>{t('pp.retiredHint')}</p>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>{t('pp.device')}</th>
                  <th>{t('pp.code')}</th>
                  <th>{t('pp.allowed')}</th>
                  <th>{t('pp.lastSeen')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {retired.map((d) => (
                  <tr key={d.id} style={{ opacity: 0.7 }}>
                    <td>
                      {d.label || uaSummary(d.userAgent, t)}
                      <span className="pill" style={{ marginLeft: 6 }}>{t('pp.retired')}</span>
                    </td>
                    <td className="mono">{d.code}</td>
                    <td>{allowedNames(d)}</td>
                    <td className="nowrap">{d.lastSeenAt ? fmtDateTime(d.lastSeenAt) : '—'}</td>
                    <td>
                      <button className="btn btn-sm" onClick={() => setConfirm({ device: d, action: 'reactivate' })}>
                        {t('pp.reactivate')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {confirm && (
        <Sheet
          title={confirm.action === 'retire' ? t('pp.retireTitle') : t('pp.reactivateTitle')}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirm(null)}>
                {t('c.cancel')}
              </button>
              <button className={`btn ${confirm.action === 'retire' ? 'btn-danger' : 'btn-primary'}`} onClick={() => void runConfirm()}>
                {confirm.action === 'retire' ? t('pp.retire') : t('pp.reactivate')}
              </button>
            </>
          }
        >
          <div className="note-box">
            {confirm.device.label || uaSummary(confirm.device.userAgent, t)} <span className="mono muted">{confirm.device.code}</span>
          </div>
          <p className="soft">{confirm.action === 'retire' ? t('pp.retireBody') : t('pp.reactivateBody')}</p>
        </Sheet>
      )}
    </section>
  );
}

function PersonSheet({ person, devices, onClose, onSaved }: { person: PersonRow | null; devices: DeviceRow[]; onClose: () => void; onSaved: () => void }) {
  const { device, user } = useApp();
  const lk = useLookups();
  const t = useT();
  const [name, setName] = useState(person?.name ?? '');
  const [role, setRole] = useState<Role>(person?.role ?? 'worker');
  const [locationId, setLocationId] = useState<string>(person?.locationId ?? lk.locations.find((l) => l.kind === 'selling')?.id ?? '');
  const [grants, setGrants] = useState<string[]>(person?.grants ?? []);
  const [revokes, setRevokes] = useState<string[]>(person?.revokes ?? []);
  const [pin, setPin] = useState('');
  const [allowHere, setAllowHere] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string[]>([]);
  const policy = pin ? pinPolicyError(role, pin) : null;
  const base = ROLE_CAPABILITIES[role];
  const effective = (c: Capability) => (base.includes(c) ? !revokes.includes(c) : grants.includes(c));
  const toggle = (c: Capability, on: boolean) => {
    if (base.includes(c)) setRevokes(on ? revokes.filter((x) => x !== c) : [...revokes, c]);
    else setGrants(on ? [...grants, c] : grants.filter((x) => x !== c));
  };
  const myDevices = person ? devices.filter((d) => !removing.includes(d.id) && d.access.some((a) => a.userId === person.id && a.status === 'approved')) : [];

  const submit = async () => {
    setBusy(true);
    if (!person) {
      const body: CreatePersonRequest = { name: name.trim(), role, pin, locationId: locationId || null, grants, revokes, allowOnDeviceId: allowHere ? (device?.deviceId ?? null) : null };
      if (await call('POST', '/admin/people', body)) {
        toast(t('pp.addedToast', { name }));
        onSaved();
        onClose();
      }
    } else {
      const ok = await call('PATCH', `/admin/people/${person.id}`, { name: name.trim(), role, locationId: locationId || null, grants, revokes });
      if (ok && pin) await call('POST', `/admin/people/${person.id}/pin`, { pin });
      if (ok) {
        toast(t('pp.saved'));
        onSaved();
        onClose();
      }
    }
    setBusy(false);
  };

  return (
    <Sheet
      title={person ? person.name : t('pp.add')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('c.cancel')}
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim() || (!person && !pin) || Boolean(policy)} onClick={() => void submit()}>
            {person ? t('pp.saveChanges') : t('pp.add')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('pp.name')} hint={t('pp.nameHint')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('pp.role')}>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={person?.id === user!.id}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pp.worksAt')}>
          <select className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">—</option>
            {lk.locations
              .filter((l) => l.active || l.id === locationId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={person ? t('pp.newCode') : t('pp.accessCode')} hint={policy ? errText(policy) : t('pp.codeHint', { n: MIN_PIN_LENGTH[role] })}>
          <input className="input mono" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
        </Field>
      </div>
      {!person && (
        <label className="check">
          <input type="checkbox" checked={allowHere} onChange={(e) => setAllowHere(e.target.checked)} /> {t('pp.allowHere')}
        </label>
      )}
      {person && (person.hardLocked || (person.lockedUntil && Date.parse(person.lockedUntil) > Date.now())) && (
        <div className="error-box row-between">
          <span>{t('pp.lockedAfter', { n: person.failedCount })}</span>
          <button
            className="btn btn-sm"
            onClick={async () => {
              if (await call('POST', `/admin/people/${person.id}/unlock`, {})) {
                toast(t('pp.unlocked'));
                onSaved();
                onClose();
              }
            }}
          >
            {t('pp.unlock')}
          </button>
        </div>
      )}
      <div className="stack-sm">
        <span className="field-label">{t('pp.canDo')}</span>
        {CAPABILITIES.filter((c) => !(OWNER_ONLY.includes(c) && role !== 'owner')).map((c) => (
          <label key={c} className="check" style={{ fontWeight: 480 }}>
            <input type="checkbox" checked={effective(c)} disabled={role === 'owner' && OWNER_ONLY.includes(c)} onChange={(e) => toggle(c, e.target.checked)} />
            <span>
              {t(`cap.${c}`)}
              {!base.includes(c) && effective(c) && <span className="pill saffron" style={{ marginLeft: 6 }}>{t('pp.extra')}</span>}
            </span>
          </label>
        ))}
        <span className="hint">{t('pp.serverChecks')}</span>
      </div>
      {person && myDevices.length > 0 && (
        <div className="stack-sm">
          <span className="field-label">{t('pp.allowedDevices')}</span>
          {myDevices.map((d) => (
            <div key={d.id} className="row-between">
              <span>
                {d.label || uaSummary(d.userAgent, t)} <span className="mono muted">{d.code}</span>
              </span>
              <button
                className="btn btn-sm btn-danger"
                disabled={removing.includes(d.id)}
                onClick={async () => {
                  // One tap, one change: the button waits for the answer.
                  setRemoving((r) => [...r, d.id]);
                  if (await call('POST', '/admin/access', { deviceId: d.id, userId: person.id, decision: 'revoke' })) {
                    toast(t('pp.removed'));
                    onSaved();
                  } else setRemoving((r) => r.filter((x) => x !== d.id));
                }}
              >
                {t('c.remove')}
              </button>
            </div>
          ))}
        </div>
      )}
      {person && person.active && person.id !== user!.id && (
        <div className="stack-sm" style={{ borderTop: '1px dashed var(--rule-strong)', paddingTop: 14 }}>
          {!archiving ? (
            <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start', color: 'var(--hibiscus)' }} onClick={() => setArchiving(true)}>
              {t('pp.archive')}
            </button>
          ) : (
            <div className="error-box stack-sm" role="alert">
              <strong>{t('pp.archiveTitle', { name: person.name })}</strong>
              <span>{t('pp.archiveBody', { name: person.name })}</span>
              <div className="row">
                <button
                  className="btn btn-sm btn-danger"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    if (await call('PATCH', `/admin/people/${person.id}`, { active: false })) {
                      toast(t('pp.archivedToast', { name: person.name }));
                      onSaved();
                      onClose();
                    }
                    setBusy(false);
                  }}
                >
                  {t('pp.archive')}
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setArchiving(false)}>
                  {t('c.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
