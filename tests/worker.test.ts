import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { createD1 } from './d1-shim';
import { randomToken, uuidv7 } from '../src/shared/ids';
import { ENGINE_VERSION, parseOp, type AnyOp, type OpType, type PayloadOf } from '../src/shared/ops';
import { Ledger } from '../src/shared/ledger';
import { balanceKey } from '../src/shared/model';
import type { LoginResponse, PullResponse, PushResponse, PeopleResponse, PersonRow } from '../src/shared/api';

const PEPPER = 'test-pepper-0123456789-abcdefghijklmnop';
const SETUP_TOKEN = 'setup-token-for-tests-123';

let env: Env & { DB: ReturnType<typeof createD1> };

async function call<T = Record<string, unknown>>(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const req = new Request(`https://mabubu.test${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const res = await handle(req, env);
  return { status: res.status, body: (await res.json()) as T };
}

function device(label: string) {
  return { deviceId: uuidv7(), deviceSecret: randomToken(32), deviceLabel: label };
}

let opClock = Date.now() - 3600_000;
function mk<T extends OpType>(type: T, payload: PayloadOf<T>, actorId: string, deviceId: string, deviceTime?: string): AnyOp {
  opClock += 1000;
  const r = parseOp({
    id: uuidv7(opClock),
    type,
    payload,
    actorId,
    deviceId,
    deviceTime: deviceTime ?? new Date(opClock).toISOString(),
    tzOffsetMin: 180,
    createdOnline: true,
    v: ENGINE_VERSION,
  });
  if (!r.ok) throw new Error(r.error);
  return r.op!;
}

async function pushOps(token: string, ops: AnyOp[], clientNow = new Date().toISOString()) {
  return call<PushResponse>('POST', '/api/sync/push', { ops, clientNow }, token);
}

/** `proto` as the app sends it; without it, the server answers as for an app older than SYNC_PROTO 2. */
async function pullAll(token: string, proto?: number) {
  const all: PullResponse['ops'] = [];
  let since = 0;
  let last: PullResponse;
  for (;;) {
    const r = await call<PullResponse>('GET', `/api/sync/pull?since=${since}&limit=7${proto ? `&proto=${proto}` : ''}`, undefined, token);
    expect(r.status).toBe(200);
    last = r.body;
    all.push(...last.ops);
    since = last.next;
    if (!last.more) break;
  }
  return { ops: all, directory: last.directory, me: last.me };
}

const ownerDev = device('Owner laptop');
let owner: { token: string; id: string };

async function setupOwner() {
  const r = await call<LoginResponse>('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'Jowg', pin: '470915', ...ownerDev });
  expect(r.status).toBe(200);
  if (r.body.status !== 'ok') throw new Error('setup failed');
  owner = { token: r.body.token, id: r.body.user.id };
}

async function createPerson(name: string, role: 'manager' | 'worker', pin: string, locationId: string | null = null) {
  const r = await call<PersonRow>('POST', '/api/admin/people', { name, role, pin, locationId, grants: [], revokes: [], allowOnDeviceId: null }, owner.token);
  expect(r.status).toBe(201);
  return r.body;
}

async function seedCatalogue() {
  const d = ownerDev.deviceId;
  const ops = [
    mk('location.upsert', { id: 'loc-msa', name: 'Mombasa', kind: 'purchasing', currency: 'KES', active: true }, owner.id, d),
    mk('location.upsert', { id: 'loc-com', name: 'Comoros', kind: 'selling', currency: 'KMF', active: true }, owner.id, d),
    mk('vendor.upsert', { id: 'ven-hafsa', name: 'Hafsa', phone: '', notes: '', active: true }, owner.id, d),
    mk('garment.upsert', { id: 'gt-haf', code: 'HAF-EN80', name: 'Elastic-neck', sizeCategoryId: null, vendorId: 'ven-hafsa', description: '', swatch: '#c2410c', active: true }, owner.id, d),
    mk('price.set', { id: 'pr-haf', garmentTypeId: 'gt-haf', locationId: 'loc-com', currency: 'KMF', retail: 1000, wholesale: 850, effectiveFrom: '2026-01-01' }, owner.id, d),
  ];
  const r = await pushOps(owner.token, ops);
  expect(r.body.results.map((x) => x.status)).toEqual(ops.map(() => 'applied'));
  return ops;
}

async function signIn(name: string, pin: string, dev: ReturnType<typeof device>) {
  return call<LoginResponse & { error?: string; message?: string; attemptsLeft?: number; retryAfterSec?: number }>('POST', '/api/auth/login', { name, pin, ...dev });
}

async function approvedWorker(name: string, pin: string) {
  const person = await createPerson(name, 'worker', pin, 'loc-com');
  const dev = device(`${name} phone`);
  const first = await signIn(name, pin, dev);
  expect(first.status).toBe(202);
  await call('POST', '/api/admin/access', { deviceId: dev.deviceId, userId: person.id, decision: 'approve' }, owner.token);
  const r = await signIn(name, pin, dev);
  if (r.body.status !== 'ok') throw new Error('expected approval');
  return { id: person.id, token: r.body.token, dev };
}

beforeEach(() => {
  env = { DB: createD1(), PIN_PEPPER: PEPPER, SETUP_TOKEN };
});

describe('first setup', () => {
  it('reports setup needed, refuses a wrong key, then creates the owner', async () => {
    expect((await call('GET', '/api/setup/status')).body).toEqual({ needsSetup: true, setupEnabled: true });
    const bad = await call('POST', '/api/setup', { setupToken: 'wrong-token-1234567', name: 'Jowg', pin: '470915', ...ownerDev });
    expect(bad.status).toBe(401);
    await setupOwner();
    expect((await call('GET', '/api/setup/status')).body).toMatchObject({ needsSetup: false });
    const me = await call<{ user: { role: string; caps: string[] } }>('GET', '/api/auth/me', undefined, owner.token);
    expect(me.body.user.role).toBe('owner');
    expect(me.body.user.caps).toContain('users.manage');
  });

  it('refuses a weak owner code', async () => {
    const r = await call('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'Jowg', pin: '4770', ...ownerDev });
    expect(r.status).toBe(400);
  });

  it('marks first setup as created and owner recovery as not created', async () => {
    // First creation.
    const first = await call<LoginResponse>('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'Jowg', pin: '470915', ...ownerDev });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: 'ok', created: true });

    // Running setup again for the same owner is recovery: it succeeds but must
    // NOT report `created`, so the client never re-seeds the starter data.
    const again = await call<LoginResponse>('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'Jowg', pin: '817263', ...device('Owner recovery') });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ status: 'ok', created: false });

    // Still exactly one user (recovery updates the owner, does not add one).
    const n = env.DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    expect(n.n).toBe(1);
  });

  it('never stores an access code as plain text', async () => {
    await setupOwner();
    const row = env.DB.raw.prepare('SELECT pin_hmac FROM users').get() as { pin_hmac: string };
    expect(row.pin_hmac).not.toContain('470915');
    expect(row.pin_hmac).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('sign-in protection', () => {
  beforeEach(async () => {
    await setupOwner();
    await seedCatalogue();
  });

  it('requires owner approval for a new device, matching a short code', async () => {
    const amina = await createPerson('Amina', 'worker', '4770', 'loc-com');
    const phone = device('Amina phone');
    const r = await signIn('amina', '4770', phone);
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ status: 'pending', userName: 'Amina' });
    const code = (r.body as { deviceCode: string }).deviceCode;
    expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);

    const people = await call<PeopleResponse>('GET', '/api/admin/people', undefined, owner.token);
    const dev = people.body.devices.find((d) => d.id === phone.deviceId)!;
    expect(dev.code).toBe(code);
    expect(dev.access).toEqual([expect.objectContaining({ userId: amina.id, status: 'pending' })]);

    await call('POST', '/api/admin/access', { deviceId: phone.deviceId, userId: amina.id, decision: 'approve' }, owner.token);
    const ok = await signIn('Amina', '4770', phone);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('ok');
  });

  it('gives the same answer for an unknown name and a wrong code', async () => {
    await createPerson('Amina', 'worker', '4770', 'loc-com');
    const unknown = await signIn('Nobody', '4770', device('x'));
    const wrong = await signIn('Amina', '9999', device('y'));
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('locks an account after 5 wrong codes and lets the owner unlock it', async () => {
    const a = await approvedWorker('Amina', '4770');
    let last;
    for (let i = 0; i < 4; i++) {
      last = await signIn('Amina', '1111', a.dev);
      expect(last.status).toBe(401);
      expect(last.body.attemptsLeft).toBe(4 - i);
    }
    last = await signIn('Amina', '1111', a.dev);
    expect(last.status).toBe(423);
    expect(last.body.retryAfterSec).toBeGreaterThan(800);
    // Even the right code is refused while locked.
    expect((await signIn('Amina', '4770', a.dev)).status).toBe(423);
    await call('POST', `/api/admin/people/${a.id}/unlock`, {}, owner.token);
    expect((await signIn('Amina', '4770', a.dev)).status).toBe(200);
  });

  it('refuses a device that presents the wrong secret', async () => {
    const a = await approvedWorker('Amina', '4770');
    const r = await signIn('Amina', '4770', { ...a.dev, deviceSecret: randomToken(32) });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('device_mismatch');
  });

  it('ends sessions immediately when a person is switched off or a device is blocked', async () => {
    const a = await approvedWorker('Amina', '4770');
    expect((await call('GET', '/api/auth/me', undefined, a.token)).status).toBe(200);
    await call('PATCH', `/api/admin/people/${a.id}`, { active: false }, owner.token);
    expect((await call('GET', '/api/auth/me', undefined, a.token)).status).toBe(401);

    const s = await approvedWorker('Said', '5829');
    await call('PATCH', `/api/admin/devices/${s.dev.deviceId}`, { blocked: true }, owner.token);
    expect((await call('GET', '/api/auth/me', undefined, s.token)).status).toBe(401);
  });

  it('keeps at least one active owner', async () => {
    const r = await call('PATCH', `/api/admin/people/${owner.id}`, { role: 'manager' }, owner.token);
    expect(r.status).toBe(400);
  });

  it('cannot escalate a manager by writing an owner-only capability into their grants', async () => {
    const m = await createPerson('Mama', 'manager', '472913', null);
    // Even when the owner-only capability is written straight into the record,
    // it must never become effective for a non-owner.
    const patched = await call<PersonRow>('PATCH', `/api/admin/people/${m.id}`, { grants: ['users.manage'] }, owner.token);
    expect(patched.body.caps).not.toContain('users.manage');

    const dev = device('Mama laptop');
    expect((await signIn('Mama', '472913', dev)).status).toBe(202);
    await call('POST', '/api/admin/access', { deviceId: dev.deviceId, userId: m.id, decision: 'approve' }, owner.token);
    const ok = await signIn('Mama', '472913', dev);
    if (ok.body.status !== 'ok') throw new Error('expected approval');
    expect(ok.body.user.caps).not.toContain('users.manage');

    // So the manager's session is refused by every people/device admin endpoint.
    expect((await call('GET', '/api/admin/people', undefined, ok.body.token)).status).toBe(403);
    expect((await call('PATCH', `/api/admin/devices/${dev.deviceId}`, { retired: true }, ok.body.token)).status).toBe(403);
  });

  it('rejects requests from another website', async () => {
    const r = await call('POST', '/api/sync/push', { ops: [], clientNow: new Date().toISOString() }, owner.token, { origin: 'https://evil.example' });
    expect(r.status).toBe(403);
  });
});

describe('device retirement (lifecycle distinct from temporary blocking)', () => {
  beforeEach(async () => {
    await setupOwner();
    await seedCatalogue();
  });

  const devicesOf = async () => (await call<PeopleResponse>('GET', '/api/admin/people', undefined, owner.token)).body.devices;
  const eventTypes = () =>
    (env.DB.raw.prepare('SELECT kind FROM auth_events ORDER BY id').all() as { kind: string }[]).map((e) => e.kind);

  it('retiring a device blocks it, ends its sessions, flags it retired, and logs the event', async () => {
    const a = await approvedWorker('Amina', '4770');
    expect((await call('GET', '/api/auth/me', undefined, a.token)).status).toBe(200);

    const r = await call('PATCH', `/api/admin/devices/${a.dev.deviceId}`, { retired: true }, owner.token);
    expect(r.status).toBe(200);

    // Its live session is gone.
    expect((await call('GET', '/api/auth/me', undefined, a.token)).status).toBe(401);
    // A fresh sign-in on that identity is refused as blocked (retired implies blocked).
    const retry = await signIn('Amina', '4770', a.dev);
    expect(retry.status).toBe(403);
    expect(retry.body.error).toBe('device_blocked');

    const d = (await devicesOf()).find((x) => x.id === a.dev.deviceId)!;
    expect(d.retiredAt).not.toBeNull();
    expect(d.revokedAt).not.toBeNull();
    expect(eventTypes()).toContain('device_retired');
  });

  it('reactivating a retired device clears both flags and lets an approved person back in', async () => {
    const a = await approvedWorker('Amina', '4770');
    await call('PATCH', `/api/admin/devices/${a.dev.deviceId}`, { retired: true }, owner.token);

    const r = await call('PATCH', `/api/admin/devices/${a.dev.deviceId}`, { retired: false }, owner.token);
    expect(r.status).toBe(200);

    const d = (await devicesOf()).find((x) => x.id === a.dev.deviceId)!;
    expect(d.retiredAt).toBeNull();
    expect(d.revokedAt).toBeNull();
    expect(eventTypes()).toContain('device_reactivated');

    // The person previously approved on it can sign in again (like unblock).
    expect((await signIn('Amina', '4770', a.dev)).status).toBe(200);
  });

  it('a plain unblock never resurrects a retired device', async () => {
    const a = await approvedWorker('Amina', '4770');
    await call('PATCH', `/api/admin/devices/${a.dev.deviceId}`, { retired: true }, owner.token);

    // Sending { blocked:false } must not clear the retirement — it stays retired and blocked.
    await call('PATCH', `/api/admin/devices/${a.dev.deviceId}`, { blocked: false }, owner.token);
    const d = (await devicesOf()).find((x) => x.id === a.dev.deviceId)!;
    expect(d.retiredAt).not.toBeNull();
    expect(d.revokedAt).not.toBeNull();
    expect((await signIn('Amina', '4770', a.dev)).status).toBe(403);
  });

  it('refuses to retire the device the owner is signed in on', async () => {
    const r = await call('PATCH', `/api/admin/devices/${ownerDev.deviceId}`, { retired: true }, owner.token);
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toBe('own_device');
  });

  it('only a person who can manage users may retire a device', async () => {
    const a = await approvedWorker('Amina', '4770');
    const s = await approvedWorker('Said', '5829');
    const r = await call('PATCH', `/api/admin/devices/${a.dev.deviceId}`, { retired: true }, s.token);
    expect(r.status).toBe(403);
  });
});

describe('owner recovery on a lost / unrecognised device', () => {
  beforeEach(async () => {
    await setupOwner();
  });

  it('re-links a new device with the setup key — approved at once, no second owner, other devices untouched', async () => {
    // Cleared storage → a brand-new device identity. Ordinary login is stuck pending.
    const fresh = device('Owner new laptop');
    const pending = await signIn('Jowg', '470915', fresh);
    expect(pending.status).toBe(202);
    expect(pending.body.status).toBe('pending');

    // The setup key recovers the owner on THIS device and returns a working session.
    const rec = await call<LoginResponse>('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'Jowg', pin: '470915', ...fresh });
    expect(rec.status).toBe(200);
    expect(rec.body).toMatchObject({ status: 'ok', created: false });
    if (rec.body.status !== 'ok') throw new Error('recovery failed');
    const me = await call<{ user: { role: string } }>('GET', '/api/auth/me', undefined, rec.body.token);
    expect(me.body.user.role).toBe('owner');

    // Exactly one owner and one user — recovery never creates a second owner.
    expect((env.DB.raw.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'").get() as { n: number }).n).toBe(1);
    expect((env.DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n).toBe(1);

    // The previously-approved device still works (recovery did not revoke it).
    expect((await signIn('Jowg', '470915', ownerDev)).status).toBe(200);
  });

  it('refuses recovery with a wrong setup key and leaves the device unapproved', async () => {
    const fresh = device('Owner new laptop');
    const bad = await call('POST', '/api/setup', { setupToken: 'totally-the-wrong-key-123', name: 'Jowg', pin: '470915', ...fresh });
    expect(bad.status).toBe(401);
    expect((await signIn('Jowg', '470915', fresh)).status).toBe(202); // still pending
  });

  it('does not let a new device bypass owner approval without the setup key', async () => {
    // Even if a setup token is smuggled into the login body, login never approves a new device.
    const sneaky = device('Unknown');
    const r = await call<LoginResponse>('POST', '/api/auth/login', { name: 'Jowg', pin: '470915', setupToken: SETUP_TOKEN, ...sneaky });
    expect(r.status).toBe(202);
    expect(r.body.status).toBe('pending');
  });

  it('a worker cannot use the setup key to become an owner', async () => {
    await seedCatalogue();
    const w = await createPerson('Zawadi', 'worker', '4062', 'loc-com');
    // A 4-digit worker code is rejected by the owner PIN policy before anything else.
    const weak = await call('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'Zawadi', pin: '4062', ...device('Zawadi laptop') });
    expect(weak.status).toBe(400);
    expect((weak.body as { error: string }).error).toBe('weak_pin');
    // Even with an owner-strength code, the setup key only recovers the OWNER account,
    // never a worker: the name is not an owner, so it is refused as not_owner.
    const elevate = await call('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'Zawadi', pin: '419283', ...device('Zawadi laptop') });
    expect(elevate.status).toBe(400);
    expect((elevate.body as { error: string }).error).toBe('not_owner');
    expect((env.DB.raw.prepare('SELECT role FROM users WHERE id = ?').get(w.id) as { role: string }).role).toBe('worker');
  });
});

describe('sync', () => {
  beforeEach(async () => {
    await setupOwner();
  });

  it('assigns sequence numbers and never applies the same record twice (AT-10)', async () => {
    const ops = await seedCatalogue();
    const again = await pushOps(owner.token, ops);
    expect(again.body.results.every((r) => r.duplicate && r.status === 'applied' && r.seq)).toBe(true);
    const count = (env.DB.raw.prepare('SELECT COUNT(*) AS n FROM ops').get() as { n: number }).n;
    expect(count).toBe(ops.length);

    const buy = mk('purchase.record', { id: 'pur-1', vendorId: 'ven-hafsa', locationId: 'loc-msa', date: '2026-10-10', currency: 'KES', intake: 'collected', lines: [{ garmentTypeId: 'gt-haf', qty: 100, unitCost: 8000 }], note: '' }, owner.id, ownerDev.deviceId);
    await pushOps(owner.token, [buy]);
    await pushOps(owner.token, [buy]);
    const bal = env.DB.raw.prepare("SELECT qty FROM balances WHERE acct = 'avail|loc-msa' AND gt = 'gt-haf'").get() as { qty: number };
    expect(bal.qty).toBe(100);
  });

  it('enforces worker permissions on the server (AT-13)', async () => {
    await seedCatalogue();
    const a = await approvedWorker('Amina', '4770');
    const s = await approvedWorker('Said', '5829');
    const d = a.dev.deviceId;

    const r = await pushOps(a.token, [
      mk('purchase.record', { id: 'pur-x', vendorId: 'ven-hafsa', locationId: 'loc-msa', date: '2026-10-10', currency: 'KES', intake: 'collected', lines: [{ garmentTypeId: 'gt-haf', qty: 1, unitCost: 1 }], note: '' }, a.id, d),
      mk('worker.issue', { workerId: s.id, locationId: 'loc-com', workDate: '2026-10-17', lines: [{ garmentTypeId: 'gt-haf', qty: 5 }] }, a.id, d),
      mk('worker.issue', { workerId: a.id, locationId: 'loc-com', workDate: '2026-10-17', lines: [{ garmentTypeId: 'gt-haf', qty: 5 }] }, a.id, d),
      // Pretending to be Said:
      mk('worker.issue', { workerId: s.id, locationId: 'loc-com', workDate: '2026-10-17', lines: [{ garmentTypeId: 'gt-haf', qty: 5 }] }, s.id, d),
    ]);
    expect(r.body.results.map((x) => x.status)).toEqual(['rejected', 'rejected', 'applied', 'rejected']);
    expect(r.body.results[3]!.error).toMatch(/own name/);

    // Worker API: no admin endpoints, no costs, no other workers.
    expect((await call('GET', '/api/admin/people', undefined, a.token)).status).toBe(403);
    expect((await call('GET', '/api/admin/export', undefined, a.token)).status).toBe(403);
    expect((await call('GET', '/api/admin/events', undefined, a.token)).status).toBe(403);

    await pushOps(s.token, [mk('worker.issue', { workerId: s.id, locationId: 'loc-com', workDate: '2026-10-17', lines: [{ garmentTypeId: 'gt-haf', qty: 3 }] }, s.id, s.dev.deviceId)]);
    await pushOps(owner.token, [mk('purchase.record', { id: 'pur-2', vendorId: 'ven-hafsa', locationId: 'loc-msa', date: '2026-10-10', currency: 'KES', intake: 'collected', lines: [{ garmentTypeId: 'gt-haf', qty: 9, unitCost: 8000 }], note: '' }, owner.id, ownerDev.deviceId)]);

    const pulled = await pullAll(a.token);
    const applied = pulled.ops.filter((o) => o.status === 'applied');
    const types = applied.map((o) => o.type);
    expect(types).not.toContain('purchase.record');
    expect(types).not.toContain('vendor.upsert');
    expect(applied.filter((o) => o.type === 'worker.issue').every((o) => (o.payload as { workerId: string }).workerId === a.id)).toBe(true);
    expect(types).toContain('price.set');
    expect(pulled.directory.map((u) => u.id)).toEqual([a.id]);
    expect(pulled.ops.every((o) => o.flags.length === 0 && o.clockSkewMs === null)).toBe(true);
    // Her own rejected attempts are visible to her, so the phone can show them,
    // and all three are logged against her, not against Said.
    const rejected = pulled.ops.filter((o) => o.status === 'rejected');
    expect(rejected.length).toBe(3);
    expect(rejected.every((o) => o.actorId === a.id)).toBe(true);
    const saidSees = await pullAll(s.token);
    expect(saidSees.ops.filter((o) => o.status === 'rejected')).toEqual([]);
  });

  it('keeps device time and server time separately and flags clock problems (AT-12)', async () => {
    await seedCatalogue();
    const a = await approvedWorker('Amina', '4770');
    const recordedAt = new Date(Date.now() - 20 * 3600_000).toISOString();
    const issue = mk('worker.issue', { workerId: a.id, locationId: 'loc-com', workDate: new Date(Date.now() - 20 * 3600_000 + 3 * 3600_000).toISOString().slice(0, 10), lines: [{ garmentTypeId: 'gt-haf', qty: 5 }] }, a.id, a.dev.deviceId, recordedAt);
    const clientNow = new Date(Date.now() - 2 * 3600_000).toISOString(); // phone clock 2 h behind
    const r = await pushOps(a.token, [issue], clientNow);
    expect(r.body.results[0]!.status).toBe('applied');

    const pulled = await pullAll(owner.token);
    const got = pulled.ops.find((o) => o.id === issue.id)!;
    expect(got.deviceTime).toBe(recordedAt);
    expect(Date.parse(got.serverTime)).toBeGreaterThan(Date.parse(recordedAt));
    expect(got.clockSkewMs).toBeGreaterThan(7_000_000);
    expect(got.flags.map((f) => f.code)).toEqual(expect.arrayContaining(['CLOCK_SKEW', 'LATE_SYNC']));
  });

  it('processes a take-out and its cancellation sent together, and marks the original as cancelled', async () => {
    await seedCatalogue();
    const a = await approvedWorker('Amina', '4770');
    const issue = mk('worker.issue', { workerId: a.id, locationId: 'loc-com', workDate: '2026-10-17', lines: [{ garmentTypeId: 'gt-haf', qty: 50 }] }, a.id, a.dev.deviceId);
    const cancel = mk('op.void', { targetId: issue.id, reason: 'Typed 50 not 40' }, a.id, a.dev.deviceId);
    const r = await pushOps(a.token, [issue, cancel]);
    expect(r.body.results.map((x) => x.status)).toEqual(['applied', 'applied']);
    const row = env.DB.raw.prepare('SELECT voided_by FROM ops WHERE id = ?').get(issue.id) as { voided_by: string };
    expect(row.voided_by).toBe(cancel.id);
    const bal = env.DB.raw.prepare(`SELECT COALESCE(SUM(qty), 0) AS q FROM balances WHERE acct = ?`).get(`worker|loc-com|${a.id}`) as { q: number };
    expect(bal.q).toBe(0);
  });

  it('accepts one approval per closing; a repeat approval is refused, changes nothing, and is not stored twice on retry', async () => {
    await seedCatalogue();
    const a = await approvedWorker('Amina', '4770');
    const d = a.dev.deviceId;
    const day = { workerId: a.id, locationId: 'loc-com', workDate: '2026-10-17' };
    await pushOps(a.token, [
      mk('worker.issue', { ...day, lines: [{ garmentTypeId: 'gt-haf', qty: 5 }] }, a.id, d),
      mk('worker.settle', { ...day, currency: 'KMF', lines: [{ garmentTypeId: 'gt-haf', held: 5, sold: 5, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 }], cash: 5000, mobile: 0, expenses: [], note: '' }, a.id, d),
    ]);
    const first = mk('worker.review', { workerId: a.id, workDate: day.workDate, decision: 'approved', note: 'ok' }, owner.id, ownerDev.deviceId);
    const second = mk('worker.review', { workerId: a.id, workDate: day.workDate, decision: 'approved', note: 'again' }, owner.id, ownerDev.deviceId);
    const r = await pushOps(owner.token, [first, second]);
    expect(r.body.results.map((x) => x.status)).toEqual(['applied', 'rejected']);
    expect(r.body.results[1]!.error).toMatch(/already approved/);
    const stored = JSON.parse((env.DB.raw.prepare('SELECT data FROM entities WHERE key = ?').get(`day:${a.id}:${day.workDate}`) as { data: string }).data);
    expect(stored.review).toMatchObject({ decision: 'approved', note: 'ok' });
    const retry = await pushOps(owner.token, [second]);
    expect(retry.body.results[0]).toMatchObject({ status: 'rejected', duplicate: true });
    expect((env.DB.raw.prepare("SELECT COUNT(*) AS n FROM ops WHERE type = 'worker.review'").get() as { n: number }).n).toBe(2);
  });

  it('server balances equal a replay of the downloaded records', async () => {
    await seedCatalogue();
    const a = await approvedWorker('Amina', '4770');
    const d = ownerDev.deviceId;
    await pushOps(owner.token, [
      mk('purchase.record', { id: 'pur-c', vendorId: 'ven-hafsa', locationId: 'loc-msa', date: '2026-10-10', currency: 'KES', intake: 'inspection', lines: [{ garmentTypeId: 'gt-haf', qty: 500, unitCost: 8000 }], note: '' }, owner.id, d),
      mk('purchase.inspect', { purchaseId: 'pur-c', date: '2026-10-11', lines: [{ garmentTypeId: 'gt-haf', accepted: 300, rejected: 200, reason: '' }], note: '' }, owner.id, d),
      mk('shipment.dispatch', { id: 'shp-1', code: 'AIR-1', fromLocationId: 'loc-msa', toLocationId: 'loc-com', method: 'air', carrier: '', packages: [], lines: [{ garmentTypeId: 'gt-haf', qty: 300 }], date: '2026-10-12', expectedDate: null, note: '' }, owner.id, d),
      mk('shipment.receive', { shipmentId: 'shp-1', date: '2026-10-14', lines: [{ garmentTypeId: 'gt-haf', received: 298, missing: 2 }], note: '' }, owner.id, d),
    ]);
    await pushOps(a.token, [
      mk('worker.issue', { workerId: a.id, locationId: 'loc-com', workDate: '2026-10-17', lines: [{ garmentTypeId: 'gt-haf', qty: 50 }] }, a.id, a.dev.deviceId),
      mk('worker.return', { workerId: a.id, locationId: 'loc-com', workDate: '2026-10-17', lines: [{ garmentTypeId: 'gt-haf', qty: 12 }] }, a.id, a.dev.deviceId),
      mk('worker.settle', { workerId: a.id, locationId: 'loc-com', workDate: '2026-10-17', currency: 'KMF', lines: [{ garmentTypeId: 'gt-haf', held: 38, sold: 38, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 }], cash: 38_000, mobile: 0, expenses: [], note: '' }, a.id, a.dev.deviceId),
    ]);

    const pulled = await pullAll(owner.token);
    const L = new Ledger();
    L.setUsers(pulled.directory);
    for (const o of pulled.ops) {
      if (o.status !== 'applied') continue;
      const r = L.apply(o, null);
      expect(r.ok).toBe(true);
    }
    const server = new Map(
      (env.DB.raw.prepare('SELECT acct, gt, qty FROM balances WHERE qty <> 0').all() as { acct: string; gt: string; qty: number }[]).map((r) => [balanceKey(r.acct, r.gt), r.qty]),
    );
    expect(Object.fromEntries(L.balances)).toEqual(Object.fromEntries(server));
    expect(L.balance('avail|loc-com', 'gt-haf')).toBe(260);
    expect(L.balance('sold|loc-com', 'gt-haf')).toBe(38);
  });

  it('rolls back a write if a record changed concurrently (version guard)', async () => {
    const db = env.DB;
    db.raw.exec("INSERT INTO entities (key, kind, data, ver, updated_at) VALUES ('loc:x', 'loc', '{}', 2, 'now')");
    const rows = JSON.stringify([{ k: 'loc:x', kind: 'loc', data: '{"a":1}', ver: 2 }]);
    await expect(
      db.batch([
        db
          .prepare(
            `INSERT INTO entities (key, kind, data, ver, updated_at)
             SELECT json_extract(value, '$.k'), json_extract(value, '$.kind'), json_extract(value, '$.data'), json_extract(value, '$.ver'), 'now'
               FROM json_each(?1) WHERE true
             ON CONFLICT (key) DO UPDATE SET data = excluded.data, ver = excluded.ver WHERE entities.ver = excluded.ver - 1`,
          )
          .bind(rows),
        db.prepare('INSERT INTO guard (v) SELECT 1 WHERE changes() <> ?').bind(1),
      ]),
    ).rejects.toThrow(/CHECK constraint failed/);
    expect((db.raw.prepare("SELECT data FROM entities WHERE key = 'loc:x'").get() as { data: string }).data).toBe('{}');
  });

  it('rejects an unauthenticated upload', async () => {
    expect((await call('POST', '/api/sync/push', { ops: [], clientNow: '' })).status).toBe(401);
    expect((await call('GET', '/api/sync/pull', undefined, 'not-a-real-token-but-long-enough')).status).toBe(401);
  });
});

describe('late records: worker records that reach the server after their day was closed (ADR-004)', () => {
  const DAY = '2026-10-17';
  const row = (id: string) => env.DB.raw.prepare('SELECT status, review, resolved_by, error, flags, device_time, server_time FROM ops WHERE id = ?').get(id) as { status: string; review: string | null; resolved_by: string | null; error: string | null; flags: string; device_time: string; server_time: string };
  const qty = (acct: string) => (env.DB.raw.prepare('SELECT COALESCE(SUM(qty), 0) AS q FROM balances WHERE acct = ? AND gt = ?').get(acct, 'gt-haf') as { q: number }).q;
  const count = (sql: string) => (env.DB.raw.prepare(sql).get() as { n: number }).n;

  /** Mirrors the app's rebuild: refused and late records first, then everything applied in server order. */
  function replay(pulled: Awaited<ReturnType<typeof pullAll>>) {
    const L = new Ledger();
    L.setUsers(pulled.directory);
    for (const o of pulled.ops) if (o.status === 'rejected') L.recordRejected(o, o);
    for (const o of pulled.ops) {
      if (o.status !== 'applied') continue;
      const r = L.apply(o, null);
      expect(r.ok, r.ok ? '' : `${o.type}: ${r.error}`).toBe(true);
    }
    return L;
  }
  const serverBalances = () =>
    Object.fromEntries((env.DB.raw.prepare('SELECT acct, gt, qty FROM balances WHERE qty <> 0').all() as { acct: string; gt: string; qty: number }[]).map((r) => [balanceKey(r.acct, r.gt), r.qty]));

  async function stockedDay() {
    await setupOwner();
    await seedCatalogue();
    const d = ownerDev.deviceId;
    await pushOps(owner.token, [
      mk('purchase.record', { id: 'pur-1', vendorId: 'ven-hafsa', locationId: 'loc-msa', date: '2026-10-10', currency: 'KES', intake: 'collected', lines: [{ garmentTypeId: 'gt-haf', qty: 20, unitCost: 8000 }], note: '' }, owner.id, d),
      mk('shipment.dispatch', { id: 'shp-1', code: 'AIR-1', fromLocationId: 'loc-msa', toLocationId: 'loc-com', method: 'air', carrier: '', packages: [], lines: [{ garmentTypeId: 'gt-haf', qty: 20 }], date: '2026-10-11', expectedDate: null, note: '' }, owner.id, d),
      mk('shipment.receive', { shipmentId: 'shp-1', date: '2026-10-12', lines: [{ garmentTypeId: 'gt-haf', received: 20, missing: 0 }], note: '' }, owner.id, d),
    ]);
    const a = await approvedWorker('Amina', '4770');
    const day = { workerId: a.id, locationId: 'loc-com', workDate: DAY };
    // On time: Amina takes 5. Later the owner closes her day for her: 5 held, 5 sold.
    expect((await pushOps(a.token, [mk('worker.issue', { ...day, lines: [{ garmentTypeId: 'gt-haf', qty: 5 }] }, a.id, a.dev.deviceId)])).body.results[0]!.status).toBe('applied');
    const close = mk('worker.settle', { ...day, currency: 'KMF', lines: [{ garmentTypeId: 'gt-haf', held: 5, sold: 5, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 }], cash: 5000, mobile: 0, expenses: [], note: '' }, owner.id, d);
    // Meanwhile her phone, offline, saved a take of 3 — two hours before the closing, by its clock.
    const late = mk('worker.issue', { ...day, lines: [{ garmentTypeId: 'gt-haf', qty: 3 }] }, a.id, a.dev.deviceId, new Date(Date.now() - 2 * 3600_000).toISOString());
    expect((await pushOps(owner.token, [close])).body.results[0]!.status).toBe('applied');
    return { a, day, close, late };
  }

  it('Scenarios A and C: a take arriving after the closing is kept for a manager, counts nothing, and a retry stores it once', async () => {
    const { a, late } = await stockedDay();
    const workerAcct = `worker|loc-com|${a.id}`;
    // Phone clock 2 hours behind the server when it uploads (Scenario D evidence).
    const r = await pushOps(a.token, [late], new Date(Date.now() - 2 * 3600_000).toISOString());
    expect(r.body.results[0]).toMatchObject({ status: 'rejected', review: 'waiting', error: 'This day is already closed. Ask a manager to reopen it.' });
    expect(row(late.id)).toMatchObject({ status: 'rejected', review: 'waiting', resolved_by: null, device_time: late.deviceTime });
    // Its timing evidence is kept like an accepted record's.
    expect((JSON.parse(row(late.id).flags) as { code: string }[]).map((f) => f.code)).toContain('CLOCK_SKEW');
    // Nothing counted: shelf 20 − 5 = 15, Amina holds 0.
    expect(qty('avail|loc-com')).toBe(15);
    expect(qty(workerAcct)).toBe(0);
    // Uploaded again (the reply was lost, the phone retries): same answer, one row.
    for (let i = 0; i < 2; i++) {
      const again = await pushOps(a.token, [late]);
      expect(again.body.results[0]).toMatchObject({ status: 'rejected', review: 'waiting', duplicate: true });
    }
    expect(count(`SELECT COUNT(*) AS n FROM ops WHERE id = '${late.id}'`)).toBe(1);
    expect(qty('avail|loc-com')).toBe(15);
  });

  it('Scenario F over the network: reopen + accept in one upload, close again; server and every device agree', async () => {
    const { a, day, close, late } = await stockedDay();
    await pushOps(a.token, [late]);
    // The worker cannot decide on her own late record.
    const own = await pushOps(a.token, [mk('op.resolve', { targetId: late.id, decision: 'accept', reason: '' }, a.id, a.dev.deviceId)]);
    expect(own.body.results[0]).toMatchObject({ status: 'rejected', error: 'Only a manager can decide on a late record.' });
    // Accepting while the day is still closed is refused (no silent change to a closed day).
    const early = await pushOps(owner.token, [mk('op.resolve', { targetId: late.id, decision: 'accept', reason: '' }, owner.id, ownerDev.deviceId)]);
    expect(early.body.results[0]).toMatchObject({ status: 'rejected', error: 'Reopen this day before accepting the late record.' });
    expect(row(late.id).review).toBe('waiting');
    // Reopen and accept, as the day screen sends them.
    const reopen = mk('op.void', { targetId: close.id, reason: 'Reopened to accept late records from the phone' }, owner.id, ownerDev.deviceId);
    const accept = mk('op.resolve', { targetId: late.id, decision: 'accept', reason: '' }, owner.id, ownerDev.deviceId);
    expect((await pushOps(owner.token, [reopen, accept])).body.results.map((x) => x.status)).toEqual(['applied', 'applied']);
    expect(row(late.id)).toMatchObject({ status: 'rejected', review: 'accepted', resolved_by: accept.id });
    // Shelf 20 − 5 − 3 = 12; Amina holds 8.
    expect(qty('avail|loc-com')).toBe(12);
    expect(qty(`worker|loc-com|${a.id}`)).toBe(8);
    // A second decision is refused.
    const twice = await pushOps(owner.token, [mk('op.resolve', { targetId: late.id, decision: 'reject', reason: 'changed my mind' }, owner.id, ownerDev.deviceId)]);
    expect(twice.body.results[0]).toMatchObject({ status: 'rejected', error: 'This late record was already decided.' });
    // Amina closes again with the real figures: 8 held, 7 sold, 1 kept.
    const reclose = mk('worker.settle', { ...day, currency: 'KMF', lines: [{ garmentTypeId: 'gt-haf', held: 8, sold: 7, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 1, lost: 0 }], cash: 7000, mobile: 0, expenses: [], note: '' }, a.id, a.dev.deviceId);
    expect((await pushOps(a.token, [reclose])).body.results[0]!.status).toBe('applied');
    expect(qty('sold|loc-com')).toBe(7);
    // 12 on the shelf + 1 kept + 7 sold = 20.
    expect(qty('avail|loc-com') + qty(`worker|loc-com|${a.id}`) + qty('sold|loc-com')).toBe(20);

    // The owner's device and Amina's phone rebuild exactly the server's numbers.
    const ownerView = replay(await pullAll(owner.token, 2));
    expect(Object.fromEntries(ownerView.balances)).toEqual(serverBalances());
    expect(ownerView.getOp(late.id)).toMatchObject({ status: 'applied', review: 'accepted', resolvedBy: accept.id });
    const amina = await pullAll(a.token, 2);
    expect(amina.ops.find((o) => o.id === accept.id)).toMatchObject({ type: 'op.resolve', status: 'applied' });
    expect(amina.ops.find((o) => o.id === late.id)).toMatchObject({ review: 'accepted', resolvedBy: accept.id });
    const aminaView = replay(amina);
    expect(aminaView.balance(`worker|loc-com|${a.id}`, 'gt-haf')).toBe(1);
    // An app that predates protocol 2 is never sent a record type it cannot replay.
    const old = await pullAll(owner.token);
    expect(old.ops.some((o) => o.type === 'op.resolve')).toBe(false);
  });

  it('Scenario E: rejecting with a reason counts nothing; the worker is told why; others never see it', async () => {
    const { a, late } = await stockedDay();
    const s = await approvedWorker('Said', '5829');
    await pushOps(a.token, [late]);
    const reject = mk('op.resolve', { targetId: late.id, decision: 'reject', reason: 'Counted the shelf: these 3 never left' }, owner.id, ownerDev.deviceId);
    expect((await pushOps(owner.token, [reject])).body.results[0]!.status).toBe('applied');
    expect(row(late.id)).toMatchObject({ review: 'rejected', resolved_by: reject.id });
    expect(qty('avail|loc-com')).toBe(15);
    const amina = await pullAll(a.token, 2);
    expect(amina.ops.find((o) => o.id === reject.id)?.payload).toMatchObject({ decision: 'reject', reason: 'Counted the shelf: these 3 never left' });
    expect(amina.ops.find((o) => o.id === late.id)).toMatchObject({ review: 'rejected' });
    // Another worker never receives Amina's late record or the decision.
    const said = await pullAll(s.token, 2);
    expect(said.ops.some((o) => o.id === late.id || o.id === reject.id)).toBe(false);
  });

  it('two managers deciding the same late record at the same moment: exactly one decision counts', async () => {
    const { a, close, late } = await stockedDay();
    await pushOps(a.token, [late]);
    // A second manager, Mama, on her own approved phone.
    const m = await createPerson('Mama', 'manager', '582913', null);
    const mDev = device('Mama phone');
    await signIn('Mama', '582913', mDev);
    await call('POST', '/api/admin/access', { deviceId: mDev.deviceId, userId: m.id, decision: 'approve' }, owner.token);
    const mLogin = await signIn('Mama', '582913', mDev);
    if (mLogin.body.status !== 'ok') throw new Error('manager not approved');
    await pushOps(owner.token, [mk('op.void', { targetId: close.id, reason: 'Reopened for the late take' }, owner.id, ownerDev.deviceId)]);
    // Both press Accept at once; the server sees both before either is saved.
    const byOwner = mk('op.resolve', { targetId: late.id, decision: 'accept', reason: '' }, owner.id, ownerDev.deviceId);
    const byMama = mk('op.resolve', { targetId: late.id, decision: 'accept', reason: '' }, m.id, mDev.deviceId);
    const [r1, r2] = await Promise.all([pushOps(owner.token, [byOwner]), pushOps(mLogin.body.token, [byMama])]);
    const results = [r1.body.results[0]!, r2.body.results[0]!];
    expect(results.map((r) => r.status).sort()).toEqual(['applied', 'rejected']);
    expect(results.find((r) => r.status === 'rejected')!.error).toBe('This late record was already decided.');
    const winner = results.find((r) => r.status === 'applied')!.id;
    expect(row(late.id)).toMatchObject({ review: 'accepted', resolved_by: winner });
    // The 3 pieces moved once: shelf 20 − 5 − 3 = 12, Amina holds 5 + 3 = 8.
    expect(qty('avail|loc-com')).toBe(12);
    expect(qty(`worker|loc-com|${a.id}`)).toBe(8);
    expect(count("SELECT COUNT(*) AS n FROM ops WHERE type = 'op.resolve' AND status = 'applied'")).toBe(1);
  });

  it('even when both decisions were checked against the same "waiting" state, the database lets only one through', async () => {
    const { a, close, late } = await stockedDay();
    await pushOps(a.token, [late]);
    await pushOps(owner.token, [mk('op.void', { targetId: close.id, reason: 'Reopened for the late take' }, owner.id, ownerDev.deviceId)]);
    // Force the race: the first decision waits at its final write until the
    // second has read the same state and reached its own final write.
    const realBatch = env.DB.batch.bind(env.DB);
    let writers = 0;
    let guardRefusals = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    env.DB.batch = (async (stmts: Parameters<typeof realBatch>[0]) => {
      if (stmts.some((s) => /UPDATE ops SET review/.test((s as unknown as { sql: string }).sql))) {
        writers++;
        if (writers === 1) await gate;
        else release();
      }
      try {
        return await realBatch(stmts);
      } catch (e) {
        if (/CHECK constraint failed/.test(String(e))) guardRefusals++;
        throw e;
      }
    }) as typeof env.DB.batch;
    try {
      const first = mk('op.resolve', { targetId: late.id, decision: 'accept', reason: '' }, owner.id, ownerDev.deviceId);
      const second = mk('op.resolve', { targetId: late.id, decision: 'reject', reason: 'Two people pressed at once' }, owner.id, ownerDev.deviceId);
      const [r1, r2] = await Promise.all([pushOps(owner.token, [first]), pushOps(owner.token, [second])]);
      const results = [r1.body.results[0]!, r2.body.results[0]!];
      expect(writers).toBe(2);
      expect(guardRefusals).toBe(1);
      expect(results.map((r) => r.status).sort()).toEqual(['applied', 'rejected']);
      expect(results.find((r) => r.status === 'rejected')!.error).toBe('This late record was already decided.');
      const winner = results.find((r) => r.status === 'applied')!.id;
      expect(row(late.id).resolved_by).toBe(winner);
      // Whichever won, the stock agrees with it exactly once.
      expect(qty('avail|loc-com')).toBe(winner === first.id ? 12 : 15);
    } finally {
      env.DB.batch = realBatch;
    }
  });

  it('server balances equal a replay of the downloaded records, with late records held and decided', async () => {
    const { a, close, late } = await stockedDay();
    await pushOps(a.token, [late]);
    const pulledWhileWaiting = await pullAll(owner.token, 2);
    expect(pulledWhileWaiting.ops.find((o) => o.id === late.id)).toMatchObject({ status: 'rejected', review: 'waiting' });
    expect(Object.fromEntries(replay(pulledWhileWaiting).balances)).toEqual(serverBalances());
    await pushOps(owner.token, [
      mk('op.void', { targetId: close.id, reason: 'Reopened' }, owner.id, ownerDev.deviceId),
      mk('op.resolve', { targetId: late.id, decision: 'accept', reason: '' }, owner.id, ownerDev.deviceId),
    ]);
    expect(Object.fromEntries(replay(await pullAll(owner.token, 2)).balances)).toEqual(serverBalances());
  });
});

describe('market exchange rates (server cache)', () => {
  const provider = {
    result: 'success',
    base_code: 'USD',
    time_last_update_unix: Math.floor(Date.now() / 1000) - 3600,
    time_next_update_unix: Math.floor(Date.now() / 1000) + 20 * 3600,
    rates: { USD: 1, KES: 129.5, KMF: 437.5, TZS: 2630, EUR: 0.89 },
  };
  afterEach(() => vi.unstubAllGlobals());

  it('needs a signed-in person', async () => {
    expect((await call('GET', '/api/fx/market')).status).toBe(401);
  });

  it('fetches once, then serves the cached rates without calling the provider again', async () => {
    await setupOwner();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(provider), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const a = await call<{ rates: { rates: Record<string, number>; publishedAt: string }; stale: boolean; refreshedNow: boolean }>('GET', '/api/fx/market', undefined, owner.token);
    expect(a.status).toBe(200);
    expect(a.body.refreshedNow).toBe(true);
    expect(a.body.stale).toBe(false);
    expect(a.body.rates.rates.KMF).toBe(437.5);
    const b = await call<{ refreshedNow: boolean }>('GET', '/api/fx/market', undefined, owner.token);
    expect(b.body.refreshedNow).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('says plainly when no rates have ever been fetched and the provider is down', async () => {
    await setupOwner();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
    const r = await call<{ error: string; message: string }>('GET', '/api/fx/market', undefined, owner.token);
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('rates_unavailable');
    expect(r.body.message).toMatch(/reach the rate provider/);
  });

  it('keeps the last good rates, marked stale, when a later refresh fails — and does not hammer the provider', async () => {
    await setupOwner();
    const old = { ...provider, time_last_update_unix: Math.floor(Date.now() / 1000) - 50 * 3600, time_next_update_unix: Math.floor(Date.now() / 1000) - 26 * 3600 };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(old), { status: 200 })));
    await call('GET', '/api/fx/market', undefined, owner.token);
    const failing = vi.fn(async () => new Response('{"result":"error"}', { status: 429 }));
    vi.stubGlobal('fetch', failing);
    const r = await call<{ stale: boolean; lastError: string; rates: { rates: Record<string, number> } }>('GET', '/api/fx/market', undefined, owner.token);
    expect(r.status).toBe(200);
    expect(r.body.stale).toBe(true);
    expect(r.body.lastError).toMatch(/limiting/);
    expect(r.body.rates.rates.KES).toBe(129.5);
    await call('GET', '/api/fx/market', undefined, owner.token);
    expect(failing).toHaveBeenCalledTimes(1); // waits before retrying
  });

  it('refuses an invalid provider response instead of storing it', async () => {
    await setupOwner();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...provider, rates: { USD: 3 } }), { status: 200 })));
    expect((await call('GET', '/api/fx/market', undefined, owner.token)).status).toBe(503);
    const row = env.DB.raw.prepare('SELECT data, last_error FROM fx_market').get() as { data: string | null; last_error: string };
    expect(row.data).toBeNull();
    expect(row.last_error).toMatch(/inconsistent/);
  });
});

describe('report downloads are logged and permission-checked', () => {
  it('records an owner export in the sign-in & device log', async () => {
    await setupOwner();
    const r = await call('POST', '/api/audit/export', { report: 'sales-days', format: 'pdf', rows: 12, filters: 'Last 7 days · Amina' }, owner.token);
    expect(r.status).toBe(200);
    const ev = await call<{ events: { kind: string; detail: Record<string, unknown> }[] }>('GET', '/api/admin/events', undefined, owner.token);
    expect(ev.body.events.find((e) => e.kind === 'report_exported')?.detail).toMatchObject({ report: 'sales-days', format: 'pdf', rows: 12, filters: 'Last 7 days · Amina' });
  });

  it('refuses a worker trying to log a management export', async () => {
    await setupOwner();
    await seedCatalogue();
    const w = await approvedWorker('Amina', '2580');
    const r = await call('POST', '/api/audit/export', { report: 'purchases', format: 'xlsx', rows: 3, filters: '' }, w.token);
    expect(r.status).toBe(403);
  });
});

describe('vendor payments sync', () => {
  it('uploading the same payment twice records it once, with its M-Pesa code', async () => {
    await setupOwner();
    await seedCatalogue();
    const d = ownerDev.deviceId;
    const buy = mk('purchase.record', { id: 'pur-1', vendorId: 'ven-hafsa', locationId: 'loc-msa', date: '2026-10-10', currency: 'KES', intake: 'awaiting', lines: [{ garmentTypeId: 'gt-haf', qty: 10, unitCost: 170_000 }], note: '' }, owner.id, d);
    const pay = mk('vendor.payment', { vendorId: 'ven-hafsa', purchaseId: null, date: '2026-10-18', amount: 1_700_000, currency: 'KES', method: 'mpesa', reference: 'UPKUIJ', note: '' }, owner.id, d);
    await pushOps(owner.token, [buy, pay]);
    const again = await pushOps(owner.token, [pay]);
    expect(again.body.results[0]).toMatchObject({ status: 'applied', duplicate: true });
    const { ops, directory } = await pullAll(owner.token);
    const payments = ops.filter((o) => o.type === 'vendor.payment');
    expect(payments).toHaveLength(1);
    expect((payments[0]!.payload as { reference: string }).reference).toBe('UPKUIJ');
    const { purchaseBalances } = await import('../src/shared/queries');
    const L = new Ledger();
    L.setUsers(directory);
    for (const o of ops) L.apply(o as AnyOp, null);
    expect(purchaseBalances(L).get('pur-1')!.balance).toBe(0);
  });
});

describe('account lifecycle: a returning account is not a returning device', () => {
  beforeEach(async () => {
    await setupOwner();
    await seedCatalogue();
  });

  const count = (sql: string, ...p: string[]) => (env.DB.raw.prepare(sql).get(...p) as { n: number }).n;
  const events = (kind: string) => env.DB.raw.prepare('SELECT detail FROM auth_events WHERE kind = ? ORDER BY id').all(kind) as { detail: string }[];

  it('tells the owner (only after a correct code) that a pending device is theirs, so they can recover', async () => {
    const fresh = device('Owner laptop after clearing data');
    const p = await signIn('Jowg', '470915', fresh);
    expect(p.status).toBe(202);
    expect(p.body).toMatchObject({ status: 'pending', role: 'owner' });
    // A wrong code reveals nothing about the role.
    const wrong = await signIn('Jowg', '111111', device('x'));
    expect(wrong.status).toBe(401);
    expect(wrong.body).not.toHaveProperty('role');
  });

  it('a worker and a manager on a new device are pending with their own role, and sign in once approved', async () => {
    const w = await createPerson('Amina', 'worker', '4770', 'loc-com');
    const m = await createPerson('Mama', 'manager', '472913', null);
    for (const [person, name, pin, role] of [
      [w, 'Amina', '4770', 'worker'],
      [m, 'Mama', '472913', 'manager'],
    ] as const) {
      const dev = device(`${name} phone`);
      expect((await signIn(name, pin, dev)).body).toMatchObject({ status: 'pending', role });
      await call('POST', '/api/admin/access', { deviceId: dev.deviceId, userId: person.id, decision: 'approve' }, owner.token);
      const ok = await signIn(name, pin, dev);
      expect(ok.status).toBe(200);
      if (ok.body.status !== 'ok') throw new Error('expected ok');
      expect(ok.body.user.role).toBe(role);
    }
  });

  it('repeated polling from the waiting screen never duplicates the device, the request or the log entry', async () => {
    await createPerson('Amina', 'worker', '4770', 'loc-com');
    const dev = device('Amina phone');
    for (let i = 0; i < 6; i++) expect((await signIn('Amina', '4770', dev)).status).toBe(202);
    expect(count('SELECT COUNT(*) AS n FROM devices WHERE id = ?', dev.deviceId)).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM device_access WHERE device_id = ?', dev.deviceId)).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM auth_events WHERE kind = 'device_requested' AND device_id = ?", dev.deviceId)).toBe(1);
  });

  it('recovery records whether the owner code changed, and a changed code replaces the old one', async () => {
    const same = await call<LoginResponse>('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'Jowg', pin: '470915', ...device('Recover A') });
    expect(same.status).toBe(200);
    const changed = await call<LoginResponse>('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'Jowg', pin: '903172', ...device('Recover B') });
    expect(changed.status).toBe(200);
    expect(events('setup_recover_owner').map((e) => JSON.parse(e.detail))).toEqual([{ pinChanged: false }, { pinChanged: true }]);
    expect((await signIn('Jowg', '470915', ownerDev)).status).toBe(401);
    expect((await signIn('Jowg', '903172', ownerDev)).status).toBe(200);
  });

  it('recovery on a business with records never offers the starter setup again, and leaves everyone else alone', async () => {
    const a = await approvedWorker('Amina', '4770');
    const snapshot = () => (env.DB.raw.prepare('SELECT id, name, role, active, location_id FROM users ORDER BY id').all() as Record<string, unknown>[]).map((u) => JSON.stringify(u));
    const entities = () => count('SELECT COUNT(*) AS n FROM entities');
    const before = { users: snapshot(), entities: entities(), ops: count('SELECT COUNT(*) AS n FROM ops') };
    const rec = await call<LoginResponse>('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'Jowg', pin: '470915', ...device('Owner new laptop') });
    expect(rec.body).toMatchObject({ status: 'ok', created: false, starterNeeded: false });
    expect({ users: snapshot(), entities: entities(), ops: count('SELECT COUNT(*) AS n FROM ops') }).toEqual(before);
    // The worker's approved device and session are untouched.
    expect((await call('GET', '/api/auth/me', undefined, a.token)).status).toBe(200);
  });

  it('an expired or revoked session ends; the same approved device signs in again without a new approval', async () => {
    const a = await approvedWorker('Amina', '4770');
    env.DB.raw.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').run('2000-01-01T00:00:00.000Z', a.id);
    const r = await call<{ error: string }>('GET', '/api/auth/me', undefined, a.token);
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('session_ended');
    expect((await signIn('Amina', '4770', a.dev)).status).toBe(200);

    const s = await approvedWorker('Said', '5829');
    await call('POST', '/api/admin/access', { deviceId: s.dev.deviceId, userId: s.id, decision: 'revoke' }, owner.token);
    expect((await call('GET', '/api/auth/me', undefined, s.token)).status).toBe(401);
    const again = await signIn('Said', '5829', s.dev);
    expect(again.status).toBe(403);
    expect((again.body as { error: string }).error).toBe('device_denied');
  });

  it('a switched-off person cannot sign in, and a duplicate name is refused', async () => {
    const a = await approvedWorker('Amina', '4770');
    await call('PATCH', `/api/admin/people/${a.id}`, { active: false }, owner.token);
    const r = await signIn('Amina', '4770', a.dev);
    expect(r.status).toBe(403);
    expect((r.body as { error: string }).error).toBe('disabled');
    const dup = await call('POST', '/api/admin/people', { name: '  amina ', role: 'worker', pin: '5937', locationId: 'loc-com', grants: [], revokes: [], allowOnDeviceId: null }, owner.token);
    expect(dup.status).toBe(409);
  });

  it('a worker cannot create people, promote themselves, approve devices or export', async () => {
    const a = await approvedWorker('Amina', '4770');
    expect((await call('POST', '/api/admin/people', { name: 'Boss', role: 'owner', pin: '583920', locationId: null, grants: [], revokes: [], allowOnDeviceId: null }, a.token)).status).toBe(403);
    expect((await call('PATCH', `/api/admin/people/${a.id}`, { role: 'owner' }, a.token)).status).toBe(403);
    expect((await call('POST', '/api/admin/access', { deviceId: a.dev.deviceId, userId: a.id, decision: 'approve' }, a.token)).status).toBe(403);
    expect((await call('GET', '/api/admin/export', undefined, a.token)).status).toBe(403);
    expect(count("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'")).toBe(1);
  });
});

describe('first setup is server-authoritative and happens once', () => {
  it('two first-setup requests racing each other cannot create two owners', async () => {
    await setupOwner();
    // Simulate the race: these requests read "no users yet" before the first
    // owner's batch landed.
    const realPrepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = ((sql: string) =>
      sql === 'SELECT COUNT(*) AS n FROM users' ? { bind: () => ({}), first: async () => ({ n: 0 }) } : realPrepare(sql)) as typeof env.DB.prepare;
    const other = await call<{ error: string }>('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'Someone Else', pin: '640281', ...device('Other laptop') });
    const sameName = await call<{ error: string }>('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'Jowg', pin: '640281', ...device('Third laptop') });
    env.DB.prepare = realPrepare;
    expect(other.status).toBe(409);
    expect(other.body.error).toBe('setup_race');
    expect(sameName.status).toBe(409);
    expect((env.DB.raw.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'").get() as { n: number }).n).toBe(1);
    expect((env.DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n).toBe(1);
  });

  it('a first setup interrupted before any record was saved can still finish its starter step — once', async () => {
    const first = await call<LoginResponse>('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'Jowg', pin: '470915', ...ownerDev });
    expect(first.body).toMatchObject({ created: true, starterNeeded: true });
    // The response was lost (tab closed); the owner tries again. That is a
    // recovery, but with no records yet the starter step is still offered.
    const retry = await call<LoginResponse>('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'Jowg', pin: '470915', ...ownerDev });
    expect(retry.body).toMatchObject({ status: 'ok', created: false, starterNeeded: true });
    if (retry.body.status !== 'ok') throw new Error('expected ok');
    owner = { token: retry.body.token, id: retry.body.user.id };
    await seedCatalogue();
    const third = await call<LoginResponse>('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'Jowg', pin: '470915', ...ownerDev });
    expect(third.body).toMatchObject({ created: false, starterNeeded: false });
    expect((env.DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n).toBe(1);
  });
});
