// Late records (ADR-004): worker records that reached the server after their
// sales day was closed. They are kept, not counted, until a manager accepts
// or rejects them. Pure helpers, so the screens, the reports and the tests
// read them the same way.

import type { OpRecord } from './engine';
import type { Ledger } from './ledger';
import { subjectOf, type LateReview } from './ops';

/** What is known about a record's trip to the server. */
export interface TripMeta {
  serverTime: string | null;
  clockSkewMs: number | null;
}

export interface LateRecord {
  rec: OpRecord;
  review: LateReview;
  /** The worker and sales day it is about (for a late cancellation, its target's). */
  workerId: string;
  workDate: string;
}

/** Late records, in the order they were saved on the device. */
export function lateRecords(ledger: Ledger, f: { review?: LateReview; workerId?: string; workDate?: string } = {}): LateRecord[] {
  const out: LateRecord[] = [];
  for (const rec of ledger.ops.values()) {
    if (!rec.review || (f.review && rec.review !== f.review)) continue;
    const p = subjectOf(rec.op, (id) => ledger.getOp(id)?.op)?.payload as { workerId?: string; workDate?: string } | undefined;
    if (!p?.workerId || !p.workDate) continue;
    if ((f.workerId && p.workerId !== f.workerId) || (f.workDate && p.workDate !== f.workDate)) continue;
    out.push({ rec, review: rec.review, workerId: p.workerId, workDate: p.workDate });
  }
  return out.sort((a, b) => a.rec.op.deviceTime.localeCompare(b.rec.op.deviceTime));
}

export interface LateEvidence {
  /** When it was saved, by the phone's clock. */
  savedAt: string;
  /** Server time minus phone time, measured when the phone uploaded (positive: the phone was behind). */
  skewMs: number | null;
  /** The phone's time corrected by that measured error. */
  correctedAt: string;
  reachedAt: string | null;
  /** The closing that had reached the server when this record arrived. */
  closing: OpRecord | null;
  closedAt: string | null;
  /** Saved before that closing reached the server, by the corrected phone clock. Evidence, not proof. */
  before: boolean | null;
}

export function lateEvidence(late: LateRecord, ledger: Ledger, meta: (id: string) => TripMeta | undefined): LateEvidence {
  const m = meta(late.rec.op.id);
  const skewMs = m?.clockSkewMs ?? null;
  const correctedMs = Date.parse(late.rec.op.deviceTime) + (skewMs ?? 0);
  const reachedAt = m?.serverTime ?? null;
  let closing: OpRecord | null = null;
  let closedAt: string | null = null;
  for (const r of ledger.ops.values()) {
    if (r.op.type !== 'worker.settle' || r.review) continue;
    if (r.op.payload.workerId !== late.workerId || r.op.payload.workDate !== late.workDate) continue;
    const at = meta(r.op.id)?.serverTime;
    if (!at || (reachedAt && at > reachedAt)) continue;
    if (!closedAt || at > closedAt) {
      closing = r;
      closedAt = at;
    }
  }
  return {
    savedAt: late.rec.op.deviceTime,
    skewMs,
    correctedAt: new Date(correctedMs).toISOString(),
    reachedAt,
    closing,
    closedAt,
    before: closedAt ? correctedMs < Date.parse(closedAt) : null,
  };
}
