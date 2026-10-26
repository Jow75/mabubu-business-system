// Owner tools: people, access codes, device approvals, sign-in activity and
// a full backup export. Every endpoint re-checks the caller's capabilities.

import { z } from 'zod';
import { normalizeName, type AuthEventRow, type DeviceRow, type PeopleResponse, type PersonRow } from '../shared/api';
import { uuidv7 } from '../shared/ids';
import { CAPABILITIES, ROLES, effectiveCapabilities, pinPolicyError, type Capability, type Role } from '../shared/permissions';
import { eventStmt, requirePepper, temporaryLive, type Session, type UserRow } from './auth';
import { pinHash } from './crypto';
import type { D1PreparedStatement, Env } from './env';
import { HttpError, json, nowIso, readJson } from './http';

export function requireCap(session: Session, cap: Capability) {
  if (!session.user.caps.includes(cap)) throw new HttpError(403, 'forbidden', 'You do not have permission for this.');
}

/**
 * The owner's temporary sign-in (ADR-006, amended 26 Oct) may look at People &
 * devices and end temporary sign-ins: both only protect the account. Changing
 * anything there — approving a device, adding a person, a new code, blocking —
 * still needs users.manage, which a temporary sign-in never carries, so a code
 * seen over the owner's shoulder can never become a permanent device.
 */
function requireOwnerView(session: Session) {
  if (session.temporary && session.user.role === 'owner') return;
  requireCap(session, 'users.manage');
}

const capList = z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length);
const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.enum(ROLES),
  pin: z.string().regex(/^\d{4,8}$/, 'The code must be 4–8 digits.'),
  locationId: z.string().max(64).nullable(),
  grants: capList,
  revokes: capList,
  allowOnDeviceId: z.string().max(64).nullable(),
});
const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  locationId: z.string().max(64).nullable().optional(),
  grants: capList.optional(),
  revokes: capList.optional(),
});

function toPerson(u: UserRow): PersonRow {
  const grants = JSON.parse(u.grants) as string[];
  const revokes = JSON.parse(u.revokes) as string[];
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    active: Boolean(u.active),
    locationId: u.location_id,
    grants,
    revokes,
    caps: effectiveCapabilities(u.role, grants, revokes),
    failedCount: u.failed_count,
    lockedUntil: u.locked_until,
    hardLocked: Boolean(u.hard_locked),
    pinSetAt: u.pin_set_at,
    createdAt: u.created_at,
  };
}

async function locationExists(env: Env, id: string | null | undefined): Promise<boolean> {
  if (!id) return true;
  return Boolean(await env.DB.prepare('SELECT 1 AS x FROM entities WHERE key = ?').bind(`loc:${id}`).first());
}

/** A person still in People & devices: one removed at go live (testing period) cannot be changed from here. */
async function getUser(env: Env, id: string): Promise<UserRow> {
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ? AND removed_at IS NULL').bind(id).first<UserRow>();
  if (!u) throw new HttpError(404, 'not_found', 'Person not found.');
  return u;
}

async function deviceExists(env: Env, id: string): Promise<boolean> {
  return Boolean(await env.DB.prepare('SELECT 1 AS x FROM devices WHERE id = ? AND removed_at IS NULL').bind(id).first());
}

export async function listPeople(env: Env, session: Session): Promise<Response> {
  requireOwnerView(session);
  // People and devices removed at go live (testing period) are not listed, only counted.
  const [users, devices, access, temps, removed] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM users WHERE removed_at IS NULL ORDER BY active DESC, name'),
    env.DB.prepare('SELECT id, code, label, user_agent, created_at, last_seen_at, revoked_at, retired_at FROM devices WHERE removed_at IS NULL ORDER BY created_at DESC'),
    env.DB.prepare(
      'SELECT a.device_id, a.user_id, a.status, a.requested_at, a.decided_at FROM device_access a JOIN devices d ON d.id = a.device_id WHERE d.removed_at IS NULL ORDER BY a.requested_at DESC',
    ),
    env.DB.prepare(
      'SELECT s.user_id, s.device_id, s.created_at, s.last_used_at, s.expires_at, s.revoked_at FROM sessions s JOIN devices d ON d.id = s.device_id WHERE s.temporary = 1 AND d.removed_at IS NULL ORDER BY s.created_at DESC LIMIT 30',
    ),
    env.DB.prepare('SELECT (SELECT COUNT(*) FROM users WHERE removed_at IS NOT NULL) AS people, (SELECT COUNT(*) FROM devices WHERE removed_at IS NOT NULL) AS devices'),
  ]);
  const now = Date.now();
  const byDevice = new Map<string, DeviceRow['access']>();
  for (const a of access!.results as { device_id: string; user_id: string; status: DeviceRow['access'][number]['status']; requested_at: string; decided_at: string | null }[]) {
    const list = byDevice.get(a.device_id) ?? [];
    list.push({ userId: a.user_id, status: a.status, requestedAt: a.requested_at, decidedAt: a.decided_at });
    byDevice.set(a.device_id, list);
  }
  const res: PeopleResponse = {
    people: (users!.results as unknown as UserRow[]).map(toPerson),
    devices: (devices!.results as { id: string; code: string; label: string; user_agent: string; created_at: string; last_seen_at: string | null; revoked_at: string | null; retired_at: string | null }[]).map((d) => ({
      id: d.id,
      code: d.code,
      label: d.label,
      userAgent: d.user_agent,
      createdAt: d.created_at,
      lastSeenAt: d.last_seen_at,
      revokedAt: d.revoked_at,
      retiredAt: d.retired_at,
      access: byDevice.get(d.id) ?? [],
    })),
    temporary: (temps!.results as { user_id: string; device_id: string; created_at: string; last_used_at: string; expires_at: string; revoked_at: string | null }[]).map((s) => ({
      deviceId: s.device_id,
      userId: s.user_id,
      createdAt: s.created_at,
      lastUsedAt: s.last_used_at,
      expiresAt: s.expires_at,
      endedAt: s.revoked_at,
      live: temporaryLive(s, now),
    })),
    removed: removed!.results[0] as { people: number; devices: number },
  };
  return json(res);
}

