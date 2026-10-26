// Sign-in with name + access code, device approval, sessions, lockout.
// See docs/decisions/ADR-001-architecture-and-access.md §6.

import { z } from 'zod';
import { TEMP_SIGNIN, normalizeName, type LoginResponse, type SessionUser } from '../shared/api';
import { randomToken, shortCode, uuidv7 } from '../shared/ids';
import { OWNER_ONLY, effectiveCapabilities, pinPolicyError, type Role } from '../shared/permissions';
import { pinHash, safeEqual, sha256Hex } from './crypto';
import type { D1PreparedStatement, Env } from './env';
import { HttpError, clientIp, json, nowIso, readJson } from './http';

const SESSION_MS = 30 * 24 * 3600_000;
const SESSION_TOUCH_MS = 3600_000;
// Temporary owner sign-in (ADR-006; the numbers are in TEMP_SIGNIN). Touched
// far more often than an ordinary session so the idle limit is exact.
const TEMP_SESSION_MS = TEMP_SIGNIN.maxHours * 3600_000;
const TEMP_IDLE_MS = TEMP_SIGNIN.serverIdleMinutes * 60_000;
const TEMP_TOUCH_MS = 5 * 60_000;
const TEMP_ENDED = 'Your temporary sign-in has ended. Sign in again.';
const LOCK_STEPS: { at: number; minutes: number }[] = [
  { at: 5, minutes: 15 },
  { at: 10, minutes: 60 },
  { at: 15, minutes: 360 },
];
const HARD_LOCK_AT = 20;
const IP_WINDOW_MS = 3600_000;
const IP_MAX_FAILURES = 30;

const deviceFields = {
  deviceId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  deviceSecret: z.string().min(32).max(128),
  deviceLabel: z.string().trim().max(80),
};
const loginSchema = z.object({ name: z.string().trim().min(1).max(80), pin: z.string().regex(/^\d{4,8}$/), ...deviceFields });
const setupSchema = z.object({
  setupToken: z.string().min(16).max(200),
  name: z.string().trim().min(1).max(80),
  pin: z.string().regex(/^\d{4,8}$/),
  ...deviceFields,
});

export interface Session {
  user: SessionUser;
  deviceId: string;
  tokenHash: string;
  /** A temporary owner sign-in (ADR-006). */
  temporary: boolean;
}

export interface UserRow {
  id: string;
  name: string;
  name_key: string;
  role: Role;
  grants: string;
  revokes: string;
  location_id: string | null;
  pin_hmac: string;
  pin_set_at: string;
  active: number;
  failed_count: number;
  locked_until: string | null;
  hard_locked: number;
  created_at: string;
  updated_at: string;
}

export function sessionUser(u: Pick<UserRow, 'id' | 'name' | 'role' | 'grants' | 'revokes' | 'location_id'>): SessionUser {
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    caps: effectiveCapabilities(u.role, JSON.parse(u.grants) as string[], JSON.parse(u.revokes) as string[]),
    locationId: u.location_id,
  };
}

/**
 * A temporary sign-in may do what the owner does with the business records,
 * but none of the owner-only tools (people, devices, settings, go live): a
 * code seen over the owner's shoulder must not become a permanent device.
 */
export function temporaryUser(u: Pick<UserRow, 'id' | 'name' | 'role' | 'grants' | 'revokes' | 'location_id'>): SessionUser {
  const s = sessionUser(u);
  return { ...s, caps: s.caps.filter((c) => !OWNER_ONLY.includes(c)), temporary: true };
}

/** Whether a temporary sign-in is still usable: not ended, not past its fixed end, not idle too long. */
export function temporaryLive(s: { revoked_at: string | null; expires_at: string; last_used_at: string }, now = Date.now()): boolean {
  return !s.revoked_at && Date.parse(s.expires_at) > now && now - Date.parse(s.last_used_at) <= TEMP_IDLE_MS;
}

