// Go-live cutover (ADR-005, docs/GO_LIVE_CUTOVER.md): the owner's one-time move
// from the testing period to real business records.
//
// Owner only, checked here on every call. Runs only while the server's phase
// is 'pre_release'; the cutover itself sets 'live', after which every endpoint
// here refuses (410) — no browser setting or direct call can run it again.
//
// What it does, in ONE D1 batch (a transaction: all or nothing):
//   1. aborts if any record arrived since the preview (count + highest seq),
//      or if another cutover already finished;
//   2. writes the protected cutover record (who, when, backup, scope, result);
//   3. moves the test records to `ops_trial` (kept, never downloaded) and
//      removes them from the ledger;
//   4. replaces the derived state (entities, stock balances) with the result
//      of replaying the kept records through the engine — checked before the
//      batch: every kept record must still apply;
//   5. starts a new ledger id, so an app still holding test records (or with
//      records waiting to send from before go-live) is refused and refreshes
//      instead of sending them in;
//   6. logs `cutover_completed`.
// People, devices, sessions and the sign-in log are not touched.

import { z } from 'zod';
import { Ledger } from '../shared/ledger';
import { entityKind, splitBalanceKey, type UserRef } from '../shared/model';
import { uuidv7 } from '../shared/ids';
import {
  BACKUP_MAX_AGE_MS,
  DEVICE_STALE_MS,
  GOLIVE_PHRASE,
  INITIAL_LEDGER,
  planCutover,
  type BackupInfo,
  type CutoverRecord,
  type DeviceReadiness,
  type GoLivePreview,
  type GoLiveStatus,
  type ReadinessCheck,
} from '../shared/golive';
import type { AnyOp } from '../shared/ops';
import { checkPin, eventStmt, requireIpAllowed, requirePepper, type Session, type UserRow } from './auth';
import { sha256Hex } from './crypto';
import type { Env } from './env';
import { HttpError, clientIp, json, nowIso, readJson } from './http';

/* ------------------------------------------------------------------ */
/* Ledger id and phase (also used by sync)                             */
/* ------------------------------------------------------------------ */

export function ledgerStmt(env: Env) {
  return env.DB.prepare("SELECT v FROM meta WHERE k = 'ledger'");
}

export function ledgerFrom(row: { v: string } | undefined | null): string {
  return row?.v ?? INITIAL_LEDGER;
}

export async function currentLedger(env: Env): Promise<string> {
  return ledgerFrom(await ledgerStmt(env).first<{ v: string }>());
}

/** Thrown to an app whose copy belongs to an earlier ledger: it keeps its unsent records aside and downloads again. */
export function ledgerMismatch(current: string): HttpError {
  return new HttpError(409, 'ledger_reset', 'Mabubu has started its real business records. This device’s copy is being refreshed.', { ledger: current });
}

/* ------------------------------------------------------------------ */
/* Loading everything the preview and the cutover need                 */
/* ------------------------------------------------------------------ */

interface OpRow {
  seq: number;
  id: string;
  type: string;
  payload: string;
  actor_id: string;
  device_id: string;
  device_time: string;
  tz_offset_min: number;
  created_online: number;
  v: number;
  status: 'applied' | 'rejected';
  review: string | null;
}

interface Loaded {
  meta: Map<string, string>;
  ops: OpRow[];
  users: Pick<UserRow, 'id' | 'name' | 'role' | 'active' | 'location_id'>[];
  entities: { key: string; kind: string; data: string; ver: number }[];
  devices: { id: string; code: string; label: string; revoked_at: string | null; retired_at: string | null }[];
  access: { device_id: string; user_id: string; status: string }[];
  syncs: { device_id: string; user_id: string; synced_at: string; pending: number; ledger: string }[];
}

async function load(env: Env): Promise<Loaded> {
  const [meta, ops, users, entities, devices, access, syncs] = await env.DB.batch([
    env.DB.prepare('SELECT k, v FROM meta'),
    env.DB.prepare('SELECT seq, id, type, payload, actor_id, device_id, device_time, tz_offset_min, created_online, v, status, review FROM ops ORDER BY seq'),
    env.DB.prepare('SELECT id, name, role, active, location_id FROM users ORDER BY created_at'),
    env.DB.prepare('SELECT key, kind, data, ver FROM entities'),
    env.DB.prepare('SELECT id, code, label, revoked_at, retired_at FROM devices'),
    env.DB.prepare('SELECT device_id, user_id, status FROM device_access'),
    env.DB.prepare('SELECT device_id, user_id, synced_at, pending, ledger FROM device_sync'),
  ]);
  return {
    meta: new Map((meta!.results as { k: string; v: string }[]).map((r) => [r.k, r.v])),
    ops: ops!.results as unknown as OpRow[],
    users: users!.results as unknown as Loaded['users'],
    entities: entities!.results as unknown as Loaded['entities'],
    devices: devices!.results as unknown as Loaded['devices'],
    access: access!.results as unknown as Loaded['access'],
    syncs: syncs!.results as unknown as Loaded['syncs'],
  };
}

