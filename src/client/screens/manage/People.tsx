import { useCallback, useEffect, useState } from 'react';
import { store, useApp } from '../../lib/store';
import { useLookups } from '../../lib/lookups';
import { api, ApiError } from '../../lib/api';
import type { CreatePersonRequest, DeviceRow, PeopleResponse, PersonRow } from '../../../shared/api';
import { CAPABILITIES, CAPABILITY_LABELS, MIN_PIN_LENGTH, OWNER_ONLY, ROLE_CAPABILITIES, ROLES, pinPolicyError, type Capability, type Role } from '../../../shared/permissions';
import { fmtDateTime } from '../../../shared/time';
import { ROLE_LABEL } from '../../lib/labels';
import { Icon } from '../../ui/Icon';
import { Empty, Field, Monogram, PageHead, Sheet, toast } from '../../ui/kit';
import { DownloadButton } from '../../ui/Reporting';
import { peopleReport } from '../../../shared/reports';
import { reportCtx } from '../../lib/report-ctx';

async function call<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  try {
    return await api<T>(method, path, body, store.token);
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Request failed', 'error');
    return null;
  }
}

function uaSummary(ua: string) {
  if (/Android/.test(ua)) return 'Android phone';
  if (/iPhone|iPad/.test(ua)) return 'iPhone / iPad';
  if (/Windows/.test(ua)) return 'Windows computer';
  if (/Mac OS/.test(ua)) return 'Mac';
  return 'Device';
}