export function requirePepper(env: Env) {
  if (!env.PIN_PEPPER || env.PIN_PEPPER.length < 32) {
    throw new HttpError(503, 'not_configured', 'The server secret PIN_PEPPER is not set (needs at least 32 characters).');
  }
}

export function eventStmt(
  env: Env,
  kind: string,
  f: { userId?: string | null; actorId?: string | null; deviceId?: string | null; ip?: string | null; detail?: Record<string, unknown> },
): D1PreparedStatement {
  return env.DB.prepare('INSERT INTO auth_events (at, kind, user_id, actor_id, device_id, ip, detail) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
    nowIso(),
    kind,
    f.userId ?? null,
    f.actorId ?? null,
    f.deviceId ?? null,
    f.ip ?? null,
    JSON.stringify(f.detail ?? {}),
  );
}

async function ipBlocked(env: Env, ip: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT window_start, count FROM ip_failures WHERE ip = ?').bind(ip).first<{ window_start: string; count: number }>();
  if (!row) return false;
  if (Date.parse(row.window_start) + IP_WINDOW_MS < Date.now()) return false;
  return row.count >= IP_MAX_FAILURES;
}

function ipFailureStmt(env: Env, ip: string): D1PreparedStatement {
  const now = nowIso();
  const cutoff = new Date(Date.now() - IP_WINDOW_MS).toISOString();
  return env.DB.prepare(
    `INSERT INTO ip_failures (ip, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT (ip) DO UPDATE SET
       count = CASE WHEN window_start < ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start < ?3 THEN ?2 ELSE window_start END`,
  ).bind(ip, now, cutoff);
}

/**
 * Check a person's code with the lockout rules (5/10/15 wrong → timed lock,
 * 20 → owner unlock, plus the per-network limit). Throws on a lock or a wrong
 * code, after recording the failure. Used by sign-in and by actions that ask
 * for the code again (the go-live cutover).
 */
export async function checkPin(env: Env, user: UserRow, pin: string, ip: string, deviceId: string | null) {
  const now = Date.now();
  if (user.hard_locked) {
    throw new HttpError(423, 'locked', 'This account is locked after too many wrong codes. Ask the owner to unlock it.');
  }
  if (user.locked_until && Date.parse(user.locked_until) > now) {
    const retryAfterSec = Math.ceil((Date.parse(user.locked_until) - now) / 1000);
    throw new HttpError(423, 'locked', 'Too many wrong codes. Wait before trying again.', { retryAfterSec });
  }
  const h = await pinHash(env.PIN_PEPPER, user.id, pin);
  if (!safeEqual(h, user.pin_hmac)) {
    const failed = user.failed_count + 1;
    const hard = failed >= HARD_LOCK_AT;
    const step = LOCK_STEPS.find((s) => s.at === failed);
    const lockedUntil = step ? new Date(now + step.minutes * 60_000).toISOString() : user.locked_until;
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET failed_count = ?, locked_until = ?, hard_locked = ? WHERE id = ?').bind(failed, lockedUntil, hard ? 1 : 0, user.id),
      ipFailureStmt(env, ip),
      eventStmt(env, hard ? 'account_locked' : 'login_wrong_code', { userId: user.id, deviceId, ip, detail: { failed } }),
    ]);
    if (hard) throw new HttpError(423, 'locked', 'This account is now locked. Ask the owner to unlock it.');
    if (step) throw new HttpError(423, 'locked', `Too many wrong codes. Try again in ${step.minutes} minutes.`, { retryAfterSec: step.minutes * 60 });
    throw new HttpError(401, 'invalid', 'That name and code do not match.', { attemptsLeft: 5 - (failed % 5) });
  }
}

/** The per-network limit on wrong attempts, shared by sign-in and code re-checks. */
export async function requireIpAllowed(env: Env, ip: string) {
  if (await ipBlocked(env, ip)) throw new HttpError(429, 'rate_limited', 'Too many wrong attempts from this network. Try again in an hour.');
}