function requireOwner(session: Session) {
  if (session.user.role !== 'owner' || !session.user.caps.includes('users.manage')) throw new HttpError(403, 'forbidden', 'Only the owner can do this.');
}

function fingerprint(d: Loaded) {
  return { ops: d.ops.length, maxSeq: d.ops.reduce((m, o) => Math.max(m, o.seq), 0) };
}

function planRows(d: Loaded) {
  return d.ops.map((o) => {
    let targetId: string | null = null;
    if (o.type === 'op.void' || o.type === 'op.resolve') targetId = (JSON.parse(o.payload) as { targetId?: string }).targetId ?? null;
    return { id: o.id, type: o.type, targetId };
  });
}

function rowToOp(o: OpRow): AnyOp {
  return {
    id: o.id,
    type: o.type,
    payload: JSON.parse(o.payload),
    actorId: o.actor_id,
    deviceId: o.device_id,
    deviceTime: o.device_time,
    tzOffsetMin: o.tz_offset_min,
    createdOnline: Boolean(o.created_online),
    v: o.v,
  } as AnyOp;
}

/** Replay the kept records through the engine: the state the business starts from. */
function replay(d: Loaded, keepIds: Set<string>): { ok: true; ledger: Ledger } | { ok: false; error: string } {
  const L = new Ledger();
  L.setUsers(d.users.map((u): UserRef => ({ id: u.id, name: u.name, role: u.role, active: Boolean(u.active), locationId: u.location_id })));
  for (const o of d.ops) {
    if (!keepIds.has(o.id)) continue;
    const op = rowToOp(o);
    if (o.status !== 'applied') {
      L.recordRejected(op);
      continue;
    }
    const r = L.apply(op, null);
    if (!r.ok) return { ok: false, error: `${o.type} ${o.id}: ${r.error}` };
  }
  return { ok: true, ledger: L };
}

function backupInfo(d: Loaded): BackupInfo | null {
  const raw = d.meta.get('golive_backup');
  if (!raw) return null;
  const b = JSON.parse(raw) as BackupInfo;
  return { sha256: b.sha256, at: b.at, ops: b.ops, maxSeq: b.maxSeq };
}

function readiness(d: Loaded, now: number): { devices: DeviceReadiness[]; checks: ReadinessCheck[]; replayError: string | null } {
  const ledger = ledgerFrom(d.meta.has('ledger') ? { v: d.meta.get('ledger')! } : null);
  const activeUsers = new Map(d.users.filter((u) => u.active).map((u) => [u.id, u.name]));
  const devices: DeviceReadiness[] = [];
  for (const dev of d.devices) {
    if (dev.revoked_at || dev.retired_at) continue;
    const people = d.access.filter((a) => a.device_id === dev.id && a.status === 'approved' && activeUsers.has(a.user_id)).map((a) => activeUsers.get(a.user_id)!);
    if (!people.length) continue;
    const reports = d.syncs.filter((s) => s.device_id === dev.id && s.ledger === ledger);
    const lastSyncAt = reports.reduce<string | null>((m, s) => (!m || s.synced_at > m ? s.synced_at : m), null);
    const pending = reports.length ? reports.reduce((n, s) => n + s.pending, 0) : null;
    const state: DeviceReadiness['state'] = pending && pending > 0 ? 'unsent' : !lastSyncAt || now - Date.parse(lastSyncAt) > DEVICE_STALE_MS ? 'unknown' : 'ok';
    devices.push({ code: dev.code, label: dev.label, people, lastSyncAt, pending, state });
  }
  const fp = fingerprint(d);
  const b = backupInfo(d);
  const checks: ReadinessCheck[] = [];
  if (!b) checks.push({ key: 'backup', status: 'block', detail: 'No pre-cutover backup has been made.' });
  else if (b.ops !== fp.ops || b.maxSeq !== fp.maxSeq) checks.push({ key: 'backup', status: 'block', detail: 'Records changed after the backup. Make the backup again.' });
  else if (now - Date.parse(b.at) > BACKUP_MAX_AGE_MS) checks.push({ key: 'backup', status: 'block', detail: 'The backup is more than 6 hours old. Make it again.' });
  else checks.push({ key: 'backup', status: 'ok', detail: 'Backup made and matches the records now on the server.' });
  const unsent = devices.filter((x) => x.state === 'unsent');
  checks.push(
    unsent.length
      ? { key: 'unsent', status: 'block', detail: `${unsent.length} device(s) still have records waiting to send.`, n: unsent.length }
      : { key: 'unsent', status: 'ok', detail: 'No device reports records waiting to send.', n: 0 },
  );
  const unknown = devices.filter((x) => x.state === 'unknown');
  checks.push(
    unknown.length
      ? { key: 'unknown_devices', status: 'warn', detail: `${unknown.length} device(s) have not connected in the last 24 hours.`, n: unknown.length }
      : { key: 'unknown_devices', status: 'ok', detail: 'Every active device connected in the last 24 hours.', n: 0 },
  );
  const plan = planCutover(planRows(d), 'keep');
  const r = replay(d, new Set(plan.keep));
  checks.push(r.ok ? { key: 'rebuild', status: 'ok', detail: 'The kept set-up replays cleanly.' } : { key: 'rebuild', status: 'block', detail: `The kept set-up does not replay: ${r.error}` });
  const waiting = d.access.filter((a) => a.status === 'pending').length;
  checks.push(
    waiting
      ? { key: 'approvals', status: 'warn', detail: `${waiting} device request(s) are waiting for approval; they are not changed.`, n: waiting }
      : { key: 'approvals', status: 'ok', detail: 'No device requests waiting.', n: 0 },
  );
  return { devices, checks, replayError: r.ok ? null : r.error };
}

