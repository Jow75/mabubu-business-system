// In-memory state built by replaying operations through the engine.
// Devices rebuild it from their local operation log; tests use it directly.

import { applyOp, moveDeltas, type Actor, type ApplyResult, type EngineCtx, type OpRecord } from './engine';
import type { AnyOp, Flag, LateReview } from './ops';
import { K, balanceKey, entityKind, type Move, type Posting, type UserRef } from './model';

export interface OpEffectsRecord {
  moves: Move[];
  postings: Posting[];
  flags: Flag[];
}

export class Ledger implements EngineCtx {
  entities = new Map<string, unknown>();
  balances = new Map<string, number>();
  ops = new Map<string, OpRecord>();
  effects = new Map<string, OpEffectsRecord>();
  postings: Posting[] = [];
  /** Applied operation ids in application order. */
  order: string[] = [];

  get(key: string): unknown | undefined {
    return this.entities.get(key);
  }
  balance(acct: string, gt: string): number {
    return this.balances.get(balanceKey(acct, gt)) ?? 0;
  }
  getOp(id: string): OpRecord | undefined {
    return this.ops.get(id);
  }

  setUsers(users: readonly UserRef[]) {
    for (const key of [...this.entities.keys()]) if (key.startsWith('user:')) this.entities.delete(key);
    for (const u of users) this.entities.set(K.user(u.id), u);
  }

  /** Validate and, if valid, commit an operation. */
  apply(op: AnyOp, actor: Actor | null, status: OpRecord['status'] = 'applied'): ApplyResult {
    const r = applyOp(op, this, actor);
    if (r.ok) this.commit(op, r, status);
    return r;
  }

  /** Check an operation without changing state. */
  check(op: AnyOp, actor: Actor | null): ApplyResult {
    return applyOp(op, this, actor);
  }

  private commit(op: AnyOp, r: Extract<ApplyResult, { ok: true }>, status: OpRecord['status']) {
    const e = r.effects;
    for (const [k, v] of e.writes) this.entities.set(k, v);
    for (const [k, d] of moveDeltas(e.moves)) {
      const next = (this.balances.get(k) ?? 0) + d;
      if (next === 0) this.balances.delete(k);
      else this.balances.set(k, next);
    }
    this.postings.push(...e.postings);
    for (const v of e.voids) {
      const target = this.ops.get(v.targetId);
      if (target) this.ops.set(v.targetId, { ...target, voidedBy: v.voidOpId });
    }
    // A decided late record: accepted ones now count (their effects are this
    // decision's), rejected ones stay refused.
    for (const r of e.resolves) {
      const target = this.ops.get(r.targetId);
      const accepted = r.decision === 'accept';
      if (target) this.ops.set(r.targetId, { ...target, status: accepted ? 'applied' : 'rejected', review: accepted ? 'accepted' : 'rejected', resolvedBy: r.resolveOpId });
    }
    this.ops.set(op.id, { op, status, voidedBy: null });
    this.effects.set(op.id, { moves: e.moves, postings: e.postings, flags: e.flags });
    this.order.push(op.id);
  }

  /** Record a rejected operation (kept for the activity log, no effects), or a late record waiting for / decided by a manager. */
  recordRejected(op: AnyOp, late?: { review?: LateReview | null; resolvedBy?: string | null }) {
    this.ops.set(op.id, { op, status: 'rejected', voidedBy: null, review: late?.review ?? null, resolvedBy: late?.resolvedBy ?? null });
  }

  list<T>(kind: string): T[] {
    const out: T[] = [];
    for (const [k, v] of this.entities) if (entityKind(k) === kind) out.push(v as T);
    return out;
  }
}
