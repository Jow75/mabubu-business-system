// Upload (push) and download (pull) of operations.
//
// Push: operations are validated by the shared engine against the server's
// state and written in one D1 batch (a transaction). Operation IDs are unique,
// so re-sending the same operation returns its original result instead of
// applying it twice. Entity rows carry a version number; if another device
// changed the same record in the meantime the batch aborts and is retried.
//
// Free-plan budget per request: ≤ 50 queries and ~10 ms CPU, so state is
// pre-fetched in a few IN-list queries and written with multi-row statements.

import { HOLDABLE, applyOp, moveDeltas, type Actor, type EngineCtx, type Effects, type ErrorCode, type OpRecord } from '../shared/engine';
import { ENGINE_VERSION, parseOp, subjectOf, visibilityOf, type AnyOp, type Flag, type LateReview } from '../shared/ops';
import { K, balanceKey, entityKind, splitBalanceKey, type UserRef } from '../shared/model';
import { readableClasses } from '../shared/permissions';
import { businessDate, daysBetween, fmtDuration } from '../shared/time';
import type { PushResult } from '../shared/api';
import type { Session } from './auth';
import type { Env } from './env';
import { HttpError, json, rawJson, readJson } from './http';

const MAX_PUSH = 25;
const MAX_PULL = 500;
const SKEW_FLAG_MS = 5 * 60_000;
const LATE_SYNC_MS = 12 * 3600_000;

class RetryConflict extends Error {}

/* ------------------------------------------------------------------ */
/* Keys an operation will need, so most state loads in one round trip  */
/* ------------------------------------------------------------------ */

function prefetchKeys(op: AnyOp): string[] {
  const k: string[] = [];
  const gts = (lines: readonly { garmentTypeId: string }[]) => {
    for (const l of lines) k.push(K.garment(l.garmentTypeId));
  };
  switch (op.type) {
    case 'location.upsert':
      k.push(K.location(op.payload.id));
      break;
    case 'size.upsert':
      k.push(K.size(op.payload.id));
      break;
    case 'vendor.upsert':
      k.push(K.vendor(op.payload.id));
      break;
    case 'garment.upsert':
      k.push(K.garment(op.payload.id));
      if (op.payload.sizeCategoryId) k.push(K.size(op.payload.sizeCategoryId));
      if (op.payload.vendorId) k.push(K.vendor(op.payload.vendorId));
      break;
    case 'price.set':
      k.push(K.garment(op.payload.garmentTypeId), K.location(op.payload.locationId), K.price(op.payload.garmentTypeId, op.payload.locationId));
      break;
    case 'fx.set':
      k.push(K.fx(op.payload.from, op.payload.to));
      break;
    case 'settings.set':
      k.push(K.settings());
      break;
    case 'purchase.record':
      k.push(K.purchase(op.payload.id), K.vendor(op.payload.vendorId), K.location(op.payload.locationId));
      gts(op.payload.lines);
      break;
    case 'purchase.collect':
    case 'purchase.inspect':
    case 'purchase.return':
      k.push(K.purchase(op.payload.purchaseId));
      gts(op.payload.lines);
      break;
    case 'vendor.payment':
      k.push(K.vendor(op.payload.vendorId));
      if (op.payload.purchaseId) k.push(K.purchase(op.payload.purchaseId));
      break;
    case 'payment.allocate':
      k.push(K.split(op.payload.paymentId));
      for (const a of op.payload.allocations) k.push(K.purchase(a.purchaseId));
      break;
    case 'shipment.dispatch':
      k.push(K.shipment(op.payload.id), K.location(op.payload.fromLocationId), K.location(op.payload.toLocationId));
      gts(op.payload.lines);
      break;
    case 'shipment.receive':
      k.push(K.shipment(op.payload.shipmentId));
      gts(op.payload.lines);
      break;
    case 'shipment.cost':
      k.push(K.shipment(op.payload.shipmentId));
      break;
    case 'stock.adjust':
      k.push(K.location(op.payload.locationId));
      gts(op.payload.lines);
      break;
    case 'expense.record':
      k.push(K.location(op.payload.locationId));
      if (op.payload.shipmentId) k.push(K.shipment(op.payload.shipmentId));
      break;
    case 'worker.issue':
    case 'worker.return':
      k.push(K.user(op.payload.workerId), K.location(op.payload.locationId), K.day(op.payload.workerId, op.payload.workDate));
      gts(op.payload.lines);
      break;
    case 'worker.settle':
      k.push(K.user(op.payload.workerId), K.location(op.payload.locationId), K.day(op.payload.workerId, op.payload.workDate));
      gts(op.payload.lines);
      for (const l of op.payload.lines) k.push(K.price(l.garmentTypeId, op.payload.locationId));
      break;
    case 'worker.review':
      k.push(K.day(op.payload.workerId, op.payload.workDate));
      break;
    default:
      break;
  }
  return k;
}