function names(d: Loaded, kind: string, label: (x: Record<string, unknown>) => string): string[] {
  return d.entities
    .filter((e) => e.kind === kind)
    .map((e) => label(JSON.parse(e.data) as Record<string, unknown>))
    .sort((a, b) => a.localeCompare(b));
}

function preview(d: Loaded, now: number): GoLivePreview {
  const r = readiness(d, now);
  return {
    phase: 'pre_release',
    fingerprint: fingerprint(d),
    byType: planCutover(planRows(d), null).byType,
    kept: {
      places: names(d, 'loc', (x) => String(x.name)),
      sizes: names(d, 'size', (x) => String(x.name)),
      vendors: names(d, 'vendor', (x) => String(x.name)),
      garments: names(d, 'gt', (x) => `${String(x.code)} · ${String(x.name)}`),
      prices: d.entities.filter((e) => e.kind === 'price').length,
      settings: d.entities.some((e) => e.kind === 'settings'),
    },
    rates: names(d, 'fx', (x) => `${String(x.from)} → ${String(x.to)}`),
    people: d.users.map((u) => ({ name: u.name, role: u.role, active: Boolean(u.active) })),
    devices: r.devices,
    checks: r.checks,
    backup: backupInfo(d),
  };
}

async function completedRecord(env: Env): Promise<CutoverRecord | null> {
  const row = await env.DB.prepare('SELECT c.*, u.name AS actor_name FROM cutovers c LEFT JOIN users u ON u.id = c.actor_id ORDER BY c.at DESC LIMIT 1').first<{
    id: string;
    at: string;
    actor_name: string | null;
    ledger: string;
    backup_sha256: string;
    backup_at: string;
    scope: string;
    result: string;
  }>();
  if (!row) return null;
  return {
    id: row.id,
    at: row.at,
    actorName: row.actor_name ?? '',
    ledger: row.ledger,
    backupSha256: row.backup_sha256,
    backupAt: row.backup_at,
    scope: JSON.parse(row.scope) as CutoverRecord['scope'],
    result: JSON.parse(row.result) as CutoverRecord['result'],
  };
}