async function newSessionStmts(env: Env, userId: string, deviceId: string) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
  const stmts = [
    env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL').bind(now, userId, deviceId),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, device_id, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
      tokenHash,
      userId,
      deviceId,
      now,
      expiresAt,
      now,
    ),
  ];
  return { token, expiresAt, stmts };
}

interface DeviceRowDb {
  id: string;
  secret_hash: string;
  code: string;
  revoked_at: string | null;
}

/** Find or register the device; throws if its secret does not match. */
async function resolveDevice(env: Env, body: z.infer<typeof loginSchema> | z.infer<typeof setupSchema>, request: Request, ip: string, userId: string) {
  const secretHash = await sha256Hex(body.deviceSecret);
  const ua = (request.headers.get('user-agent') ?? '').slice(0, 200);
  const dev = await env.DB.prepare('SELECT id, secret_hash, code, revoked_at FROM devices WHERE id = ?').bind(body.deviceId).first<DeviceRowDb>();
  const stmts: D1PreparedStatement[] = [];
  if (!dev) {
    const code = await shortCode(body.deviceId);
    stmts.push(
      env.DB.prepare('INSERT INTO devices (id, secret_hash, code, label, user_agent, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
        body.deviceId,
        secretHash,
        code,
        body.deviceLabel,
        ua,
        nowIso(),
        nowIso(),
      ),
    );
    return { device: { id: body.deviceId, secret_hash: secretHash, code, revoked_at: null } as DeviceRowDb, stmts };
  }
  if (!safeEqual(dev.secret_hash, secretHash)) {
    await env.DB.batch([eventStmt(env, 'device_mismatch', { userId, deviceId: body.deviceId, ip })]);
    throw new HttpError(403, 'device_mismatch', 'This device is not recognised. Reset the app on this device and sign in again.');
  }
  stmts.push(
    env.DB.prepare("UPDATE devices SET last_seen_at = ?, user_agent = ?, label = CASE WHEN ? <> '' THEN ? ELSE label END WHERE id = ?").bind(
      nowIso(),
      ua,
      body.deviceLabel,
      body.deviceLabel,
      body.deviceId,
    ),
  );
  return { device: dev, stmts };
}

/* ------------------------------------------------------------------ */

/**
 * Name and code, with the network limit and the account lockout. Returns the
 * person once their code is correct and their account is switched on. Shared
 * by sign-in and by sign-in for now, so both are equally hard to guess.
 */
async function verifyPerson(env: Env, request: Request) {
  requirePepper(env);
  const ip = clientIp(request);
  const parsed = loginSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'invalid_request', 'Enter your name and your 4–8 digit code.');
  const body = parsed.data;
  if (await ipBlocked(env, ip)) throw new HttpError(429, 'rate_limited', 'Too many wrong attempts from this network. Try again in an hour.');

  const user = await env.DB.prepare('SELECT * FROM users WHERE name_key = ?').bind(normalizeName(body.name)).first<UserRow>();
  if (!user) {
    await pinHash(env.PIN_PEPPER, 'nobody', body.pin); // keep timing similar to a real check
    await env.DB.batch([ipFailureStmt(env, ip), eventStmt(env, 'login_unknown_name', { deviceId: body.deviceId, ip, detail: { name: body.name.slice(0, 40) } })]);
    throw new HttpError(401, 'invalid', 'That name and code do not match.');
  }
  await checkPin(env, user, body.pin, ip, body.deviceId);

  if (!user.active) {
    await env.DB.batch([eventStmt(env, 'login_disabled', { userId: user.id, deviceId: body.deviceId, ip })]);
    throw new HttpError(403, 'disabled', 'This account is switched off. Ask the owner.');
  }
  return { ip, body, user };
}

