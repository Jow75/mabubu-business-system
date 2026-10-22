// Local storage (IndexedDB via Dexie).
//
// - One device database: this device's identity and the people who have
//   signed in on it (session token + an offline unlock check for their code).
// - One database per person: their operation log and sync position. Keeping
//   people apart means a worker signing in on the family laptop never loads
//   the owner's cached records.

import Dexie, { type Table } from 'dexie';
import type { AnyOp, Flag, LateReview } from '../../shared/ops';
import type { SessionUser } from '../../shared/api';
import type { UserRef } from '../../shared/model';

export interface DeviceRecord {
  key: 'device';
  deviceId: string;
  deviceSecret: string;
  label: string;
  createdAt: string;
}

export interface PinVerifier {
  salt: string;
  hash: string;
  iterations: number;
}

export interface Profile {
  userId: string;
  name: string;
  role: SessionUser['role'];
  user: SessionUser;
  token: string | null;
  expiresAt: string | null;
  verifier: PinVerifier | null;
  failedUnlocks: number;
  lastUsedAt: string;
  /** Set when the server ended the session; an online sign-in is needed. */
  needsOnline: string | null;
  demo: boolean;
}

export class DeviceDb extends Dexie {
  kv!: Table<DeviceRecord, string>;
  profiles!: Table<Profile, string>;
  constructor() {
    super('mabubu-device');
    this.version(1).stores({ kv: 'key', profiles: 'userId, lastUsedAt' });
  }
}

export interface LocalOp {
  id: string;
  op: AnyOp;
  status: 'pending' | 'applied' | 'rejected';
  seq: number | null;
  serverTime: string | null;
  actorName: string;
  clockSkewMs: number | null;
  error: string | null;
  flags: Flag[];
  /** Local insertion order for records not yet on the server. */
  localOrder: number;
  /** A late record: reached the server after its day was closed; waiting for, or decided by, a manager. */
  review?: LateReview | null;
  /** The manager's decision record (op.resolve). */
  resolvedBy?: string | null;
}

export interface UserKv {
  key: string;
  value: unknown;
}

export class UserDb extends Dexie {
  ops!: Table<LocalOp, string>;
  kv!: Table<UserKv, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ ops: 'id, status, seq, localOrder', kv: 'key' });
  }
}

export const deviceDb = new DeviceDb();

export function userDbName(userId: string, demo: boolean) {
  return demo ? `mabubu-demo-${userId}` : `mabubu-u-${userId}`;
}

export async function kvGet<T>(db: UserDb, key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined;
}
export async function kvSet(db: UserDb, key: string, value: unknown) {
  await db.kv.put({ key, value });
}

export type { UserRef };