async function refuseWhenLive(env: Env, d?: Loaded) {
  const phase = d ? d.meta.get('phase') : (await env.DB.prepare("SELECT v FROM meta WHERE k = 'phase'").first<{ v: string }>())?.v;
  if (phase === 'live') throw new HttpError(410, 'golive_done', 'The go-live cutover has already been done. It cannot be run again.');
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

/** GET /api/admin/golive — the preview (nothing changes), or the record once done. */
export async function goLiveStatus(env: Env, session: Session): Promise<Response> {
  requireOwner(session);
  const d = await load(env);
  if (d.meta.get('phase') === 'live') return json({ phase: 'live', cutover: await completedRecord(env) } satisfies GoLiveStatus);
  return json(preview(d, Date.now()) satisfies GoLiveStatus);
}

/**
 * POST /api/admin/golive/backup — a full copy of the business database as it
 * is now (no codes, device secrets or session tokens), with its SHA-256. The
 * app checks the hash and that the file reads back before saving it; the
 * cutover only runs against a backup that matches the records at that moment.
 */
export async function goLiveBackup(env: Env, session: Session): Promise<Response> {
  requireOwner(session);
  await refuseWhenLive(env);
  const [meta, ops, users, entities, balances, devices, access, opsTrial] = await env.DB.batch([
    env.DB.prepare('SELECT k, v FROM meta'),
    env.DB.prepare('SELECT * FROM ops ORDER BY seq'),
    env.DB.prepare('SELECT id, name, role, grants, revokes, location_id, active, created_at, updated_at FROM users ORDER BY created_at'),
    env.DB.prepare('SELECT * FROM entities ORDER BY key'),
    env.DB.prepare('SELECT * FROM balances ORDER BY acct, gt'),
    env.DB.prepare('SELECT id, code, label, user_agent, created_at, last_seen_at, revoked_at, retired_at FROM devices ORDER BY created_at'),
    env.DB.prepare('SELECT device_id, user_id, status, requested_at, decided_at, decided_by FROM device_access'),
    env.DB.prepare('SELECT COUNT(*) AS n FROM ops_trial'),
  ]);
  const opRows = ops!.results as { seq: number }[];
  const at = nowIso();
  const fp = { ops: opRows.length, maxSeq: opRows.reduce((m, o) => Math.max(m, o.seq), 0) };
  const text = JSON.stringify({
    format: 'mabubu-golive-backup',
    version: 1,
    exportedAt: at,
    fingerprint: fp,
    note: 'Pre-cutover copy of the Mabubu database. No access codes, device secrets or session tokens.',
    ops: ops!.results,
    users: users!.results,
    entities: entities!.results,
    balances: balances!.results,
    devices: devices!.results,
    deviceAccess: access!.results,
    meta: meta!.results,
    opsTrialCount: (opsTrial!.results[0] as { n: number }).n,
  });
  const sha256 = await sha256Hex(text);
  const info: BackupInfo & { actorId: string } = { sha256, at, ops: fp.ops, maxSeq: fp.maxSeq, actorId: session.user.id };
  await env.DB.batch([
    env.DB.prepare("INSERT INTO meta (k, v) VALUES ('golive_backup', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(info)),
    eventStmt(env, 'cutover_backup', { actorId: session.user.id, deviceId: session.deviceId, detail: { sha256, ops: fp.ops, maxSeq: fp.maxSeq } }),
  ]);
  return new Response(text, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-backup-sha256': sha256,
      'content-disposition': `attachment; filename="mabubu-golive-backup-${at.slice(0, 10)}.json"`,
    },
  });
}

const executeSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
  phrase: z.string().max(40),
  fx: z.enum(['keep', 'remove']),
  backupSha256: z.string().regex(/^[0-9a-f]{64}$/),
  fingerprint: z.object({ ops: z.number().int().min(0), maxSeq: z.number().int().min(0) }),
  acceptUnknownDevices: z.boolean(),
});