export async function login(env: Env, request: Request): Promise<Response> {
  const { ip, body, user } = await verifyPerson(env, request);
  const { device, stmts } = await resolveDevice(env, body, request, ip, user.id);
  stmts.unshift(env.DB.prepare('UPDATE users SET failed_count = 0, locked_until = NULL WHERE id = ?').bind(user.id));
  if (device.revoked_at) {
    await env.DB.batch([...stmts, eventStmt(env, 'login_device_blocked', { userId: user.id, deviceId: device.id, ip })]);
    throw new HttpError(403, 'device_blocked', 'This device was blocked by the owner.');
  }

  const access = await env.DB.prepare('SELECT status FROM device_access WHERE device_id = ? AND user_id = ?')
    .bind(device.id, user.id)
    .first<{ status: string }>();
  if (access?.status === 'approved') {
    const s = await newSessionStmts(env, user.id, device.id);
    await env.DB.batch([...stmts, ...s.stmts, eventStmt(env, 'login_ok', { userId: user.id, deviceId: device.id, ip })]);
    const res: LoginResponse = { status: 'ok', token: s.token, expiresAt: s.expiresAt, user: sessionUser(user) };
    return json(res);
  }
  const refused = access?.status === 'denied' || access?.status === 'revoked';
  // Only the owner decides about the owner's own requests, so the owner is
  // never stopped by "not allowed" on a computer they once refused for
  // themselves (for example after a sign-in for now there): the request is
  // opened again and they choose (ADR-006). Anyone else stays refused.
  if (refused && user.role !== 'owner') {
    await env.DB.batch([...stmts, eventStmt(env, 'login_device_denied', { userId: user.id, deviceId: device.id, ip })]);
    throw new HttpError(403, 'device_denied', 'The owner has not allowed this device for you.');
  }
  if (!access || refused) {
    stmts.push(
      refused
        ? env.DB.prepare(
            "UPDATE device_access SET status = 'pending', requested_at = ?, decided_at = NULL, decided_by = NULL WHERE device_id = ? AND user_id = ? AND status IN ('denied', 'revoked')",
          ).bind(nowIso(), device.id, user.id)
        : env.DB.prepare("INSERT INTO device_access (device_id, user_id, status, requested_at) VALUES (?, ?, 'pending', ?) ON CONFLICT DO NOTHING").bind(device.id, user.id, nowIso()),
      eventStmt(env, 'device_requested', { userId: user.id, deviceId: device.id, ip, detail: { code: device.code, label: body.deviceLabel } }),
    );
  }
  await env.DB.batch(stmts);
  const res: LoginResponse = { status: 'pending', deviceCode: device.code, userName: user.name, role: user.role };
  return json(res, 202);
}

/**
 * The owner signs in "for now" on a computer that is not one of their
 * approved devices (ADR-006): a shared or public computer, or their own
 * computer after its browser data was cleared. Name and code are checked
 * exactly as for sign-in (same lockout, same network limit). The computer is
 * NOT approved by this: the session has a fixed end that use never extends, a
 * short idle limit and no owner-only rights, and the owner's open request for
 * this computer is closed. Never for workers or managers.
 */
