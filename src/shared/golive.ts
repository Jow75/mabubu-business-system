// Go-live cutover (ADR-005): which records are the business's real set-up and
// which are test activity. Pure, shared by the server (which decides) and the
// app (which shows the same preview). See docs/GO_LIVE_CUTOVER.md.
//
//   kept       places, size groups, vendors, garments, selling prices, settings
//   owner's    recorded exchange rates — they may be real rates the family
//   choice     received, or test entries; the owner decides keep or remove
//   removed    everything else: purchases, payments, allocations, shipments and
//              their costs, stock adjustments (opening stock included),
//              expenses, worker takes / returns / closings / reviews
//   follows    a cancellation (op.void) or a late-record decision (op.resolve)
//   its target goes with the record it is about
//
// People, devices, sessions and the sign-in log are not records in this
// ledger and are never touched by the cutover.

import type { OpType } from './ops';

/** Typed exactly by the owner on the final confirmation screen. */
export const GOLIVE_PHRASE = 'GO LIVE';
/** The ledger id every app holds before any cutover. */
export const INITIAL_LEDGER = 'initial';
/** A pre-cutover backup older than this must be made again. */
export const BACKUP_MAX_AGE_MS = 6 * 3600_000;
/** An app that has not reported in this long counts as "not known" in the readiness check. */
export const DEVICE_STALE_MS = 24 * 3600_000;

export const KEEP_TYPES: readonly OpType[] = ['location.upsert', 'size.upsert', 'vendor.upsert', 'garment.upsert', 'price.set', 'settings.set'];
export const DECIDE_TYPES: readonly OpType[] = ['fx.set'];
const FOLLOWS_TARGET: readonly OpType[] = ['op.void', 'op.resolve'];

export type Category = 'keep' | 'remove' | 'decide';
export type FxDecision = 'keep' | 'remove';

export function baseCategory(type: string): Category {
  if ((KEEP_TYPES as readonly string[]).includes(type)) return 'keep';
  if ((DECIDE_TYPES as readonly string[]).includes(type)) return 'decide';
  return 'remove';
}

export interface PlanRow {
  id: string;
  type: string;
  /** For op.void / op.resolve: the record it is about. */
  targetId?: string | null;
}

export interface TypeCount {
  type: string;
  category: Category;
  count: number;
}

export interface CutoverPlan {
  keep: string[];
  remove: string[];
  /** Records whose fate still needs the owner's decision (rates, until decided). */
  undecided: string[];
  byType: TypeCount[];
}

/**
 * Sort every record into kept / removed / undecided. A cancellation or a
 * decision follows the record it is about (and is removed if that record is
 * unknown), so nothing kept ever points at a removed record.
 */
export function planCutover(rows: readonly PlanRow[], fx: FxDecision | null): CutoverPlan {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const categoryOf = (r: PlanRow, depth = 0): Category => {
    if ((FOLLOWS_TARGET as readonly string[]).includes(r.type)) {
      const target = r.targetId ? byId.get(r.targetId) : undefined;
      return target && depth < 8 ? categoryOf(target, depth + 1) : 'remove';
    }
    return baseCategory(r.type);
  };
  const plan: CutoverPlan = { keep: [], remove: [], undecided: [], byType: [] };
  const counts = new Map<string, TypeCount>();
  for (const r of rows) {
    const c = categoryOf(r);
    const key = `${r.type}|${c}`;
    const tc = counts.get(key) ?? { type: r.type, category: c, count: 0 };
    tc.count++;
    counts.set(key, tc);
    const resolved = c === 'decide' ? fx : c;
    if (resolved === 'keep') plan.keep.push(r.id);
    else if (resolved === 'remove') plan.remove.push(r.id);
    else plan.undecided.push(r.id);
  }
  plan.byType = [...counts.values()].sort((a, b) => a.category.localeCompare(b.category) || a.type.localeCompare(b.type));
  return plan;
}

/* ------------------------------------------------------------------ */
/* Contracts between the app and the server                            */
/* ------------------------------------------------------------------ */

export type CheckStatus = 'ok' | 'warn' | 'block';
export interface ReadinessCheck {
  key: 'backup' | 'unsent' | 'unknown_devices' | 'rebuild' | 'approvals';
  status: CheckStatus;
  /** Plain-English detail (the app shows its own translated sentence per key). */
  detail: string;
  n?: number;
}

export interface DeviceReadiness {
  code: string;
  label: string;
  people: string[];
  lastSyncAt: string | null;
  pending: number | null;
  state: 'ok' | 'unsent' | 'unknown';
}

export interface BackupInfo {
  sha256: string;
  at: string;
  ops: number;
  maxSeq: number;
}

export interface CutoverRecord {
  id: string;
  at: string;
  actorName: string;
  ledger: string;
  backupSha256: string;
  backupAt: string;
  scope: { fx: FxDecision; kept: number; removed: number; byType: TypeCount[] };
  result: { opsAfter: number; entitiesAfter: number; balancesAfter: number; archived: number };
}

export interface GoLivePreview {
  phase: 'pre_release';
  fingerprint: { ops: number; maxSeq: number };
  byType: TypeCount[];
  kept: { places: string[]; sizes: string[]; vendors: string[]; garments: string[]; prices: number; settings: boolean };
  rates: string[];
  people: { name: string; role: string; active: boolean }[];
  devices: DeviceReadiness[];
  checks: ReadinessCheck[];
  backup: BackupInfo | null;
}

export type GoLiveStatus = GoLivePreview | { phase: 'live'; cutover: CutoverRecord | null };

export interface GoLiveExecuteRequest {
  pin: string;
  phrase: string;
  fx: FxDecision;
  backupSha256: string;
  fingerprint: { ops: number; maxSeq: number };
  /** The owner has read that some devices have not reported recently and accepts it. */
  acceptUnknownDevices: boolean;
}
