// Local storage (IndexedDB via Dexie).
//
// - One device database: this device's identity and the people who have
//   signed in on it (session token + an offline unlock check for their code).
// - One database per person: their operation log and sync position. Keeping
//   people apart means a worker signing in on the family laptop never loads
//   the owner's cached records.
// - A temporary owner sign-in (ADR-006) keeps its copy in memory instead
//   (MemoryRecordsDb): nothing of the business is written to a shared or
//   public computer's disk, and closing the tab leaves nothing behind.

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
  /** A temporary owner sign-in (ADR-006): never stored in the device database. */
  temporary?: boolean;
  /** The server says this person may no longer sign in on this device; kept only while records here are unsent. */
  blocked?: boolean;
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

/** What the store needs from one person's copy of the records, on disk (UserDb) or in memory (MemoryRecordsDb). */
export interface RecordsDb {
  ops: {
    toArray(): Promise<LocalOp[]>;
    put(rec: LocalOp): Promise<unknown>;
    bulkPut(recs: LocalOp[]): Promise<unknown>;
    delete(id: string): Promise<void>;
    clear(): Promise<void>;
    where(index: 'status'): { equals(value: LocalOp['status']): { toArray(): Promise<LocalOp[]>; count(): Promise<number> } };
  };
  kv: { get(key: string): Promise<UserKv | undefined>; put(item: UserKv): Promise<unknown> };
  /** Run reads and writes as one unit (one IndexedDB transaction). */
  atomic<T>(fn: () => Promise<T>): Promise<T>;
  close(): void;
}

export class UserDb extends Dexie implements RecordsDb {
  ops!: Table<LocalOp, string>;
  kv!: Table<UserKv, string>;
  constructor(name: string) {
    // "Strict": a write is finished only once it is on the disk, so a record
    // or a draft survives the laptop or phone losing power right afterwards
    // (Chrome's default may still hold it in the system's cache).
    super(name, { chromeTransactionDurability: 'strict' });
    this.version(1).stores({ ops: 'id, status, seq, localOrder', kv: 'key' });
  }
  atomic<T>(fn: () => Promise<T>): Promise<T> {
    return this.transaction('rw', this.ops, this.kv, fn);
  }
}

/**
 * A copy of the records that lives only in this page (temporary sign-in,
 * ADR-006). Values are cloned on the way in and out, as IndexedDB would.
 */
export class MemoryRecordsDb implements RecordsDb {
  private rows = new Map<string, LocalOp>();
  private values = new Map<string, UserKv>();
  private withStatus = (status: LocalOp['status']) => [...this.rows.values()].filter((r) => r.status === status);
  ops: RecordsDb['ops'] = {
    toArray: async () => [...this.rows.values()].map((r) => structuredClone(r)),
    put: async (rec) => void this.rows.set(rec.id, structuredClone(rec)),
    bulkPut: async (recs) => {
      for (const r of recs) this.rows.set(r.id, structuredClone(r));
    },
    delete: async (id) => void this.rows.delete(id),
    clear: async () => this.rows.clear(),
    where: () => ({
      equals: (status) => ({
        toArray: async () => this.withStatus(status).map((r) => structuredClone(r)),
        count: async () => this.withStatus(status).length,
      }),
    }),
  };
  kv: RecordsDb['kv'] = {
    get: async (key) => {
      const v = this.values.get(key);
      return v ? structuredClone(v) : undefined;
    },
    put: async (item) => void this.values.set(item.key, structuredClone(item)),
  };
  atomic<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
  close() {}
}

export const deviceDb = new DeviceDb();

export function userDbName(userId: string, demo: boolean) {
  return demo ? `mabubu-demo-${userId}` : `mabubu-u-${userId}`;
}

export async function kvGet<T>(db: RecordsDb, key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined;
}
export async function kvSet(db: RecordsDb, key: string, value: unknown) {
  await db.kv.put({ key, value });
}

export type { UserRef };