const endTemporarySchema = z.object({ deviceId: z.string().max(64), userId: z.string().max(64) });

/** End a temporary sign-in (ADR-006): for a computer left signed in. From the owner's own device or from another temporary sign-in. */
export async function endTemporary(env: Env, session: Session, request: Request): Promise<Response> {
  requireOwnerView(session);
  const parsed = endTemporarySchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'invalid_request', 'Invalid request.');
  const { deviceId, userId } = parsed.data;
  await env.DB.batch([
    env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE device_id = ? AND user_id = ? AND temporary = 1 AND revoked_at IS NULL').bind(nowIso(), deviceId, userId),
    eventStmt(env, 'temporary_ended', { userId, deviceId, actorId: session.user.id }),
  ]);
  return json({ ok: true });
}

export async function createPerson(env: Env, session: Session, request: Request): Promise<Response> {
  requireCap(session, 'users.manage');
  requirePepper(env);
  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'invalid_request', parsed.error.issues[0]?.message ?? 'Check the form.');
  const b = parsed.data;
  // Only an owner may mint another owner. Today this is already guaranteed
  // (users.manage is owner-only, so only owners reach here), but an explicit
  // check keeps the escalation boundary from depending on that invariant alone.
  if (b.role === 'owner' && session.user.role !== 'owner') throw new HttpError(403, 'forbidden', 'Only an owner can add another owner.');
  const policy = pinPolicyError(b.role, b.pin);
  if (policy) throw new HttpError(400, 'weak_pin', policy);
  const nameKey = normalizeName(b.name);
  // Names stay unique, including people removed at go live (their rows are kept).
  if (await env.DB.prepare('SELECT 1 AS x FROM users WHERE name_key = ?').bind(nameKey).first()) {
    throw new HttpError(409, 'name_taken', 'That name is already used. Add a surname or an initial.');
  }
  if (!(await locationExists(env, b.locationId))) throw new HttpError(400, 'invalid_location', 'Unknown location.');
  const id = uuidv7();
  const now = nowIso();
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO users (id, name, name_key, role, grants, revokes, location_id, pin_hmac, pin_set_at, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(id, b.name, nameKey, b.role, JSON.stringify(b.grants), JSON.stringify(b.revokes), b.locationId, await pinHash(env.PIN_PEPPER, id, b.pin), now, now, now),
    eventStmt(env, 'person_created', { userId: id, actorId: session.user.id, detail: { name: b.name, role: b.role } }),
  ];
  if (b.allowOnDeviceId) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO device_access (device_id, user_id, status, requested_at, decided_at, decided_by)
         SELECT id, ?2, 'approved', ?3, ?3, ?4 FROM devices WHERE id = ?1 AND revoked_at IS NULL`,
      ).bind(b.allowOnDeviceId, id, now, session.user.id),
    );
  }
  await env.DB.batch(stmts);
  return json(toPerson(await getUser(env, id)), 201);
}

async function activeOwnerCount(env: Env): Promise<number> {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND active = 1").first<{ n: number }>())?.n ?? 0;
}

export async function updatePerson(env: Env, session: Session, id: string, request: Request): Promise<Response> {
  requireCap(session, 'users.manage');
  const parsed = updateSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'invalid_request', parsed.error.issues[0]?.message ?? 'Check the form.');
  const b = parsed.data;
  // Only an owner may promote anyone to owner (defence in depth; see createPerson).
  if (b.role === 'owner' && session.user.role !== 'owner') throw new HttpError(403, 'forbidden', 'Only an owner can make someone an owner.');
  const u = await getUser(env, id);
  if (b.active === false && id === session.user.id) throw new HttpError(400, 'own_account', 'You cannot archive your own account.');
  const losingOwner = u.role === 'owner' && u.active && ((b.role && b.role !== 'owner') || b.active === false);
  if (losingOwner && (await activeOwnerCount(env)) <= 1) {
    throw new HttpError(400, 'last_owner', 'There must always be at least one active owner.');
  }
  if (b.locationId !== undefined && !(await locationExists(env, b.locationId))) throw new HttpError(400, 'invalid_location', 'Unknown location.');
  const name = b.name ?? u.name;
  const nameKey = normalizeName(name);
  if (nameKey !== u.name_key && (await env.DB.prepare('SELECT 1 AS x FROM users WHERE name_key = ?').bind(nameKey).first())) {
    throw new HttpError(409, 'name_taken', 'That name is already used.');
  }
  const now = nowIso();
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare('UPDATE users SET name = ?, name_key = ?, role = ?, active = ?, location_id = ?, grants = ?, revokes = ?, updated_at = ? WHERE id = ?').bind(
      name,
      nameKey,
      b.role ?? u.role,
      b.active === undefined ? u.active : b.active ? 1 : 0,
      b.locationId === undefined ? u.location_id : b.locationId,
      JSON.stringify(b.grants ?? JSON.parse(u.grants)),
      JSON.stringify(b.revokes ?? JSON.parse(u.revokes)),
      now,
      id,
    ),
    eventStmt(env, 'person_updated', { userId: id, actorId: session.user.id, detail: { changes: b } }),
  ];
  // Archiving a person (active → off) is separate from retiring their devices:
  // they cannot sign in or be picked for new work, their sessions end, and any
  // device request still waiting for them is closed. Nothing they recorded is
  // touched, and reactivating is a separate, logged action.
  const archiving = b.active === false && Boolean(u.active);
  const reactivating = b.active === true && !u.active;
  if (b.active === false) stmts.push(env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(now, id));
  if (archiving) {
    stmts.push(
      env.DB.prepare("UPDATE device_access SET status = 'denied', decided_at = ?, decided_by = ? WHERE user_id = ? AND status = 'pending'").bind(now, session.user.id, id),
      eventStmt(env, 'person_archived', { userId: id, actorId: session.user.id, detail: { name: u.name, role: u.role } }),
    );
  }
  if (reactivating) stmts.push(eventStmt(env, 'person_reactivated', { userId: id, actorId: session.user.id, detail: { name: u.name, role: u.role } }));
  await env.DB.batch(stmts);
  return json(toPerson(await getUser(env, id)));
}

export async function resetPin(env: Env, session: Session, id: string, request: Request): Promise<Response> {
  requireCap(session, 'users.manage');
  requirePepper(env);
  const body = (await readJson(request)) as { pin?: unknown };
  const u = await getUser(env, id);
  const pin = typeof body.pin === 'string' ? body.pin : '';
  const policy = pinPolicyError(u.role as Role, pin);
  if (policy) throw new HttpError(400, 'weak_pin', policy);
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pin_hmac = ?, pin_set_at = ?, failed_count = 0, locked_until = NULL, hard_locked = 0, updated_at = ? WHERE id = ?').bind(
      await pinHash(env.PIN_PEPPER, id, pin),
      now,
      now,
      id,
    ),
    // Other devices must sign in again with the new code.
    env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND token_hash <> ?').bind(now, id, session.tokenHash),
    eventStmt(env, 'pin_reset', { userId: id, actorId: session.user.id }),
  ]);
  return json(toPerson(await getUser(env, id)));
}

export async function unlockPerson(env: Env, session: Session, id: string): Promise<Response> {
  requireCap(session, 'users.manage');
  await getUser(env, id);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET failed_count = 0, locked_until = NULL, hard_locked = 0, updated_at = ? WHERE id = ?').bind(nowIso(), id),
    eventStmt(env, 'person_unlocked', { userId: id, actorId: session.user.id }),
  ]);
  return json(toPerson(await getUser(env, id)));
}

const accessSchema = z.object({
  deviceId: z.string().max(64),
  userId: z.string().max(64),
  decision: z.enum(['approve', 'deny', 'revoke']),
});

export async function decideAccess(env: Env, session: Session, request: Request): Promise<Response> {
  requireCap(session, 'users.manage');
  const parsed = accessSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'invalid_request', 'Invalid request.');
  const { deviceId, userId, decision } = parsed.data;
  await getUser(env, userId);
  if (!(await deviceExists(env, deviceId))) throw new HttpError(404, 'not_found', 'Device not found.');
  const status = decision === 'approve' ? 'approved' : decision === 'deny' ? 'denied' : 'revoked';
  const now = nowIso();
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO device_access (device_id, user_id, status, requested_at, decided_at, decided_by) VALUES (?1, ?2, ?3, ?4, ?4, ?5)
       ON CONFLICT (device_id, user_id) DO UPDATE SET status = ?3, decided_at = ?4, decided_by = ?5`,
    ).bind(deviceId, userId, status, now, session.user.id),
    eventStmt(env, `device_${status}`, { userId, deviceId, actorId: session.user.id }),
  ];
  if (status !== 'approved') {
    stmts.push(env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE device_id = ? AND user_id = ? AND revoked_at IS NULL').bind(now, deviceId, userId));
  }
  await env.DB.batch(stmts);
  return json({ ok: true });
}

