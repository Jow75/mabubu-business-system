// Go-live cutover (ADR-005) over HTTP against a real SQLite database: the
// owner's one-time move from test records to real business records.

import { beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { createD1 } from './d1-shim';
import { randomToken, uuidv7 } from '../src/shared/ids';
import { ENGINE_VERSION, parseOp, type AnyOp, type OpType, type PayloadOf } from '../src/shared/ops';
import { GOLIVE_PHRASE, INITIAL_LEDGER, planCutover, type GoLivePreview, type GoLiveStatus } from '../src/shared/golive';
import type { LoginResponse, PersonRow, PullResponse, PushResponse } from '../src/shared/api';
import { sha256Hex } from '../src/worker/crypto';

const PEPPER = 'test-pepper-0123456789-abcdefghijklmnop';
const SETUP_TOKEN = 'setup-token-for-tests-123';
const OWNER_PIN = '470915';
let env: Env & { DB: ReturnType<typeof createD1> };

async function call<T = Record<string, unknown>>(method: string, path: string, body?: unknown, token?: string) {
  const res = await handle(
    new Request(`https://mabubu.test${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    env,
  );
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, body: (text ? JSON.parse(text) : null) as T };
}

const device = (label: string) => ({ deviceId: uuidv7(), deviceSecret: randomToken(32), deviceLabel: label });
let clock = Date.now() - 3600_000;
function mk<T extends OpType>(type: T, payload: PayloadOf<T>, actorId: string, deviceId: string): AnyOp {
  clock += 1000;
  const r = parseOp({ id: uuidv7(clock), type, payload, actorId, deviceId, deviceTime: new Date(clock).toISOString(), tzOffsetMin: 180, createdOnline: true, v: ENGINE_VERSION });
  if (!r.ok) throw new Error(r.error);
  return r.op!;
}
const today = () => new Date().toISOString().slice(0, 10);
const count = (sql: string, ...p: string[]) => (env.DB.raw.prepare(sql).get(...p) as { n: number }).n;
const tableCounts = () =>
  Object.fromEntries(['users', 'devices', 'device_access', 'sessions', 'auth_events', 'ops', 'entities', 'balances', 'ops_trial', 'cutovers', 'meta'].map((t) => [t, count(`SELECT COUNT(*) AS n FROM ${t}`)]));

const ownerDev = device('Owner laptop');
let owner: { token: string; id: string };
let worker: { token: string; id: string; dev: ReturnType<typeof device> };
let manager: { token: string; id: string };

async function signInApproved(name: string, role: 'worker' | 'manager', pin: string) {
  const p = await call<PersonRow>('POST', '/api/admin/people', { name, role, pin, locationId: role === 'worker' ? 'loc-com' : null, grants: [], revokes: [], allowOnDeviceId: null }, owner.token);
  const dev = device(`${name} phone`);
  await call('POST', '/api/auth/login', { name, pin, ...dev });
  await call('POST', '/api/admin/access', { deviceId: dev.deviceId, userId: p.body.id, decision: 'approve' }, owner.token);
  const r = await call<LoginResponse>('POST', '/api/auth/login', { name, pin, ...dev });
  if (r.body.status !== 'ok') throw new Error('sign-in failed');
  return { token: r.body.token, id: p.body.id, dev };
}

const push = (token: string, ops: AnyOp[], ledger?: string) => call<PushResponse>('POST', '/api/sync/push', { ops, clientNow: new Date().toISOString(), ...(ledger ? { ledger } : {}) }, token);
const pull = (token: string, q = '') => call<PullResponse>('GET', `/api/sync/pull?since=0&proto=2${q}`, undefined, token);

/** Real set-up plus a month of test activity, like production before go-live. */
async function seed() {
  const d = ownerDev.deviceId;
  const o = owner.id;
  const setup = [
    mk('location.upsert', { id: 'loc-msa', name: 'Mombasa', kind: 'purchasing', currency: 'KES', active: true }, o, d),
    mk('location.upsert', { id: 'loc-com', name: 'Comoros', kind: 'selling', currency: 'KMF', active: true }, o, d),
    mk('size.upsert', { id: 'size-child', name: 'Child', sort: 1, active: true }, o, d),
    mk('vendor.upsert', { id: 'ven-hafsa', name: 'Hafsaa', phone: '', notes: '', active: true }, o, d),
    mk('garment.upsert', { id: 'gt-haf', code: 'HAF-EN80', name: 'Elastic-neck', sizeCategoryId: 'size-child', vendorId: 'ven-hafsa', description: '', swatch: '#c2410c', active: true }, o, d),
    mk('garment.upsert', { id: 'gt-haf', code: 'HAF-EN80', name: 'Elastic-neck Dera', sizeCategoryId: 'size-child', vendorId: 'ven-hafsa', description: 'renamed', swatch: '#c2410c', active: true }, o, d),
    mk('price.set', { id: 'pr-haf', garmentTypeId: 'gt-haf', locationId: 'loc-com', currency: 'KMF', retail: 1000, wholesale: 850, effectiveFrom: '2026-01-01' }, o, d),
    mk('fx.set', { id: 'fx-1', from: 'KES', to: 'KMF', rate: '3.4', date: today(), source: 'test', basis: 'manual' }, o, d),
  ];
  const trial = [
    mk('purchase.record', { id: 'pur-1', vendorId: 'ven-hafsa', locationId: 'loc-msa', date: today(), currency: 'KES', intake: 'collected', lines: [{ garmentTypeId: 'gt-haf', qty: 40, unitCost: 25_000 }], note: 'test' }, o, d),
    mk('vendor.payment', { vendorId: 'ven-hafsa', purchaseId: 'pur-1', date: today(), amount: 1_000_000, currency: 'KES', method: 'mpesa', reference: 'TEST01', note: '' }, o, d),
    mk('stock.adjust', { locationId: 'loc-com', date: today(), reason: 'found', lines: [{ garmentTypeId: 'gt-haf', delta: 30 }], note: 'opening stock (test)' }, o, d),
  ];
  const r = await push(owner.token, [...setup, ...trial]);
  expect(r.body.results.map((x) => x.status)).toEqual([...setup, ...trial].map(() => 'applied'));
  const take = mk('worker.issue', { workerId: worker.id, locationId: 'loc-com', workDate: today(), lines: [{ garmentTypeId: 'gt-haf', qty: 10 }] }, worker.id, worker.dev.deviceId);
  expect((await push(worker.token, [take])).body.results[0]!.status).toBe('applied');
  return { setup, trial: [...trial, take], take };
}

/** Every active device downloads once, reporting nothing waiting. */
async function allSynced() {
  for (const t of [owner.token, worker.token, manager.token]) expect((await pull(t, '&pending=0')).status).toBe(200);
}

async function preview() {
  const r = await call<GoLiveStatus>('GET', '/api/admin/golive', undefined, owner.token);
  expect(r.status).toBe(200);
  return r.body as GoLivePreview;
}

async function backup() {
  const r = await call('POST', '/api/admin/golive/backup', undefined, owner.token);
  expect(r.status).toBe(200);
  return { sha: r.headers.get('x-backup-sha256')!, text: r.text };
}

async function execute(over: Record<string, unknown> = {}) {
  const p = await preview();
  const b = p.backup;
  return call<GoLiveStatus & { error?: string; checks?: unknown }>(
    'POST',
    '/api/admin/golive/execute',
    { pin: OWNER_PIN, phrase: GOLIVE_PHRASE, fx: 'keep', backupSha256: b?.sha256 ?? '0'.repeat(64), fingerprint: p.fingerprint, acceptUnknownDevices: false, ...over },
    owner.token,
  );
}

beforeEach(async () => {
  env = { DB: createD1(), PIN_PEPPER: PEPPER, SETUP_TOKEN };
  const r = await call<LoginResponse>('POST', '/api/setup', { setupToken: SETUP_TOKEN, name: 'George', pin: OWNER_PIN, ...ownerDev });
  if (r.body.status !== 'ok') throw new Error('setup failed');
  owner = { token: r.body.token, id: r.body.user.id };
  await push(owner.token, [mk('location.upsert', { id: 'loc-com', name: 'Comoros', kind: 'selling', currency: 'KMF', active: true }, owner.id, ownerDev.deviceId)]);
  worker = await signInApproved('Jijo', 'worker', '4770');
  manager = await signInApproved('Said', 'manager', '472913');
});

describe('classification (pure)', () => {
  it('keeps set-up, removes activity, asks about rates; a cancellation follows its record', () => {
    const rows = [
      { id: 'a', type: 'location.upsert' },
      { id: 'b', type: 'garment.upsert' },
      { id: 'c', type: 'price.set' },
      { id: 'd', type: 'fx.set' },
      { id: 'e', type: 'purchase.record' },
      { id: 'f', type: 'op.void', targetId: 'e' },
      { id: 'g', type: 'op.void', targetId: 'missing' },
      { id: 'h', type: 'worker.settle' },
      { id: 'i', type: 'op.resolve', targetId: 'h' },
    ];
    const undecided = planCutover(rows, null);
    expect(undecided.keep).toEqual(['a', 'b', 'c']);
    expect(undecided.undecided).toEqual(['d']);
    expect(undecided.remove).toEqual(['e', 'f', 'g', 'h', 'i']);
    expect(planCutover(rows, 'keep').keep).toContain('d');
    expect(planCutover(rows, 'remove').remove).toContain('d');
  });
});

describe('go-live cutover over the network', () => {
  it('only the owner can see, back up or run it', async () => {
    for (const t of [worker.token, manager.token]) {
      expect((await call('GET', '/api/admin/golive', undefined, t)).status).toBe(403);
      expect((await call('POST', '/api/admin/golive/backup', undefined, t)).status).toBe(403);
      expect((await call('POST', '/api/admin/golive/execute', { pin: '472913', phrase: GOLIVE_PHRASE, fx: 'keep', backupSha256: '0'.repeat(64), fingerprint: { ops: 0, maxSeq: 0 }, acceptUnknownDevices: true }, t)).status).toBe(403);
    }
    expect((await call('GET', '/api/admin/golive')).status).toBe(401);
  });

  it('the preview changes nothing and lists what is kept, removed and undecided', async () => {
    await seed();
    const before = tableCounts();
    const p = await preview();
    expect(tableCounts()).toEqual(before);
    expect(p.kept.places).toEqual(['Comoros', 'Mombasa']);
    expect(p.kept.vendors).toEqual(['Hafsaa']);
    expect(p.kept.garments).toEqual(['HAF-EN80 · Elastic-neck Dera']);
    expect(p.kept.prices).toBe(1);
    expect(p.rates).toEqual(['KES → KMF']);
    expect(p.byType.find((x) => x.type === 'purchase.record')).toMatchObject({ category: 'remove', count: 1 });
    expect(p.byType.find((x) => x.type === 'fx.set')).toMatchObject({ category: 'decide', count: 1 });
    expect(p.byType.find((x) => x.type === 'garment.upsert')).toMatchObject({ category: 'keep', count: 2 });
    expect(p.checks.find((c) => c.key === 'backup')!.status).toBe('block');
    expect(p.checks.find((c) => c.key === 'rebuild')!.status).toBe('ok');
  });

  it('the backup is complete, carries no secrets, and its hash matches', async () => {
    await seed();
    const b = await backup();
    expect(await sha256Hex(b.text)).toBe(b.sha);
    const parsed = JSON.parse(b.text) as { ops: unknown[]; users: Record<string, unknown>[]; devices: Record<string, unknown>[] };
    expect(parsed.ops.length).toBe(count('SELECT COUNT(*) AS n FROM ops'));
    expect(b.text).not.toMatch(/pin_hmac|secret_hash|token_hash/);
    expect(Object.keys(parsed.users[0]!)).not.toContain('pin_hmac');
    expect((await preview()).backup?.sha256).toBe(b.sha);
    expect(count("SELECT COUNT(*) AS n FROM auth_events WHERE kind = 'cutover_backup'")).toBe(1);
  });

  it('refuses without a backup, with the wrong phrase or code, and changes nothing', async () => {
    await seed();
    await allSynced();
    const before = tableCounts();
    expect((await execute()).body.error).toBe('backup_mismatch');
    await backup();
    const afterBackup = tableCounts();
    expect((await execute({ phrase: 'go live please' })).status).toBe(400);
    const wrong = await execute({ pin: '111111' });
    expect(wrong.status).toBe(401);
    expect(count('SELECT failed_count AS n FROM users WHERE id = ?', owner.id)).toBe(1);
    expect({ ...tableCounts(), auth_events: 0 }).toEqual({ ...afterBackup, auth_events: 0 });
    expect(before.ops).toBe(afterBackup.ops);
  });

  it('records added after the backup block it until a new backup is made', async () => {
    await seed();
    await allSynced();
    await backup();
    const late = mk('stock.adjust', { locationId: 'loc-com', date: today(), reason: 'found', lines: [{ garmentTypeId: 'gt-haf', delta: 1 }], note: '' }, owner.id, ownerDev.deviceId);
    await push(owner.token, [late]);
    const r = await execute();
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('not_ready');
    expect(count('SELECT COUNT(*) AS n FROM cutovers')).toBe(0);
  });

  it('a device with records still waiting to send blocks go-live; unknown devices need confirming', async () => {
    await seed();
    await backup();
    // Only the owner and worker have reported; the worker still holds 2 unsent records.
    await pull(owner.token, '&pending=0');
    await pull(worker.token, '&pending=2');
    let r = await execute({ acceptUnknownDevices: true });
    expect(r.body.error).toBe('not_ready');
    const p = await preview();
    expect(p.devices.find((x) => x.people.includes('Jijo'))?.state).toBe('unsent');
    expect(p.devices.find((x) => x.people.includes('Said'))?.state).toBe('unknown');
    await pull(worker.token, '&pending=0');
    r = await execute({ acceptUnknownDevices: false });
    expect(r.body.error).toBe('confirm_devices');
    expect(count('SELECT COUNT(*) AS n FROM cutovers')).toBe(0);
  });

  it('runs once: keeps the set-up, clears the test activity, keeps people and the log, and records itself', async () => {
    const { setup, trial } = await seed();
    await allSynced();
    const b = await backup();
    const refKeys = env.DB.raw.prepare("SELECT key, data FROM entities WHERE kind IN ('loc','size','vendor','gt','price','fx') ORDER BY key").all();
    const people = env.DB.raw.prepare('SELECT * FROM users ORDER BY id').all();
    const devices = env.DB.raw.prepare('SELECT * FROM devices ORDER BY id').all();
    const before = tableCounts();

    const r = await execute();
    expect(r.status).toBe(200);
    expect(r.body.phase).toBe('live');

    // Set-up kept exactly (same data), test activity gone from the ledger and the stock.
    expect(env.DB.raw.prepare("SELECT key, data FROM entities WHERE kind IN ('loc','size','vendor','gt','price','fx') ORDER BY key").all()).toEqual(refKeys);
    expect(count("SELECT COUNT(*) AS n FROM entities WHERE kind IN ('purchase','shipment','day','split')")).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM balances')).toBe(0);
    const keptIds = (env.DB.raw.prepare('SELECT id FROM ops ORDER BY seq').all() as { id: string }[]).map((x) => x.id);
    // The first Comoros upsert from beforeEach is set-up too.
    expect(keptIds.slice(1)).toEqual(setup.map((o) => o.id));
    // Test records are moved aside, not destroyed.
    expect(count('SELECT COUNT(*) AS n FROM ops_trial')).toBe(trial.length);
    expect(count('SELECT COUNT(*) AS n FROM ops') + count('SELECT COUNT(*) AS n FROM ops_trial')).toBe(before.ops);
    // People, devices and sessions untouched; the log grows by the cutover entry only.
    expect(env.DB.raw.prepare('SELECT * FROM users ORDER BY id').all()).toEqual(people);
    expect(env.DB.raw.prepare('SELECT * FROM devices ORDER BY id').all()).toEqual(devices);
    expect(count('SELECT COUNT(*) AS n FROM sessions')).toBe(before.sessions);
    expect(count('SELECT COUNT(*) AS n FROM auth_events')).toBe(before.auth_events! + 1);
    const rec = env.DB.raw.prepare('SELECT * FROM cutovers').get() as Record<string, string>;
    expect(rec.actor_id).toBe(owner.id);
    expect(rec.backup_sha256).toBe(b.sha);

    // Never again: not by the button, not by a direct call.
    expect((await execute()).status).toBe(410);
    expect((await call('POST', '/api/admin/golive/backup', undefined, owner.token)).status).toBe(410);
    const status = await call<GoLiveStatus>('GET', '/api/admin/golive', undefined, owner.token);
    expect(status.body).toMatchObject({ phase: 'live', cutover: { actorName: 'George', backupSha256: b.sha } });
  });

  it('removing the recorded rates is the owner’s choice', async () => {
    await seed();
    await allSynced();
    await backup();
    expect((await execute({ fx: 'remove' })).status).toBe(200);
    expect(count("SELECT COUNT(*) AS n FROM ops WHERE type = 'fx.set'")).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM entities WHERE kind = 'fx'")).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM ops WHERE type = 'garment.upsert'")).toBe(2);
  });

  it('a failure in the middle changes nothing (one transaction), and a retry then succeeds', async () => {
    await seed();
    await allSynced();
    await backup();
    const before = tableCounts();
    const realBatch = env.DB.batch.bind(env.DB);
    let sabotage = true;
    env.DB.batch = (async (stmts: Parameters<typeof realBatch>[0]) => {
      // The cutover batch is the only one that deletes from entities.
      if (sabotage && stmts.some((s) => (s as unknown as { sql: string }).sql === 'DELETE FROM entities')) {
        sabotage = false;
        return realBatch([...stmts, env.DB.prepare('INSERT INTO guard (v) VALUES (1)')]);
      }
      return realBatch(stmts);
    }) as typeof env.DB.batch;
    const failed = await execute();
    expect(failed.status).toBe(409);
    expect({ ...tableCounts(), auth_events: 0 }).toEqual({ ...before, auth_events: 0 });
    expect(count("SELECT COUNT(*) AS n FROM meta WHERE k = 'phase'")).toBe(0);
    expect((await execute()).status).toBe(200);
  });

  it('afterwards, an app holding the old ledger is refused, and old test records can never come back', async () => {
    const { take } = await seed();
    await allSynced();
    await backup();
    const done = await execute();
    expect(done.status).toBe(200);
    const ledger = (done.body as { cutover: { ledger: string } }).cutover.ledger;
    expect(ledger).not.toBe(INITIAL_LEDGER);

    // An app that predates the ledger id, or holds the old one: refused both ways, nothing stored.
    const opsBefore = count('SELECT COUNT(*) AS n FROM ops');
    const fresh = mk('worker.return', { workerId: worker.id, locationId: 'loc-com', workDate: today(), lines: [{ garmentTypeId: 'gt-haf', qty: 1 }] }, worker.id, worker.dev.deviceId);
    for (const l of [undefined, INITIAL_LEDGER]) {
      const p = await push(worker.token, [fresh], l);
      expect(p.status).toBe(409);
      expect((p.body as unknown as { error: string; ledger: string }).ledger).toBe(ledger);
    }
    expect((await pull(worker.token)).status).toBe(409);
    expect((await pull(worker.token, `&ledger=${INITIAL_LEDGER}`)).status).toBe(409);
    expect(count('SELECT COUNT(*) AS n FROM ops')).toBe(opsBefore);

    // With the new ledger: downloads only the kept set-up; an archived test record is refused even if re-sent.
    const pulled = await pull(worker.token, `&ledger=${ledger}`);
    expect(pulled.status).toBe(200);
    expect(pulled.body.ops.some((o) => o.id === take.id)).toBe(false);
    const again = await push(worker.token, [take], ledger);
    expect(again.body.results[0]).toMatchObject({ status: 'rejected', error: 'This record is from the testing period and was not added.' });
    expect(count('SELECT COUNT(*) AS n FROM ops WHERE id = ?', take.id)).toBe(0);
    // Real records after go-live work normally.
    const real = mk('stock.adjust', { locationId: 'loc-com', date: today(), reason: 'count_correction', lines: [{ garmentTypeId: 'gt-haf', delta: 12 }], note: 'opening count' }, owner.id, ownerDev.deviceId);
    expect((await push(owner.token, [real], ledger)).body.results[0]!.status).toBe('applied');
  });
});