export async function loginTemporary(env: Env, request: Request): Promise<Response> {
  const { ip, body, user } = await verifyPerson(env, request);
  if (user.role !== 'owner') {
    await env.DB.batch([eventStmt(env, 'temporary_refused', { userId: user.id, deviceId: body.deviceId, ip })]);
    throw new HttpError(403, 'owner_only', 'Only the owner can use a temporary sign-in on a computer that is not approved.');
  }
  const { device, stmts } = await resolveDevice(env, body, request, ip, user.id);
  stmts.unshift(env.DB.prepare('UPDATE users SET failed_count = 0, locked_until = NULL WHERE id = ?').bind(user.id));
  if (device.revoked_at) {
    await env.DB.batch([...stmts, eventStmt(env, 'login_device_blocked', { userId: user.id, deviceId: device.id, ip })]);
    throw new HttpError(403, 'device_blocked', 'This device was blocked by the owner.');
  }

  const now = Date.now();
  const at = new Date(now).toISOString();
  // "For now" means this computer is not becoming one of the owner's devices:
  // their own open request for it is closed (the sign-in log keeps both).
  const open = await env.DB.prepare("SELECT 1 AS x FROM device_access WHERE device_id = ? AND user_id = ? AND status = 'pending'").bind(device.id, user.id).first();
  if (open) {
    stmts.push(
      env.DB.prepare("UPDATE device_access SET status = 'denied', decided_at = ?, decided_by = ? WHERE device_id = ? AND user_id = ? AND status = 'pending'").bind(at, user.id, device.id, user.id),
    );
  }
  // At most TEMP_SIGNIN.maxLive at once: a new one ends the oldest still running elsewhere.
  const { results: live } = await env.DB.prepare(
    'SELECT token_hash, device_id FROM sessions WHERE user_id = ?1 AND temporary = 1 AND revoked_at IS NULL AND expires_at > ?2 AND last_used_at > ?3 AND device_id <> ?4 ORDER BY created_at',
  )
    .bind(user.id, at, new Date(now - TEMP_IDLE_MS).toISOString(), device.id)
    .all<{ token_hash: string; device_id: string }>();
  for (const old of live.slice(0, Math.max(0, live.length - (TEMP_SIGNIN.maxLive - 1)))) {
    stmts.push(
      env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').bind(at, old.token_hash),
      eventStmt(env, 'temporary_replaced', { userId: user.id, deviceId: old.device_id, ip }),
    );
  }
  const token = randomToken(32);
  const expiresAt = new Date(now + TEMP_SESSION_MS).toISOString();
  stmts.push(
    // One sign-in per person per computer: this one replaces any other there.
    env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL').bind(at, user.id, device.id),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, device_id, created_at, expires_at, last_used_at, temporary) VALUES (?, ?, ?, ?, ?, ?, 1)').bind(
      await sha256Hex(token),
      user.id,
      device.id,
      at,
      expiresAt,
      at,
    ),
    eventStmt(env, 'login_temporary', { userId: user.id, deviceId: device.id, ip, detail: { code: device.code, label: body.deviceLabel, until: expiresAt, requestClosed: Boolean(open) } }),
  );
  await env.DB.batch(stmts);
  const res: LoginResponse = { status: 'ok', token, expiresAt, user: temporaryUser(user), temporary: true };
  return json(res);
}

/* ------------------------------------------------------------------ */