/** POST /api/admin/golive/execute — the cutover itself. */
export async function goLiveExecute(env: Env, session: Session, request: Request): Promise<Response> {
  requireOwner(session);
  requirePepper(env);
  await refuseWhenLive(env);
  const parsed = executeSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'invalid_request', 'Invalid request.');
  const b = parsed.data;
  if (b.phrase.trim() !== GOLIVE_PHRASE) throw new HttpError(400, 'phrase', `Type ${GOLIVE_PHRASE} exactly to confirm.`);

  // The owner's code again, with the same lockout as sign-in.
  const ip = clientIp(request);
  await requireIpAllowed(env, ip);
  const me = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user.id).first<UserRow>();
  if (!me) throw new HttpError(403, 'forbidden', 'Only the owner can do this.');
  await checkPin(env, me, b.pin, ip, session.deviceId);

  const d = await load(env);
  await refuseWhenLive(env, d);
  const now = Date.now();
  const fp = fingerprint(d);
  if (fp.ops !== b.fingerprint.ops || fp.maxSeq !== b.fingerprint.maxSeq) {
    throw new HttpError(409, 'changed', 'Records changed since the preview. Look at the preview again and make a new backup.');
  }
  const backup = backupInfo(d);
  if (!backup || backup.sha256 !== b.backupSha256) throw new HttpError(409, 'backup_mismatch', 'This is not the latest verified backup. Make the backup again.');
  const r = readiness(d, now);
  const blocking = r.checks.filter((c) => c.status === 'block');
  if (blocking.length) throw new HttpError(409, 'not_ready', 'The readiness checks are not all clear.', { checks: r.checks });
  if (r.devices.some((x) => x.state === 'unknown') && !b.acceptUnknownDevices) {
    throw new HttpError(409, 'confirm_devices', 'Some devices have not connected recently. Confirm that you accept this.', { checks: r.checks });
  }

  const plan = planCutover(planRows(d), b.fx);
  if (plan.undecided.length) throw new HttpError(409, 'undecided', 'Decide what happens to the recorded exchange rates.');
  const result = replay(d, new Set(plan.keep));
  if (!result.ok) throw new HttpError(409, 'rebuild_failed', `The kept set-up does not replay: ${result.error}`);
  const L = result.ledger;

  const oldVer = new Map(d.entities.map((e) => [e.key, e.ver]));
  const entityRows = [...L.entities]
    .filter(([k]) => !k.startsWith('user:'))
    .map(([k, data]) => ({ k, kind: entityKind(k), data: JSON.stringify(data), ver: (oldVer.get(k) ?? 0) + 1 }));
  const balanceRows = [...L.balances].filter(([, q]) => q !== 0).map(([key, qty]) => [...splitBalanceKey(key), qty]);

  const id = uuidv7();
  const ledger = uuidv7();
  const at = new Date(now).toISOString();
  const scope: CutoverRecord['scope'] = { fx: b.fx, kept: plan.keep.length, removed: plan.remove.length, byType: plan.byType };
  const outcome: CutoverRecord['result'] = { opsAfter: plan.keep.length, entitiesAfter: entityRows.length, balancesAfter: balanceRows.length, archived: plan.remove.length };
  const removeJson = JSON.stringify(plan.remove);
  const COLS = 'seq, id, type, payload, actor_id, actor_name, device_id, device_time, tz_offset_min, created_online, v, server_time, clock_skew_ms, status, error, flags, vis, subject_id, voided_by, review, resolved_by';

  const stmts = [
    // Nothing arrived since the checks above, and no other cutover finished meanwhile.
    env.DB.prepare('INSERT INTO guard (v) SELECT 1 WHERE (SELECT COUNT(*) FROM ops) <> ?1 OR (SELECT COALESCE(MAX(seq), 0) FROM ops) <> ?2').bind(fp.ops, fp.maxSeq),
    env.DB.prepare("INSERT INTO guard (v) SELECT 1 WHERE EXISTS (SELECT 1 FROM meta WHERE k = 'phase' AND v = 'live')"),
    env.DB.prepare('INSERT INTO cutovers (id, at, actor_id, device_id, ledger, backup_sha256, backup_at, scope, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
      id,
      at,
      session.user.id,
      session.deviceId,
      ledger,
      backup.sha256,
      backup.at,
      JSON.stringify(scope),
      JSON.stringify(outcome),
    ),
    env.DB.prepare(`INSERT INTO ops_trial (${COLS}, cutover_id) SELECT ${COLS}, ?2 FROM ops WHERE id IN (SELECT value FROM json_each(?1))`).bind(removeJson, id),
    env.DB.prepare('DELETE FROM ops WHERE id IN (SELECT value FROM json_each(?))').bind(removeJson),
    env.DB.prepare('DELETE FROM entities'),
    env.DB.prepare('DELETE FROM balances'),
  ];
  if (entityRows.length) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO entities (key, kind, data, ver, updated_at)
         SELECT json_extract(value, '$.k'), json_extract(value, '$.kind'), json_extract(value, '$.data'), json_extract(value, '$.ver'), ?2 FROM json_each(?1)`,
      ).bind(JSON.stringify(entityRows), at),
    );
  }
  if (balanceRows.length) {
    stmts.push(
      env.DB.prepare(`INSERT INTO balances (acct, gt, qty) SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]') FROM json_each(?)`).bind(
        JSON.stringify(balanceRows),
      ),
    );
  }
  stmts.push(
    env.DB.prepare("INSERT INTO meta (k, v) VALUES ('ledger', ?1), ('phase', 'live') ON CONFLICT (k) DO UPDATE SET v = excluded.v").bind(ledger),
    eventStmt(env, 'cutover_completed', { actorId: session.user.id, deviceId: session.deviceId, ip, detail: { cutoverId: id, backupSha256: backup.sha256, fx: b.fx, kept: plan.keep.length, removed: plan.remove.length } }),
  );

  try {
    await env.DB.batch(stmts);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (!/CHECK constraint failed/i.test(msg)) throw e;
    await refuseWhenLive(env);
    throw new HttpError(409, 'changed', 'Records changed since the preview. Look at the preview again and make a new backup.');
  }
  return json({ phase: 'live', cutover: await completedRecord(env) } satisfies GoLiveStatus);
}