const deviceSchema = z.object({ label: z.string().trim().max(80).optional(), blocked: z.boolean().optional(), retired: z.boolean().optional() });

export async function updateDevice(env: Env, session: Session, id: string, request: Request): Promise<Response> {
  requireCap(session, 'users.manage');
  const parsed = deviceSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'invalid_request', 'Invalid request.');
  const b = parsed.data;
  if ((b.blocked || b.retired) && id === session.deviceId) throw new HttpError(400, 'own_device', 'You cannot block or retire the device you are using.');
  if (!(await deviceExists(env, id))) throw new HttpError(404, 'not_found', 'Device not found.');
  const now = nowIso();
  const stmts: D1PreparedStatement[] = [];
  if (b.label !== undefined) stmts.push(env.DB.prepare('UPDATE devices SET label = ? WHERE id = ?').bind(b.label, id));
  if (b.retired !== undefined) {
    // Retiring also blocks (so the existing auth checks deny it) and ends its
    // sessions; reactivating clears both flags. The row is never deleted, so
    // historical operations that reference the device stay intelligible.
    stmts.push(
      env.DB.prepare('UPDATE devices SET retired_at = ?1, revoked_at = ?1 WHERE id = ?2').bind(b.retired ? now : null, id),
      eventStmt(env, b.retired ? 'device_retired' : 'device_reactivated', { deviceId: id, actorId: session.user.id }),
    );
    if (b.retired) stmts.push(env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL').bind(now, id));
  } else if (b.blocked !== undefined) {
    // Plain block/unblock applies only to non-retired devices; a retired device
    // is reactivated with `retired: false`, not unblocked.
    stmts.push(
      env.DB.prepare('UPDATE devices SET revoked_at = ? WHERE id = ? AND retired_at IS NULL').bind(b.blocked ? now : null, id),
      eventStmt(env, b.blocked ? 'device_blocked' : 'device_unblocked', { deviceId: id, actorId: session.user.id }),
    );
    if (b.blocked) stmts.push(env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL').bind(now, id));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true });
}

export async function listAuthEvents(env: Env, session: Session, url: URL): Promise<Response> {
  requireCap(session, 'audit.view');
  const before = Number(url.searchParams.get('before') ?? '0') || Number.MAX_SAFE_INTEGER;
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '100') || 100));
  const { results } = await env.DB.prepare('SELECT * FROM auth_events WHERE id < ? ORDER BY id DESC LIMIT ?').bind(before, limit).all<{
    id: number;
    at: string;
    kind: string;
    user_id: string | null;
    actor_id: string | null;
    device_id: string | null;
    ip: string | null;
    detail: string;
  }>();
  const events: AuthEventRow[] = results.map((r) => ({
    id: r.id,
    at: r.at,
    kind: r.kind,
    userId: r.user_id,
    actorId: r.actor_id,
    deviceId: r.device_id,
    ip: r.ip,
    detail: JSON.parse(r.detail) as Record<string, unknown>,
  }));
  return json({ events });
}

/** Everything needed to rebuild the business records (no secrets). */
export async function exportBackup(env: Env, session: Session): Promise<Response> {
  requireCap(session, 'users.manage');
  const [ops, users] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM ops ORDER BY seq'),
    env.DB.prepare('SELECT id, name, role, grants, revokes, location_id, active, created_at FROM users ORDER BY created_at'),
  ]);
  await env.DB.batch([eventStmt(env, 'backup_exported', { actorId: session.user.id, deviceId: session.deviceId })]);
  return json(
    { format: 'mabubu-backup', version: 1, exportedAt: nowIso(), ops: ops!.results, users: users!.results },
    200,
    { 'content-disposition': `attachment; filename="mabubu-backup-${nowIso().slice(0, 10)}.json"` },
  );
}
