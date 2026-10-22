// Request/response contracts between the app and the server.

import type { Capability, Role } from './permissions';
import type { AnyOp, Flag, LateReview } from './ops';
import type { UserRef } from './model';

/**
 * Sync protocol spoken by this app. 2 = understands late records and payment
 * allocations: the server sends op.resolve and payment.allocate records only to
 * clients that ask with `proto=2`, so an older app still in a phone's cache
 * never meets a record type it cannot replay.
 */
export const SYNC_PROTO = 2;

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  caps: Capability[];
  locationId: string | null;
}

export interface DeviceIdentity {
  deviceId: string;
  deviceSecret: string;
  deviceLabel: string;
}

export interface LoginRequest extends DeviceIdentity {
  name: string;
  pin: string;
}

export interface SetupRequest extends DeviceIdentity {
  setupToken: string;
  name: string;
  pin: string;
}

export type LoginResponse =
  // `created` is set only by /setup: true on genuine first-time owner creation,
  // false on owner recovery. `starterNeeded` is also set only by /setup: true
  // when the business has no records at all yet (first creation, or a first
  // setup that was interrupted before the starter places were saved). The
  // client shows the starter-setup screen only when it is true.
  | { status: 'ok'; token: string; expiresAt: string; user: SessionUser; created?: boolean; starterNeeded?: boolean }
  // `role` is returned only after the code was verified, so the app can tell an
  // owner (who can recover with the setup key) from a worker (who must wait).
  | { status: 'pending'; deviceCode: string; userName: string; role: Role };

/** Error body returned with a non-2xx status. */
export interface ApiErrorBody {
  error: string;
  message: string;
  attemptsLeft?: number;
  retryAfterSec?: number;
}

export interface PushRequest {
  ops: unknown[];
  /** Device clock when the upload was sent, used to measure clock skew. */
  clientNow: string;
}

export interface PushResult {
  id: string;
  status: 'applied' | 'rejected';
  seq: number | null;
  serverTime: string | null;
  error: string | null;
  flags: Flag[];
  duplicate: boolean;
  /** 'waiting': refused because its day was closed, kept for a manager's decision (a late record). */
  review?: LateReview | null;
}

export interface PushResponse {
  results: PushResult[];
  serverTime: string;
}

export type PulledOp = AnyOp & {
  seq: number;
  serverTime: string;
  actorName: string;
  clockSkewMs: number | null;
  status: 'applied' | 'rejected';
  error: string | null;
  flags: Flag[];
  voidedBy: string | null;
  review: LateReview | null;
  resolvedBy: string | null;
};

export interface PullResponse {
  ops: PulledOp[];
  next: number;
  more: boolean;
  directory: UserRef[];
  me: SessionUser;
  serverTime: string;
}

export interface PersonRow {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  locationId: string | null;
  grants: string[];
  revokes: string[];
  caps: Capability[];
  failedCount: number;
  lockedUntil: string | null;
  hardLocked: boolean;
  pinSetAt: string;
  createdAt: string;
}

export interface DeviceAccessRow {
  userId: string;
  status: 'pending' | 'approved' | 'denied' | 'revoked';
  requestedAt: string;
  decidedAt: string | null;
}

export interface DeviceRow {
  id: string;
  code: string;
  label: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  /** Set when the device has been permanently retired (kept for history, cannot sign in). */
  retiredAt: string | null;
  access: DeviceAccessRow[];
}

export interface PeopleResponse {
  people: PersonRow[];
  devices: DeviceRow[];
}

export interface CreatePersonRequest {
  name: string;
  role: Role;
  pin: string;
  locationId: string | null;
  grants: string[];
  revokes: string[];
  /** Approve this person on the device the owner is using right now. */
  allowOnDeviceId: string | null;
}

export interface UpdatePersonRequest {
  name?: string;
  role?: Role;
  active?: boolean;
  locationId?: string | null;
  grants?: string[];
  revokes?: string[];
}

export interface AuthEventRow {
  id: number;
  at: string;
  kind: string;
  userId: string | null;
  actorId: string | null;
  deviceId: string | null;
  ip: string | null;
  detail: Record<string, unknown>;
}

export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export interface MarketRatesResponse {
  rates: import('./fx').MarketRates;
  /** true when the provider's promised update time has passed without a successful refresh. */
  stale: boolean;
  /** true when the server fetched these from the provider during this request. */
  refreshedNow: boolean;
  /** Why the last refresh failed, if it did. */
  lastError: string | null;
}

export interface ExportLogRequest {
  report: import('./report-catalog').ReportId;
  format: import('./report-catalog').ExportFormat;
  rows: number;
  filters: string;
}