/* ------------------------------------------------------------------ */
/* Engine context backed by pre-fetched rows plus an in-batch overlay  */
/* ------------------------------------------------------------------ */

interface DbOpRow {
  seq: number;
  id: string;
  type: string;
  payload: string;
  actor_id: string;
  actor_name: string;
  device_id: string;
  device_time: string;
  tz_offset_min: number;
  created_online: number;
  v: number;
  server_time: string;
  clock_skew_ms: number | null;
  status: 'applied' | 'rejected';
  error: string | null;
  flags: string;
  voided_by: string | null;
  review: LateReview | null;
  resolved_by: string | null;
}

/** An accepted late record counts as applied (its effects were applied by the decision). */
function rowToRecord(r: DbOpRow): OpRecord {
  return { op: rowToOp(r), status: r.review === 'accepted' ? 'applied' : r.status, voidedBy: r.voided_by, review: r.review ?? null, resolvedBy: r.resolved_by ?? null };
}

function rowToOp(r: DbOpRow): AnyOp {
  return {
    id: r.id,
    type: r.type,
    payload: JSON.parse(r.payload),
    actorId: r.actor_id,
    deviceId: r.device_id,
    deviceTime: r.device_time,
    tzOffsetMin: r.tz_offset_min,
    createdOnline: Boolean(r.created_online),
    v: r.v,
  } as AnyOp;
}

class PrefetchCtx implements EngineCtx {
  entities = new Map<string, unknown | null>();
  entityVer = new Map<string, number>();
  balances = new Map<string, number>();
  ops = new Map<string, OpRecord | null>();
  dbOps = new Map<string, DbOpRow>();

  missing = { entities: new Set<string>(), balances: new Set<string>(), ops: new Set<string>() };
  overlay = { entities: new Map<string, unknown>(), deltas: new Map<string, number>(), ops: new Map<string, OpRecord>() };

  get(key: string): unknown | undefined {
    if (this.overlay.entities.has(key)) return this.overlay.entities.get(key);
    if (this.entities.has(key)) return this.entities.get(key) ?? undefined;
    this.missing.entities.add(key);
    return undefined;
  }
  balance(acct: string, gt: string): number {
    const k = balanceKey(acct, gt);
    let base = this.balances.get(k);
    if (base === undefined) {
      this.missing.balances.add(k);
      base = 0;
    }
    return base + (this.overlay.deltas.get(k) ?? 0);
  }
  getOp(id: string): OpRecord | undefined {
    if (this.overlay.ops.has(id)) return this.overlay.ops.get(id);
    if (this.ops.has(id)) return this.ops.get(id) ?? undefined;
    this.missing.ops.add(id);
    return undefined;
  }

  reset() {
    this.overlay = { entities: new Map(), deltas: new Map(), ops: new Map() };
    this.missing = { entities: new Set(), balances: new Set(), ops: new Set() };
  }
  hasMissing() {
    return this.missing.entities.size + this.missing.balances.size + this.missing.ops.size > 0;
  }