export async function authenticate(env: Env, request: Request): Promise<Session> {
  const m = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(request.headers.get('authorization') ?? '');
  if (!m) throw new HttpError(401, 'unauthenticated', 'Please sign in.');
  const tokenHash = await sha256Hex(m[1]!);
  const row = await env.DB.prepare(
    `SELECT s.user_id, s.device_id, s.expires_at, s.last_used_at, s.revoked_at, s.temporary,
            u.name, u.role, u.grants, u.revokes, u.location_id, u.active,
            d.revoked_at AS device_revoked, a.status AS access
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN devices d ON d.id = s.device_id
       LEFT JOIN device_access a ON a.device_id = s.device_id AND a.user_id = s.user_id
      WHERE s.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{
      user_id: string;
      device_id: string;
      expires_at: string;
      last_used_at: string;
      revoked_at: string | null;
      temporary: number;
      name: string;
      role: Role;
      grants: string;
      revokes: string;
      location_id: string | null;
      active: number;
      device_revoked: string | null;
      access: string | null;
    }>();
  const now = Date.now();
  const who = () => ({ id: row!.user_id, name: row!.name, role: row!.role, grants: row!.grants, revokes: row!.revokes, location_id: row!.location_id });
  if (row?.temporary) {
    // A sign-in for now (ADR-006): no device approval behind it. It ends at its
    // fixed time, after the idle limit, when signed out, or when the computer
    // is blocked; use never extends it. Owner only, without owner-only rights.
    if (!temporaryLive(row, now) || !row.active || row.role !== 'owner' || row.device_revoked) throw new HttpError(401, 'session_ended', TEMP_ENDED);
    if (now - Date.parse(row.last_used_at) > TEMP_TOUCH_MS) {
      const iso = new Date(now).toISOString();
      await env.DB.batch([
        env.DB.prepare('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?').bind(iso, tokenHash),
        env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').bind(iso, row.device_id),
      ]);
    }
    return { user: temporaryUser(who()), deviceId: row.device_id, tokenHash, temporary: true };
  }
  if (!row || row.revoked_at || Date.parse(row.expires_at) < now) throw new HttpError(401, 'session_ended', 'Your session has ended. Please sign in again.');
  if (!row.active) throw new HttpError(401, 'disabled', 'This account is switched off. Ask the owner.');
  if (row.device_revoked || row.access !== 'approved') throw new HttpError(401, 'device_blocked', 'This device is no longer allowed. Ask the owner.');
  if (now - Date.parse(row.last_used_at) > SESSION_TOUCH_MS) {
    const iso = new Date(now).toISOString();
    await env.DB.batch([
      env.DB.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?').bind(iso, new Date(now + SESSION_MS).toISOString(), tokenHash),
      env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').bind(iso, row.device_id),
    ]);
  }
  return { user: sessionUser(who()), deviceId: row.device_id, tokenHash, temporary: false };
}

export async function logout(env: Env, session: Session): Promise<Response> {
  await env.DB.batch([
    env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').bind(nowIso(), session.tokenHash),
    eventStmt(env, 'logout', { userId: session.user.id, deviceId: session.deviceId, detail: session.temporary ? { temporary: true } : {} }),
  ]);
  return json({ ok: true });
}

/* ------------------------------------------------------------------ */
/* First setup and owner recovery                                      */
/* ------------------------------------------------------------------ */

export async function setupStatus(env: Env): Promise<Response> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  return json({ needsSetup: (row?.n ?? 0) === 0, setupEnabled: Boolean(env.SETUP_TOKEN && env.SETUP_TOKEN.length >= 16) });
}

export async function setup(env: Env, request: Request): Promise<Response> {
  requirePepper(env);
  if (!env.SETUP_TOKEN || env.SETUP_TOKEN.length < 16) {
    throw new HttpError(503, 'setup_disabled', 'Setup is switched off on this server (SETUP_TOKEN is not set).');
  }
  const ip = clientIp(request);
  if (await ipBlocked(env, ip)) throw new HttpError(429, 'rate_limited', 'Too many wrong attempts from this network. Try again in an hour.');
  const parsed = setupSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'invalid_request', 'Fill in the setup key, your name and a code.');
  const body = parsed.data;
  const [given, expected] = await Promise.all([sha256Hex(body.setupToken), sha256Hex(env.SETUP_TOKEN)]);
  if (!safeEqual(given, expected)) {
    await env.DB.batch([ipFailureStmt(env, ip), eventStmt(env, 'setup_wrong_key', { deviceId: body.deviceId, ip })]);
    throw new HttpError(401, 'invalid', 'The setup key is not correct.');
  }
  const policy = pinPolicyError('owner', body.pin);
  if (policy) throw new HttpError(400, 'weak_pin', policy);

  const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>())?.n ?? 0;
  const now = nowIso();
  let user: UserRow;
  let pinChanged = false;
  const stmts: D1PreparedStatement[] = [];
  if (count === 0) {
    const id = uuidv7();
    user = {
      id,
      name: body.name,
      name_key: normalizeName(body.name),
      role: 'owner',
      grants: '[]',
      revokes: '[]',
      location_id: null,
      pin_hmac: await pinHash(env.PIN_PEPPER, id, body.pin),
      pin_set_at: now,
      active: 1,
      failed_count: 0,
      locked_until: null,
      hard_locked: 0,
      created_at: now,
      updated_at: now,
    };
    stmts.push(
      env.DB.prepare(
        `INSERT INTO users (id, name, name_key, role, grants, revokes, location_id, pin_hmac, pin_set_at, active, created_at, updated_at)
         VALUES (?, ?, ?, 'owner', '[]', '[]', NULL, ?, ?, 1, ?, ?)`,
      ).bind(id, user.name, user.name_key, user.pin_hmac, now, now, now),
      // Two first-setup requests racing each other must not create two owners:
      // the batch is atomic, so this aborts it if anyone else got in first.
      env.DB.prepare('INSERT INTO guard (v) SELECT 1 WHERE (SELECT COUNT(*) FROM users) > 1'),
    );
  } else {
    const owner = await env.DB.prepare("SELECT * FROM users WHERE name_key = ? AND role = 'owner'").bind(normalizeName(body.name)).first<UserRow>();
    if (!owner) throw new HttpError(400, 'not_owner', 'Setup is already done. For recovery, enter the existing owner’s name.');
    user = { ...owner, pin_hmac: await pinHash(env.PIN_PEPPER, owner.id, body.pin) };
    pinChanged = !safeEqual(user.pin_hmac, owner.pin_hmac);
    stmts.push(
      env.DB.prepare('UPDATE users SET pin_hmac = ?, pin_set_at = ?, failed_count = 0, locked_until = NULL, hard_locked = 0, active = 1, updated_at = ? WHERE id = ?').bind(
        user.pin_hmac,
        now,
        now,
        owner.id,
      ),
    );
  }
  const dev = await resolveDevice(env, body, request, ip, user.id);
  // Owner recovery fully reactivates the recovering device: clear the blocked,
  // retired and removed-at-go-live flags so it never ends up active but flagged.
  if (dev.device.revoked_at) stmts.push(env.DB.prepare('UPDATE devices SET revoked_at = NULL, retired_at = NULL, removed_at = NULL WHERE id = ?').bind(dev.device.id));
  stmts.push(
    ...dev.stmts,
    env.DB.prepare(
      `INSERT INTO device_access (device_id, user_id, status, requested_at, decided_at, decided_by) VALUES (?1, ?2, 'approved', ?3, ?3, ?2)
       ON CONFLICT (device_id, user_id) DO UPDATE SET status = 'approved', decided_at = ?3, decided_by = ?2`,
    ).bind(dev.device.id, user.id, now),
  );
  const s = await newSessionStmts(env, user.id, dev.device.id);
  // Recovery may set a new owner code; record whether it did, so the sign-in
  // log shows it (never the code itself).
  const detail = count === 0 ? {} : { pinChanged };
  try {
    await env.DB.batch([...stmts, ...s.stmts, eventStmt(env, count === 0 ? 'setup_owner' : 'setup_recover_owner', { userId: user.id, deviceId: dev.device.id, ip, detail })]);
  } catch (e) {
    if (count === 0 && /CHECK constraint failed|UNIQUE constraint failed: users/i.test(String((e as Error)?.message ?? e))) {
      throw new HttpError(409, 'setup_race', 'The business was just set up from another device. Try again to recover owner access.');
    }
    throw e;
  }
  // `created` tells the client whether this was a first-time creation or a
  // recovery. `starterNeeded` says whether the starter places and size groups
  // can still be offered: only while the business has no records at all, so an
  // interrupted first setup can finish, and a recovery never re-seeds a
  // business that already has data (see the duplicate-data bug).
  const hasRecords = Boolean(await env.DB.prepare('SELECT 1 AS x FROM ops LIMIT 1').first());
  const res: LoginResponse = { status: 'ok', token: s.token, expiresAt: s.expiresAt, user: sessionUser(user), created: count === 0, starterNeeded: !hasRecords };
  return json(res);
}
