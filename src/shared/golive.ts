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
// People and devices are not records in this ledger. Since 26 Oct 2026 (the
// owner's request) the cutover also clears access left over from testing —
// see planAccess below: the business keeps its active people and the devices
// approved for them; archived test people and every other device leave
// People & devices (hidden and blocked, never deleted), every temporary
// sign-in and every session on a removed device ends, and waiting device
// requests are closed. The security sign-in log is never emptied.

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

/* ------------------------------------------------------------------ */
/* Access left over from testing (amended 26 Oct 2026)                 */
/* ------------------------------------------------------------------ */

export interface AccessInput {
  users: { id: string; name: string; role: string; active: boolean; removed: boolean }[];
  devices: { id: string; code: string; label: string; revoked: boolean; retired: boolean; removed: boolean; lastSeenAt: string | null }[];
  access: { deviceId: string; userId: string; status: string }[];
  /** Sessions not ended yet. */
  sessions: { userId: string; deviceId: string; temporary: boolean }[];
  /** Records that stay in the ledger, by who made them and on which device. */
  keptByActor: Map<string, number>;
  keptByDevice: Map<string, number>;
  /** Records moved to the trial archive, likewise. */
  trialByActor: Map<string, number>;
  trialByDevice: Map<string, number>;
}

/** keep: stays as it is. remove: out of People & devices (hidden, cannot sign in; the row is kept). archived: stays archived and listed, because kept records name them. */
export type PersonFate = 'keep' | 'remove' | 'archived';
export interface AccessPerson {
  id: string;
  name: string;
  role: string;
  active: boolean;
  fate: PersonFate;
  keptRecords: number;
  trialRecords: number;
}
export interface AccessDevice {
  id: string;
  code: string;
  label: string;
  /** What it is today. */
  state: 'in_use' | 'blocked' | 'retired' | 'not_in_use';
  /** Kept people approved on it today. */
  people: string[];
  lastSeenAt: string | null;
  fate: 'keep' | 'remove';
  /** Kept records made on it: why its row stays (hidden), never deleted. */
  keptRecords: number;
  trialRecords: number;
  openSessions: number;
}
export interface AccessPlan {
  people: AccessPerson[];
  devices: AccessDevice[];
  /** Sessions that end: every temporary sign-in, everything on a removed device, everything of someone not kept active. */
  sessionsEnded: number;
  temporaryEnded: number;
  /** Device requests still waiting: closed (refused). */
  requestsClosed: number;
  /** Approvals withdrawn: on removed devices, or for people not kept. */
  approvalsWithdrawn: number;
}

/**
 * Who and what the real business keeps. A person is kept when active. A
 * device is kept when it is neither blocked nor retired and at least one kept
 * person is approved on it: the business's current phones and computers.
 * Everything else leaves People & devices. Nothing is deleted: a removed row
 * stays (hidden) for the trial archive, the records that name it and the
 * security log.
 */
export function planAccess(x: AccessInput): AccessPlan {
  const present = x.users.filter((u) => !u.removed);
  const kept = new Set(present.filter((u) => u.active).map((u) => u.id));
  const nameOf = new Map(x.users.map((u) => [u.id, u.name]));
  const people: AccessPerson[] = present.map((u) => {
    const keptRecords = x.keptByActor.get(u.id) ?? 0;
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      active: u.active,
      fate: u.active ? 'keep' : keptRecords > 0 ? 'archived' : 'remove',
      keptRecords,
      trialRecords: x.trialByActor.get(u.id) ?? 0,
    };
  });
  const devices: AccessDevice[] = x.devices
    .filter((d) => !d.removed)
    .map((d) => {
      const approved = x.access.filter((a) => a.deviceId === d.id && a.status === 'approved' && kept.has(a.userId)).map((a) => a.userId);
      const anyone = x.access.some((a) => a.deviceId === d.id && (a.status === 'approved' || a.status === 'pending'));
      const state: AccessDevice['state'] = d.retired ? 'retired' : d.revoked ? 'blocked' : anyone ? 'in_use' : 'not_in_use';
      return {
        id: d.id,
        code: d.code,
        label: d.label,
        state,
        people: approved.map((id) => nameOf.get(id) ?? id).sort(),
        lastSeenAt: d.lastSeenAt,
        fate: !d.revoked && !d.retired && approved.length > 0 ? 'keep' : 'remove',
        keptRecords: x.keptByDevice.get(d.id) ?? 0,
        trialRecords: x.trialByDevice.get(d.id) ?? 0,
        openSessions: x.sessions.filter((s) => s.deviceId === d.id).length,
      };
    });
  const removedDevices = new Set(devices.filter((d) => d.fate === 'remove').map((d) => d.id));
  return {
    people,
    devices,
    sessionsEnded: x.sessions.filter((s) => s.temporary || removedDevices.has(s.deviceId) || !kept.has(s.userId)).length,
    temporaryEnded: x.sessions.filter((s) => s.temporary).length,
    requestsClosed: x.access.filter((a) => a.status === 'pending').length,
    approvalsWithdrawn: x.access.filter((a) => a.status === 'approved' && (removedDevices.has(a.deviceId) || !kept.has(a.userId))).length,
  };
}

export interface AccessChoice {
  keepPeople: string[];
  keepDevices: string[];
  removePeople: string[];
  removeDevices: string[];
}

/** What the owner saw and confirmed; the server refuses the cutover if it no longer matches. */
export function accessChoice(plan: AccessPlan): AccessChoice {
  const ids = (xs: { id: string; fate: string }[], fate: string) =>
    xs
      .filter((x) => x.fate === fate)
      .map((x) => x.id)
      .sort();
  return { keepPeople: ids(plan.people, 'keep'), keepDevices: ids(plan.devices, 'keep'), removePeople: ids(plan.people, 'remove'), removeDevices: ids(plan.devices, 'remove') };
}

export function sameChoice(a: AccessChoice, b: AccessChoice): boolean {
  const k = (c: AccessChoice) => JSON.stringify([[...c.keepPeople].sort(), [...c.keepDevices].sort(), [...c.removePeople].sort(), [...c.removeDevices].sort()]);
  return k(a) === k(b);
}

/** One recorded exchange rate, as the owner sees it before deciding. */
export interface RateEntry {
  id: string;
  date: string;
  from: string;
  to: string;
  rate: string;
  basis: 'actual' | 'market' | 'manual';
  source: string;
}

export interface CutoverRecord {
  id: string;
  at: string;
  actorName: string;
  ledger: string;
  backupSha256: string;
  backupAt: string;
  scope: {
    fx: FxDecision;
    kept: number;
    removed: number;
    byType: TypeCount[];
    /** Since 26 Oct 2026; absent on a cutover made before. */
    access?: { keptPeople: number; removedPeople: number; keptDevices: number; removedDevices: number; sessionsEnded: number; requestsClosed: number; approvalsWithdrawn: number };
  };
  result: { opsAfter: number; entitiesAfter: number; balancesAfter: number; archived: number };
}

export interface GoLivePreview {
  phase: 'pre_release';
  fingerprint: { ops: number; maxSeq: number };
  byType: TypeCount[];
  kept: { places: string[]; sizes: string[]; vendors: string[]; garments: string[]; prices: number; settings: boolean };
  rates: string[];
  /** Every recorded exchange rate (fx.set), one row each. */
  rateEntries: RateEntry[];
  people: { name: string; role: string; active: boolean }[];
  /** People, devices, sessions and requests after go live. */
  access: AccessPlan;
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
  /** The people and devices kept and removed, exactly as shown in the preview. */
  access: AccessChoice;
}