  commit(op: AnyOp, effects: Effects) {
    for (const [k, v] of effects.writes) {
      // Every written entity's stored version must be known for the
      // concurrent-change check, even if the engine never read it.
      if (!this.entities.has(k)) this.missing.entities.add(k);
      this.overlay.entities.set(k, v);
    }
    for (const [k, d] of moveDeltas(effects.moves)) this.overlay.deltas.set(k, (this.overlay.deltas.get(k) ?? 0) + d);
    for (const v of effects.voids) {
      const t = this.getOp(v.targetId);
      if (t) this.overlay.ops.set(v.targetId, { ...t, voidedBy: v.voidOpId });
    }
    for (const r of effects.resolves) {
      const t = this.getOp(r.targetId);
      const accepted = r.decision === 'accept';
      if (t) this.overlay.ops.set(r.targetId, { ...t, status: accepted ? 'applied' : 'rejected', review: accepted ? 'accepted' : 'rejected', resolvedBy: r.resolveOpId });
    }
    this.overlay.ops.set(op.id, { op, status: 'applied', voidedBy: null });
  }
  reject(op: AnyOp, review: LateReview | null = null) {
    this.overlay.ops.set(op.id, { op, status: 'rejected', voidedBy: null, review });
  }

  async loadOps(env: Env, ids: string[]) {
    const want = ids.filter((id) => !this.ops.has(id));
    if (!want.length) return;
    const { results } = await env.DB.prepare('SELECT * FROM ops WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(want)).all<DbOpRow>();
    for (const id of want) this.ops.set(id, null);
    for (const r of results) {
      this.dbOps.set(r.id, r);
      this.ops.set(r.id, rowToRecord(r));
    }
  }

  async loadEntities(env: Env, keys: Iterable<string>) {
    const want = [...new Set(keys)].filter((k) => !this.entities.has(k));
    if (!want.length) return;
    const userIds = want.filter((k) => k.startsWith('user:')).map((k) => k.slice(5));
    const others = want.filter((k) => !k.startsWith('user:'));
    const stmts = [];
    if (others.length) stmts.push(env.DB.prepare('SELECT key, data, ver FROM entities WHERE key IN (SELECT value FROM json_each(?))').bind(JSON.stringify(others)));
    if (userIds.length) {
      stmts.push(env.DB.prepare('SELECT id, name, role, active, location_id FROM users WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(userIds)));
    }
    const res = await env.DB.batch(stmts);
    for (const k of want) this.entities.set(k, null);
    let i = 0;
    if (others.length) {
      for (const r of res[i++]!.results as { key: string; data: string; ver: number }[]) {
        this.entities.set(r.key, JSON.parse(r.data));
        this.entityVer.set(r.key, r.ver);
      }
    }
    if (userIds.length) {
      for (const r of res[i++]!.results as { id: string; name: string; role: UserRef['role']; active: number; location_id: string | null }[]) {
        this.entities.set(K.user(r.id), { id: r.id, name: r.name, role: r.role, active: Boolean(r.active), locationId: r.location_id } satisfies UserRef);
      }
    }
  }

  async loadBalances(env: Env, keys: Iterable<string>) {
    const want = [...new Set(keys)].filter((k) => !this.balances.has(k));
    if (!want.length) return;
    const pairs = want.map(splitBalanceKey);
    const { results } = await env.DB.prepare(
      `SELECT b.acct, b.gt, b.qty FROM json_each(?) j
         JOIN balances b ON b.acct = json_extract(j.value, '$[0]') AND b.gt = json_extract(j.value, '$[1]')`,
    )
      .bind(JSON.stringify(pairs))
      .all<{ acct: string; gt: string; qty: number }>();
    for (const k of want) this.balances.set(k, 0);
    for (const r of results) this.balances.set(balanceKey(r.acct, r.gt), r.qty);
  }

  async loadMissing(env: Env) {
    const m = this.missing;
    await this.loadOps(env, [...m.ops]);
    await this.loadEntities(env, m.entities);
    await this.loadBalances(env, m.balances);
  }
}

/* ------------------------------------------------------------------ */
/* Server-side flags about timing                                      */
/* ------------------------------------------------------------------ */

function businessDateOf(op: AnyOp): string | null {
  const p = op.payload as Record<string, unknown>;
  const d = p.workDate ?? p.date ?? null;
  return typeof d === 'string' ? d : null;
}

function timingFlags(op: AnyOp, skewMs: number | null, serverNowMs: number): Flag[] {
  const flags: Flag[] = [];
  if (skewMs !== null && Math.abs(skewMs) > SKEW_FLAG_MS) {
    flags.push({ code: 'CLOCK_SKEW', message: `Device clock was ${fmtDuration(skewMs)} ${skewMs > 0 ? 'behind' : 'ahead of'} the server.` });
  }
  const corrected = Date.parse(op.deviceTime) + (skewMs ?? 0);
  if (serverNowMs - corrected > LATE_SYNC_MS) {
    flags.push({ code: 'LATE_SYNC', message: `Recorded offline; reached the server ${fmtDuration(serverNowMs - corrected)} later.` });
  }
  const d = businessDateOf(op);
  if (d && op.type !== 'price.set' && op.type !== 'fx.set') {
    const diff = daysBetween(d, businessDate(corrected));
    if (diff > 1) flags.push({ code: 'BACKDATED', message: `Dated ${diff} days before it was entered.` });
    if (diff < -1) flags.push({ code: 'BACKDATED', message: `Dated ${-diff} days in the future.` });
  }
  return flags;
}

/* ------------------------------------------------------------------ */
/* Push                                                                */
/* ------------------------------------------------------------------ */

interface Outcome {
  op: AnyOp;
  ok: boolean;
  error: string | null;
  code: ErrorCode | null;
  /** Refused only because its sales day is closed: kept as a late record for a manager (ADR-004). */
  held: boolean;
  effects: Effects | null;
}

export async function push(env: Env, session: Session, request: Request): Promise<Response> {
  const body = (await readJson(request)) as { ops?: unknown; clientNow?: unknown };
  if (!Array.isArray(body.ops) || body.ops.length === 0) throw new HttpError(400, 'invalid_request', 'Nothing to upload.');
  if (body.ops.length > MAX_PUSH) throw new HttpError(400, 'too_many', `Upload at most ${MAX_PUSH} records at a time.`);
  const serverNowMs = Date.now();
  const clientNowMs = typeof body.clientNow === 'string' ? Date.parse(body.clientNow) : NaN;
  const skewMs = Number.isFinite(clientNowMs) ? serverNowMs - clientNowMs : null;

  const results: PushResult[] = new Array(body.ops.length);
  const items: { index: number; op: AnyOp }[] = [];
  const seen = new Set<string>();
  body.ops.forEach((raw, index) => {
    const r = parseOp(raw);
    const rawId = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : `#${index}`;
    if (!r.ok || !r.op) {
      results[index] = { id: rawId, status: 'rejected', seq: null, serverTime: null, error: r.error ?? 'Invalid record', flags: [], duplicate: false };
      return;
    }
    if (r.op.v > ENGINE_VERSION) {
      results[index] = { id: rawId, status: 'rejected', seq: null, serverTime: null, error: 'Server needs updating for this app version.', flags: [], duplicate: false };
      return;
    }
    if (seen.has(r.op.id)) {
      results[index] = { id: rawId, status: 'rejected', seq: null, serverTime: null, error: 'Sent twice in one upload.', flags: [], duplicate: true };
      return;
    }
    seen.add(r.op.id);
    items.push({ index, op: r.op });
  });

  if (items.length) {
    for (let attempt = 0; ; attempt++) {
      try {
        await processBatch(env, session, items, skewMs, serverNowMs, results);
        break;
      } catch (e) {
        if (e instanceof RetryConflict && attempt < 1) continue;
        if (e instanceof RetryConflict) throw new HttpError(503, 'busy', 'Another device was saving at the same moment. Try again.');
        throw e;
      }
    }
  }
  return json({ results, serverTime: new Date(serverNowMs).toISOString() });
}

async function processBatch(
  env: Env,
  session: Session,
  items: { index: number; op: AnyOp }[],
  skewMs: number | null,
  serverNowMs: number,
  results: PushResult[],
) {
  const actor: Actor = { id: session.user.id, caps: session.user.caps };
  const audit = session.user.caps.includes('audit.view');
  const ctx = new PrefetchCtx();

  // Round 0: duplicates and the records cancellations / decisions point at, then the entities they need.
  const opIds = new Set<string>();
  for (const { op } of items) {
    opIds.add(op.id);
    if (op.type === 'op.void' || op.type === 'op.resolve') opIds.add(op.payload.targetId);
    if (op.type === 'payment.allocate') opIds.add(op.payload.paymentId);
  }
  await ctx.loadOps(env, [...opIds]);
  const fresh = items.filter(({ op }) => !ctx.dbOps.has(op.id));
  const keys: string[] = [];
  for (const { op } of fresh) {
    keys.push(...prefetchKeys(op));
    if (op.type === 'op.void' || op.type === 'op.resolve') {
      const target = ctx.ops.get(op.payload.targetId);
      if (target) keys.push(...prefetchKeys(target.op));
    }
  }
  await ctx.loadEntities(env, keys);

  const simulate = (): Outcome[] => {
    ctx.reset();
    return fresh.map(({ op }) => {
      const r = applyOp(op, ctx, actor);
      if (r.ok) {
        ctx.commit(op, r.effects);
        return { op, ok: true, error: null, code: null, held: false, effects: r.effects };
      }
      const held = r.code === 'day_closed' && HOLDABLE.includes(op.type);
      ctx.reject(op, held ? 'waiting' : null);
      return { op, ok: false, error: r.error, code: r.code, held, effects: null };
    });
  };

  let outcomes = simulate();
  for (let round = 0; round < 4 && ctx.hasMissing(); round++) {
    await ctx.loadMissing(env);
    outcomes = simulate();
  }

  // Duplicates: return the original result.
  for (const { index, op } of items) {
    const row = ctx.dbOps.get(op.id);
    if (!row) continue;
    results[index] = {
      id: op.id,
      status: row.status,
      seq: row.seq,
      serverTime: row.server_time,
      error: row.error,
      flags: audit ? (JSON.parse(row.flags) as Flag[]) : [],
      duplicate: true,
      review: row.review ?? null,
    };
  }
  if (!fresh.length) return;

  const serverTime = new Date(serverNowMs).toISOString();
  const opRows = outcomes.map((o) => {
    let vis = o.effects?.vis ?? null;
    let subject = o.effects?.subjectId ?? null;
    if (!o.effects) {
      const about = subjectOf(o.op, (id) => ctx.getOp(id)?.op);
      if (about) ({ vis, subjectId: subject } = visibilityOf(about));
    }
    // A late record keeps the same timing evidence (clock, offline delay) as an accepted one.
    const flags = o.ok || o.held ? [...(o.effects?.flags ?? []), ...timingFlags(o.op, skewMs, serverNowMs)] : [];
    return {
      id: o.op.id,
      type: o.op.type,
      payload: JSON.stringify(o.op.payload),
      // Always the signed-in sender: a record claiming someone else's name is
      // rejected and logged against the person who actually sent it.
      actor_id: session.user.id,
      actor_name: session.user.name,
      device_id: o.op.deviceId,
      device_time: o.op.deviceTime,
      tz_offset_min: o.op.tzOffsetMin,
      created_online: o.op.createdOnline ? 1 : 0,
      v: o.op.v,
      server_time: serverTime,
      clock_skew_ms: skewMs,
      status: o.ok ? 'applied' : 'rejected',
      error: o.error,
      flags: JSON.stringify(flags),
      vis,
      subject_id: subject,
      review: o.held ? 'waiting' : null,
    };
  });

  const entityRows = [...ctx.overlay.entities].map(([key, data]) => ({
    k: key,
    kind: entityKind(key),
    data: JSON.stringify(data),
    ver: (ctx.entityVer.get(key) ?? 0) + 1,
  }));
  const balanceRows = [...ctx.overlay.deltas].filter(([, d]) => d !== 0).map(([k, d]) => [...splitBalanceKey(k), d]);
  const voidRows = outcomes.flatMap((o) => o.effects?.voids.map((v) => [v.targetId, v.voidOpId]) ?? []);

  const stmts = [
    env.DB.prepare(
      `INSERT INTO ops (id, type, payload, actor_id, actor_name, device_id, device_time, tz_offset_min, created_online, v,
                        server_time, clock_skew_ms, status, error, flags, vis, subject_id, review)
       SELECT json_extract(value, '$.id'), json_extract(value, '$.type'), json_extract(value, '$.payload'),
              json_extract(value, '$.actor_id'), json_extract(value, '$.actor_name'), json_extract(value, '$.device_id'),
              json_extract(value, '$.device_time'), json_extract(value, '$.tz_offset_min'), json_extract(value, '$.created_online'),
              json_extract(value, '$.v'), json_extract(value, '$.server_time'), json_extract(value, '$.clock_skew_ms'),
              json_extract(value, '$.status'), json_extract(value, '$.error'), json_extract(value, '$.flags'),
              json_extract(value, '$.vis'), json_extract(value, '$.subject_id'), json_extract(value, '$.review')
         FROM json_each(?) ORDER BY key`,
    ).bind(JSON.stringify(opRows)),
  ];
  if (entityRows.length) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO entities (key, kind, data, ver, updated_at)
         SELECT json_extract(value, '$.k'), json_extract(value, '$.kind'), json_extract(value, '$.data'), json_extract(value, '$.ver'), ?2
           FROM json_each(?1) WHERE true
         ON CONFLICT (key) DO UPDATE SET data = excluded.data, ver = excluded.ver, updated_at = excluded.updated_at
          WHERE entities.ver = excluded.ver - 1`,
      ).bind(JSON.stringify(entityRows), serverTime),
      // Abort the whole batch if any entity changed since it was read.
      env.DB.prepare('INSERT INTO guard (v) SELECT 1 WHERE changes() <> ?').bind(entityRows.length),
    );
  }
  if (balanceRows.length) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO balances (acct, gt, qty)
         SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]') FROM json_each(?) WHERE true
         ON CONFLICT (acct, gt) DO UPDATE SET qty = qty + excluded.qty`,
      ).bind(JSON.stringify(balanceRows)),
    );
  }
  if (voidRows.length) {
    stmts.push(
      env.DB.prepare(
        `UPDATE ops SET voided_by = (SELECT json_extract(j.value, '$[1]') FROM json_each(?1) j WHERE json_extract(j.value, '$[0]') = ops.id)
          WHERE id IN (SELECT json_extract(value, '$[0]') FROM json_each(?1))`,
      ).bind(JSON.stringify(voidRows)),
    );
  }
  const resolveRows = outcomes.flatMap((o) => o.effects?.resolves.map((r) => [r.targetId, r.decision === 'accept' ? 'accepted' : 'rejected', r.resolveOpId]) ?? []);
  if (resolveRows.length) {
    stmts.push(
      env.DB.prepare(
        `UPDATE ops SET review = (SELECT json_extract(j.value, '$[1]') FROM json_each(?1) j WHERE json_extract(j.value, '$[0]') = ops.id),
                        resolved_by = (SELECT json_extract(j.value, '$[2]') FROM json_each(?1) j WHERE json_extract(j.value, '$[0]') = ops.id)
          WHERE id IN (SELECT json_extract(value, '$[0]') FROM json_each(?1)) AND review = 'waiting'`,
      ).bind(JSON.stringify(resolveRows)),
      // Abort the whole batch if another device decided one of these late records meanwhile.
      env.DB.prepare('INSERT INTO guard (v) SELECT 1 WHERE changes() <> ?').bind(resolveRows.length),
    );
  }
  stmts.push(env.DB.prepare('SELECT id, seq FROM ops WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(fresh.map((f) => f.op.id))));

  let res;
  try {
    res = await env.DB.batch(stmts);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/CHECK constraint failed|UNIQUE constraint failed: ops\.id/i.test(msg)) throw new RetryConflict(msg);
    throw e;
  }
  const seqs = new Map((res[res.length - 1]!.results as { id: string; seq: number }[]).map((r) => [r.id, r.seq]));

  outcomes.forEach((o, i) => {
    const index = fresh[i]!.index;
    const flags = JSON.parse(opRows[i]!.flags) as Flag[];
    results[index] = {
      id: o.op.id,
      status: o.ok ? 'applied' : 'rejected',
      seq: seqs.get(o.op.id) ?? null,
      serverTime,
      error: o.error,
      flags: audit ? flags : [],
      duplicate: false,
      review: o.held ? 'waiting' : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Pull                                                                */
/* ------------------------------------------------------------------ */

const DIRECTORY_CAPS = ['workers.reconcile', 'audit.view', 'users.manage', 'costs.view'] as const;

/** Record types an app that predates sync protocol 2 cannot replay (see SYNC_PROTO). */
const PROTO2_TYPES = ['op.resolve', 'payment.allocate'];

export async function pull(env: Env, session: Session, url: URL): Promise<Response> {
  const since = Math.max(0, Math.floor(Number(url.searchParams.get('since') ?? '0')) || 0);
  const limit = Math.min(MAX_PULL, Math.max(1, Math.floor(Number(url.searchParams.get('limit') ?? MAX_PULL)) || MAX_PULL));
  const proto = Math.floor(Number(url.searchParams.get('proto') ?? '1')) || 1;
  const caps = session.user.caps;
  const audit = caps.includes('audit.view') ? 1 : 0;
  const classes = readableClasses(caps);
  const fullDirectory = DIRECTORY_CAPS.some((c) => caps.includes(c));

  // A late record is sent to the people who decide on it (whoever may read
  // its kind of record) and to the worker it is about, as well as its sender.
  const [maxRes, rowsRes, usersRes] = await env.DB.batch([
    env.DB.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM ops'),
    env.DB.prepare(
      `SELECT * FROM ops
        WHERE seq > ?1 AND (
              (vis IN (SELECT value FROM json_each(?2)) AND (status = 'applied' OR ?4 = 1 OR review IS NOT NULL))
           OR (subject_id = ?3 AND (status = 'applied' OR review IS NOT NULL)) OR actor_id = ?3
           OR (?4 = 1 AND status = 'rejected'))
          AND (?6 >= 2 OR type NOT IN (SELECT value FROM json_each(?7)))
        ORDER BY seq LIMIT ?5`,
    ).bind(since, JSON.stringify(classes), session.user.id, audit, limit, proto, JSON.stringify(PROTO2_TYPES)),
    fullDirectory
      ? env.DB.prepare('SELECT id, name, role, active, location_id FROM users ORDER BY name')
      : env.DB.prepare('SELECT id, name, role, active, location_id FROM users WHERE id = ?').bind(session.user.id),
  ]);
  const rows = rowsRes!.results as unknown as DbOpRow[];
  const maxSeq = (maxRes!.results[0] as { m: number } | undefined)?.m ?? 0;
  const more = rows.length === limit;
  const next = more ? rows[rows.length - 1]!.seq : Math.max(since, maxSeq);

  const s = JSON.stringify;
  // Stored payloads and flags are already JSON text; splice them in as-is.
  const opsJson = rows
    .map(
      (r) =>
        `{"seq":${r.seq},"id":${s(r.id)},"type":${s(r.type)},"payload":${r.payload},"actorId":${s(r.actor_id)},"actorName":${s(r.actor_name)},` +
        `"deviceId":${s(r.device_id)},"deviceTime":${s(r.device_time)},"tzOffsetMin":${r.tz_offset_min},"createdOnline":${r.created_online ? 'true' : 'false'},` +
        `"v":${r.v},"serverTime":${s(r.server_time)},"clockSkewMs":${audit && r.clock_skew_ms !== null ? r.clock_skew_ms : 'null'},` +
        `"status":${s(r.status)},"error":${s(r.error)},"flags":${audit ? r.flags : '[]'},"voidedBy":${s(r.voided_by)},` +
        `"review":${s(r.review ?? null)},"resolvedBy":${s(r.resolved_by ?? null)}}`,
    )
    .join(',');
  const directory = (usersRes!.results as { id: string; name: string; role: UserRef['role']; active: number; location_id: string | null }[]).map(
    (u): UserRef => ({ id: u.id, name: u.name, role: u.role, active: Boolean(u.active), locationId: u.location_id }),
  );
  return rawJson(
    `{"ops":[${opsJson}],"next":${next},"more":${more},"directory":${s(directory)},"me":${s(session.user)},"serverTime":${s(new Date().toISOString())}}`,
  );
}