export function PeoplePage() {
  const { demo, online, device } = useApp();
  const [data, setData] = useState<PeopleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<PersonRow | 'new' | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<PeopleResponse>('GET', '/admin/people', undefined, store.token));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? (e.offline ? 'People and devices are managed online. Connect to the internet.' : e.message) : 'Could not load.');
    }
  }, []);
  useEffect(() => {
    if (!demo) void load();
  }, [demo, online, load]);

  if (demo)
    return (
      <div className="page">
        <PageHead title="People & devices" />
        <Empty icon="key" title="Managed on the server">
          In the real system the owner adds people here, sets their codes and roles, and approves each new phone or laptop with a short matching code.
        </Empty>
      </div>
    );

  const pending = data?.devices.flatMap((d) => d.access.filter((a) => a.status === 'pending').map((a) => ({ d, a }))) ?? [];
  const nameOf = (id: string) => data?.people.find((p) => p.id === id)?.name ?? 'Unknown';
  return (
    <div className="page">
      <PageHead
        title="People & devices"
        lead="Who can sign in, with which role, and on which phones and computers."
        actions={
          <>
            {data && <DownloadButton build={() => peopleReport(reportCtx(), data)} />}
            <button className="btn btn-primary" onClick={() => setEdit('new')} disabled={!data}>
              <Icon name="plus" size={18} /> Add person
            </button>
          </>
        }
      />
      {error && <div className="error-box">{error}</div>}
      {pending.length > 0 && (
        <section className="card selvedge" style={{ paddingLeft: 6 }}>
          <div className="card-head">
            <span className="section-title">Waiting for your approval</span>
          </div>
          <div className="list" style={{ marginTop: 8 }}>
            {pending.map(({ d, a }) => (
              <div key={d.id + a.userId} className="list-item">
                <span className="device-code" style={{ fontSize: 18, padding: '6px 10px' }}>
                  {d.code}
                </span>
                <span style={{ flex: 1 }}>
                  <strong>{nameOf(a.userId)}</strong> on {d.label || uaSummary(d.userAgent)}
                  <div className="hint">Asked {fmtDateTime(a.requestedAt)} · check the code matches the one on their screen</div>
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    if (await call('POST', '/admin/access', { deviceId: d.id, userId: a.userId, decision: 'approve' })) {
                      toast('Device approved');
                      void load();
                    }
                  }}
                >
                  Approve
                </button>
                <button
                  className="btn btn-sm"
                  onClick={async () => {
                    if (await call('POST', '/admin/access', { deviceId: d.id, userId: a.userId, decision: 'deny' })) void load();
                  }}
                >
                  Refuse
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {data && (
        <section className="card">
          <div className="list">
            {data.people.map((p) => (
              <button key={p.id} className="list-item" onClick={() => setEdit(p)}>
                <Monogram name={p.name} id={p.id} />
                <span style={{ flex: 1 }}>
                  <strong>{p.name}</strong>
                  <div className="hint">
                    {ROLE_LABEL[p.role]} · {data.devices.filter((d) => d.access.some((a) => a.userId === p.id && a.status === 'approved') && !d.revokedAt).length} device(s)
                  </div>
                </span>
                {!p.active && <span className="pill">switched off</span>}
                {(p.hardLocked || (p.lockedUntil && Date.parse(p.lockedUntil) > Date.now())) && <span className="pill red">locked</span>}
                <Icon name="right" size={16} />
              </button>
            ))}
          </div>
        </section>
      )}
      {data && <Devices devices={data.devices} nameOf={nameOf} onChange={load} myDevice={device?.deviceId ?? ''} />}
      {edit && data && <PersonSheet person={edit === 'new' ? null : edit} devices={data.devices} onClose={() => setEdit(null)} onSaved={load} />}
    </div>
  );
}

function Devices({ devices, nameOf, onChange, myDevice }: { devices: DeviceRow[]; nameOf: (id: string) => string; onChange: () => void; myDevice: string }) {
  return (
    <section className="card">
      <div className="card-head">
        <span className="section-title">Devices</span>
        <span className="hint">Block a lost or stolen phone at once</span>
      </div>
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Device</th>
              <th>Code</th>
              <th>People allowed</th>
              <th>Last seen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} style={d.revokedAt ? { opacity: 0.55 } : undefined}>
                <td>
                  {d.label || uaSummary(d.userAgent)}
                  {d.id === myDevice && <span className="pill indigo" style={{ marginLeft: 6 }}>this device</span>}
                </td>
                <td className="mono">{d.code}</td>
                <td>
                  {d.access
                    .filter((a) => a.status === 'approved')
                    .map((a) => nameOf(a.userId))
                    .join(', ') || '—'}
                </td>
                <td className="nowrap">{d.lastSeenAt ? fmtDateTime(d.lastSeenAt) : '—'}</td>
                <td>
                  {d.id !== myDevice && (
                    <button
                      className={`btn btn-sm ${d.revokedAt ? '' : 'btn-danger'}`}
                      onClick={async () => {
                        if (await call('PATCH', `/admin/devices/${d.id}`, { blocked: !d.revokedAt })) {
                          toast(d.revokedAt ? 'Device unblocked' : 'Device blocked — its sessions ended');
                          onChange();
                        }
                      }}
                    >
                      {d.revokedAt ? 'Unblock' : 'Block'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PersonSheet({ person, devices, onClose, onSaved }: { person: PersonRow | null; devices: DeviceRow[]; onClose: () => void; onSaved: () => void }) {
  const { device, user } = useApp();
  const lk = useLookups();
  const [name, setName] = useState(person?.name ?? '');
  const [role, setRole] = useState<Role>(person?.role ?? 'worker');
  const [locationId, setLocationId] = useState<string>(person?.locationId ?? lk.locations.find((l) => l.kind === 'selling')?.id ?? '');
  const [grants, setGrants] = useState<string[]>(person?.grants ?? []);
  const [revokes, setRevokes] = useState<string[]>(person?.revokes ?? []);
  const [pin, setPin] = useState('');
  const [allowHere, setAllowHere] = useState(false);
  const [active, setActive] = useState(person?.active ?? true);
  const [busy, setBusy] = useState(false);
  const policy = pin ? pinPolicyError(role, pin) : null;
  const base = ROLE_CAPABILITIES[role];
  const effective = (c: Capability) => (base.includes(c) ? !revokes.includes(c) : grants.includes(c));
  const toggle = (c: Capability, on: boolean) => {
    if (base.includes(c)) setRevokes(on ? revokes.filter((x) => x !== c) : [...revokes, c]);
    else setGrants(on ? [...grants, c] : grants.filter((x) => x !== c));
  };
  const myDevices = person ? devices.filter((d) => d.access.some((a) => a.userId === person.id && a.status === 'approved')) : [];

  const submit = async () => {
    setBusy(true);
    if (!person) {
      const body: CreatePersonRequest = { name: name.trim(), role, pin, locationId: locationId || null, grants, revokes, allowOnDeviceId: allowHere ? (device?.deviceId ?? null) : null };
      if (await call('POST', '/admin/people', body)) {
        toast(`${name} added. Give them their code in person.`);
        onSaved();
        onClose();
      }
    } else {
      const ok = await call('PATCH', `/admin/people/${person.id}`, { name: name.trim(), role, active, locationId: locationId || null, grants, revokes });
      if (ok && pin) await call('POST', `/admin/people/${person.id}/pin`, { pin });
      if (ok) {
        toast('Saved');
        onSaved();
        onClose();
      }
    }
    setBusy(false);
  };

  return (
    <Sheet
      title={person ? person.name : 'Add person'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim() || (!person && !pin) || Boolean(policy)} onClick={() => void submit()}>
            {person ? 'Save changes' : 'Add person'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Name" hint="This is what they type to sign in. Must be unique.">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Role">
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={person?.id === user!.id}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Works at">
          <select className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">—</option>
            {lk.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={person ? 'New code (leave empty to keep)' : 'Access code'} hint={policy ?? `${MIN_PIN_LENGTH[role]}–8 digits. Tell them in person; never send it by message.`}>
          <input className="input mono" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
        </Field>
      </div>
      {!person && (
        <label className="check">
          <input type="checkbox" checked={allowHere} onChange={(e) => setAllowHere(e.target.checked)} /> Also allow them on this device (shared family laptop)
        </label>
      )}
      {person && person.id !== user!.id && (
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Account switched on
        </label>
      )}
      {person && (person.hardLocked || (person.lockedUntil && Date.parse(person.lockedUntil) > Date.now())) && (
        <div className="error-box row-between">
          <span>Locked after {person.failedCount} wrong codes.</span>
          <button
            className="btn btn-sm"
            onClick={async () => {
              if (await call('POST', `/admin/people/${person.id}/unlock`, {})) {
                toast('Unlocked');
                onSaved();
                onClose();
              }
            }}
          >
            Unlock
          </button>
        </div>
      )}
      <div className="stack-sm">
        <span className="field-label">What they can do</span>
        {CAPABILITIES.filter((c) => !(OWNER_ONLY.includes(c) && role !== 'owner')).map((c) => (
          <label key={c} className="check" style={{ fontWeight: 480 }}>
            <input type="checkbox" checked={effective(c)} disabled={role === 'owner' && OWNER_ONLY.includes(c)} onChange={(e) => toggle(c, e.target.checked)} />
            <span>
              {CAPABILITY_LABELS[c]}
              {!base.includes(c) && effective(c) && <span className="pill saffron" style={{ marginLeft: 6 }}>extra</span>}
            </span>
          </label>
        ))}
        <span className="hint">The server checks these on every request — hiding a screen is never the only protection.</span>
      </div>
      {person && myDevices.length > 0 && (
        <div className="stack-sm">
          <span className="field-label">Allowed devices</span>
          {myDevices.map((d) => (
            <div key={d.id} className="row-between">
              <span>
                {d.label || uaSummary(d.userAgent)} <span className="mono muted">{d.code}</span>
              </span>
              <button
                className="btn btn-sm btn-danger"
                onClick={async () => {
                  if (await call('POST', '/admin/access', { deviceId: d.id, userId: person.id, decision: 'revoke' })) {
                    toast('Removed');
                    onSaved();
                  }
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
