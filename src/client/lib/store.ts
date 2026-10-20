// The app's state: who is signed in, their local operation log, the ledger
// rebuilt from it, and the sync loop that exchanges operations with the
// server. Components subscribe through useApp().

import { useSyncExternalStore } from 'react';
import { Ledger } from '../../shared/ledger';
import { ENGINE_VERSION, parseOp, type AnyOp, type Flag, type OpType, type PayloadOf } from '../../shared/ops';
import type { Capability } from '../../shared/permissions';
import { canSee } from '../../shared/visibility';
import type { LoginResponse, PullResponse, PushResponse, SessionUser } from '../../shared/api';
import type { UserRef } from '../../shared/model';
import { uuidv7 } from '../../shared/ids';
import { isLang, type Lang } from '../../shared/i18n';
import { api, ApiError } from './api';
import { UserDb, deviceDb, kvGet, kvSet, userDbName, type DeviceRecord, type LocalOp, type Profile } from './db';
import { checkVerifier, getDevice, makeVerifier } from './device';

export type Phase = 'boot' | 'setup' | 'welcome' | 'ready';
export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'demo';

export interface SyncInfo {
  state: SyncState;
  lastSyncAt: string | null;
  lastError: string | null;
  pending: number;
  rejected: number;
}

export interface Prefs {
  localCount: boolean;
  scope: string | null;
  theme: 'system' | 'light' | 'dark';
  /** Interface language chosen on this device; null until the person picks one. */
  lang: Lang | null;
}

export interface Snapshot {
  phase: Phase;
  device: DeviceRecord | null;
  profiles: Profile[];
  user: SessionUser | null;
  demo: boolean;
  ledger: Ledger;
  records: Map<string, LocalOp>;
  directory: UserRef[];
  sync: SyncInfo;
  prefs: Prefs;
  online: boolean;
  version: number;
  firstRun: boolean;
  persisted: boolean | null;
  /** Name and code carried from the "new device" screen into owner recovery. */
  recoverFor: { name: string; pin: string } | null;
  /** The browser refused local storage (private window, storage blocked). */
  storageError: boolean;
}

export type SubmitResult = { ok: true; op: AnyOp; flags: Flag[] } | { ok: false; error: string };

const PREFS_KEY = 'mabubu.prefs';
const DEMO_DB = 'mabubu-demo';
const PUSH_BATCH = 25;
const SYNC_INTERVAL_MS = 30_000;

function loadPrefs(): Prefs {
  const d: Prefs = { localCount: false, scope: null, theme: 'system', lang: null };
  try {
    const p = { ...d, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>) };
    return { ...p, lang: isLang(p.lang) ? p.lang : null };
  } catch {
    return d;
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: preferences just won't persist */
  }
}

/** Mirrors the server's download filter, used to show a role's real view in demo mode. */
export function visibleTo(rec: LocalOp, user: SessionUser, records: Map<string, LocalOp>): boolean {
  return canSee(rec.op, rec.status, user, (id) => records.get(id)?.op);
}

class Store {
  private snap: Snapshot = {
    phase: 'boot',
    device: null,
    profiles: [],
    user: null,
    demo: false,
    ledger: new Ledger(),
    records: new Map(),
    directory: [],
    sync: { state: 'idle', lastSyncAt: null, lastError: null, pending: 0, rejected: 0 },
    prefs: loadPrefs(),
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    version: 0,
    firstRun: false,
    persisted: null,
    recoverFor: null,
    storageError: false,
  };
  private listeners = new Set<() => void>();
  private db: UserDb | null = null;
  private profile: Profile | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private syncing: Promise<void> | null = null;
  private syncAgain = false;
  /**
   * Bumped whenever the signed-in session changes (open, lock, demo). Work that
   * started under an older session — a sync still waiting on a slow network —
   * must not write its person, records or profile into the new one.
   */
  private epoch = 0;
  private kick: ReturnType<typeof setTimeout> | null = null;
  private localOrder = 0;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch, version: this.snap.version + 1 };
    for (const l of this.listeners) l();
  }

  /* ---------------- boot & profiles ---------------- */

  async boot() {
    window.addEventListener('online', () => {
      this.set({ online: true });
      this.requestSync();
    });
    window.addEventListener('offline', () => this.set({ online: false, sync: { ...this.snap.sync, state: this.snap.demo ? 'demo' : 'offline' } }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.requestSync();
    });
    let device: DeviceRecord;
    let profiles: Profile[];
    try {
      device = await getDevice();
      profiles = await this.loadProfiles();
    } catch {
      // Without IndexedDB there is nowhere to keep this device's identity or
      // any record, so say so instead of hanging on the opening screen.
      this.set({ storageError: true, phase: 'welcome' });
      return;
    }
    // Ask to keep this device's storage as early as possible, before anyone
    // signs in. The device identity and the signed-in profile live only in
    // IndexedDB; if the browser evicts it, the device becomes unrecognised and
    // the owner is pushed back through setup. Requesting persistence at first
    // boot makes that eviction far less likely. (Some browsers only grant it
    // after real use, so we ask again after sign-in too.)
    void this.requestPersistence();
    let phase: Phase = 'welcome';
    if (!profiles.some((p) => !p.demo) && navigator.onLine) {
      try {
        const s = await api<{ needsSetup: boolean }>('GET', '/setup/status');
        if (s.needsSetup) phase = 'setup';
      } catch {
        /* offline or server unreachable: show the sign-in screen */
      }
    }
    this.set({ device, profiles, phase });
  }

  private async loadProfiles() {
    return (await deviceDb.profiles.toArray()).sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  }

  /** `recoverFor` carries the owner's name and verified code into recovery. */
  goTo(phase: 'setup' | 'welcome', recoverFor: { name: string; pin: string } | null = null) {
    this.set({ phase, recoverFor });
  }

  /* ---------------- sign-in ---------------- */

  /** Unlock a profile already on this device; falls back to online sign-in. */
  async unlock(profile: Profile, pin: string): Promise<LoginResponse | null> {
    if (profile.demo) {
      return this.openDemo(profile.user);
    }
    if (profile.verifier && profile.token && !profile.needsOnline) {
      if (await checkVerifier(pin, profile.verifier)) {
        await this.open({ ...profile, failedUnlocks: 0, lastUsedAt: new Date().toISOString() });
        return null;
      }
      const failed = profile.failedUnlocks + 1;
      const updated: Profile = { ...profile, failedUnlocks: failed, ...(failed >= 5 ? { verifier: null, needsOnline: 'Too many wrong codes on this device.' } : {}) };
      await deviceDb.profiles.put(updated);
      this.set({ profiles: await this.loadProfiles() });
      throw new ApiError(401, 'invalid', failed >= 5 ? 'Too many wrong codes. Connect to the internet and sign in again.' : `Wrong code. ${5 - failed} tries left on this device.`);
    }
    return this.signIn(profile.name, pin);
  }

  async signIn(name: string, pin: string): Promise<LoginResponse> {
    const device = this.snap.device ?? (await getDevice());
    const res = await api<LoginResponse>('POST', '/auth/login', {
      name,
      pin,
      deviceId: device.deviceId,
      deviceSecret: device.deviceSecret,
      deviceLabel: device.label,
    });
    if (res.status === 'ok') await this.afterOnlineAuth(res, pin);
    return res;
  }

  async setup(setupToken: string, name: string, pin: string) {
    const device = this.snap.device ?? (await getDevice());
    const res = await api<LoginResponse>('POST', '/setup', { setupToken, name, pin, deviceId: device.deviceId, deviceSecret: device.deviceSecret, deviceLabel: device.label });
    if (res.status === 'ok') {
      await this.afterOnlineAuth(res, pin);
      // Only show the starter setup while the business has no records: owner
      // recovery on a business with data must never re-seed places and size
      // groups — that is what produced the duplicate reference data. The server
      // decides (`starterNeeded`), which also lets a first setup that was
      // interrupted before anything was saved finish its starter step.
      this.set({ recoverFor: null, ...(res.starterNeeded ?? res.created ? { firstRun: true } : {}) });
    }
  }

  private async afterOnlineAuth(res: Extract<LoginResponse, { status: 'ok' }>, pin: string) {
    const profile: Profile = {
      userId: res.user.id,
      name: res.user.name,
      role: res.user.role,
      user: res.user,
      token: res.token,
      expiresAt: res.expiresAt,
      verifier: await makeVerifier(pin),
      failedUnlocks: 0,
      lastUsedAt: new Date().toISOString(),
      needsOnline: null,
      demo: false,
    };
    await deviceDb.profiles.put(profile);
    await this.open(profile);
    void this.requestPersistence();
  }

  private async requestPersistence() {
    try {
      const persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
      this.set({ persisted });
    } catch {
      this.set({ persisted: false });
    }
  }

  private async open(profile: Profile) {
    const epoch = ++this.epoch;
    await deviceDb.profiles.put(profile);
    if (epoch !== this.epoch) return;
    this.profile = profile;
    this.db = new UserDb(userDbName(profile.userId, false));
    const [records, directory, profiles] = await Promise.all([this.db.ops.toArray(), kvGet<UserRef[]>(this.db, 'directory'), this.loadProfiles()]);
    if (epoch !== this.epoch) return;
    const map = new Map(records.map((r) => [r.id, r]));
    this.localOrder = records.reduce((m, r) => Math.max(m, r.localOrder), 0);
    const dir = directory ?? [{ id: profile.user.id, name: profile.user.name, role: profile.user.role, active: true, locationId: profile.user.locationId }];
    this.set({
      phase: 'ready',
      user: profile.user,
      demo: false,
      records: map,
      directory: dir,
      ledger: this.rebuild(map, dir, profile.user),
      profiles,
      sync: { ...this.snap.sync, state: navigator.onLine ? 'idle' : 'offline', lastError: null, ...this.counts(map) },
    });
    if (this.snap.persisted === null) void this.requestPersistence();
    this.startTimer();
    this.requestSync(50);
  }

  lock() {
    const epoch = ++this.epoch;
    this.stopTimer();
    this.db?.close();
    this.db = null;
    this.profile = null;
    void this.loadProfiles()
      .catch(() => [] as Profile[])
      .then((profiles) => {
        // Someone may already have signed in again; do not undo that.
        if (epoch === this.epoch) this.set({ phase: 'welcome', user: null, demo: false, records: new Map(), ledger: new Ledger(), directory: [], firstRun: false, profiles });
      });
  }

  /** Records this person saved on this device that have not reached the server. */
  async unsentCount(userId: string): Promise<number> {
    const p = await deviceDb.profiles.get(userId);
    if (!p || p.demo) return 0;
    const db = new UserDb(userDbName(userId, false));
    try {
      return await db.ops.where('status').equals('pending').count();
    } finally {
      db.close();
    }
  }

  /**
   * Sign out on the server and forget this person on this device. This deletes
   * their local copy, including records not yet sent — the screen asks first
   * (see `unsentCount`).
   */
  async removeProfile(userId: string) {
    const p = await deviceDb.profiles.get(userId);
    if (!p) return;
    // End the session first, so a sync still running for this person cannot
    // write the profile back after it is deleted.
    if (this.profile?.userId === userId) this.lock();
    if (p.token && !p.demo) {
      try {
        await api('POST', '/auth/logout', {}, p.token);
      } catch {
        /* already signed out or offline — the local copy is removed anyway */
      }
    }
    await deviceDb.profiles.delete(userId);
    if (!p.demo) await new UserDb(userDbName(userId, false)).delete();
    this.set({ profiles: await this.loadProfiles() });
  }


  dismissFirstRun() {
    this.set({ firstRun: false });
  }

  /* ---------------- projection ---------------- */

  private counts(records: Map<string, LocalOp>) {
    let pending = 0;
    let rejected = 0;
    for (const r of records.values()) {
      if (r.status === 'pending') pending++;
      else if (r.status === 'rejected' && r.op.actorId === this.snap.user?.id) rejected++;
    }
    return { pending, rejected };
  }

  private rebuild(records: Map<string, LocalOp>, directory: UserRef[], user: SessionUser): Ledger {
    const L = new Ledger();
    L.setUsers(directory);
    const all = [...records.values()];
    const visible = this.snap.demo ? all.filter((r) => visibleTo(r, user, records)) : all;
    const applied = visible.filter((r) => r.status === 'applied').sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    for (const r of applied) {
      const res = L.apply(r.op, null);
      if (!res.ok) {
        console.warn('Replay skipped', r.op.type, r.op.id, res.error);
        L.recordRejected(r.op);
      }
    }
    const actor = { id: user.id, caps: user.caps };
    for (const r of visible.filter((x) => x.status === 'pending').sort((a, b) => a.localOrder - b.localOrder)) {
      const res = L.apply(r.op, actor, 'pending');
      if (!res.ok) L.recordRejected(r.op);
    }
    for (const r of visible) if (r.status === 'rejected' && !L.ops.has(r.id)) L.recordRejected(r.op);
    return L;
  }

  private refresh(records: Map<string, LocalOp>, extra: Partial<Snapshot> = {}) {
    const user = this.snap.user;
    if (!user) return;
    const directory = extra.directory ?? this.snap.directory;
    this.set({ records, ledger: this.rebuild(records, directory, user), sync: { ...this.snap.sync, ...this.counts(records) }, ...extra });
  }

  /* ---------------- creating records ---------------- */

  can(cap: Capability) {
    return Boolean(this.snap.user?.caps.includes(cap));
  }

  /** Validate, save on this device, apply, then sync in the background. */
  async submit<T extends OpType>(type: T, payload: PayloadOf<T>): Promise<SubmitResult> {
    const user = this.snap.user;
    const device = this.snap.device;
    if (!user || !device || !this.db) return { ok: false, error: 'Not signed in.' };
    const parsed = parseOp({
      id: uuidv7(),
      type,
      payload,
      actorId: user.id,
      deviceId: device.deviceId,
      deviceTime: new Date().toISOString(),
      tzOffsetMin: -new Date().getTimezoneOffset(),
      createdOnline: navigator.onLine,
      v: ENGINE_VERSION,
    });
    if (!parsed.ok || !parsed.op) return { ok: false, error: parsed.error ?? 'Invalid entry.' };
    const op = parsed.op;
    const check = this.snap.ledger.check(op, { id: user.id, caps: user.caps });
    if (!check.ok) return { ok: false, error: check.error };

    const rec: LocalOp = {
      id: op.id,
      op,
      status: 'pending',
      seq: null,
      serverTime: null,
      actorName: user.name,
      clockSkewMs: null,
      error: null,
      flags: check.effects.flags,
      localOrder: ++this.localOrder,
    };
    await this.db.ops.put(rec); // saved on the device before we say "saved"
    const records = new Map(this.snap.records);
    records.set(rec.id, rec);
    this.snap.ledger.apply(op, { id: user.id, caps: user.caps }, 'pending');
    this.set({ records, sync: { ...this.snap.sync, ...this.counts(records) } });
    this.requestSync(300);
    return { ok: true, op, flags: check.effects.flags };
  }

  /** Drop a rejected record from this device after the person has seen it. */
  async dismissRejected(id: string) {
    const rec = this.snap.records.get(id);
    if (!rec || rec.status !== 'rejected' || !this.db) return;
    await this.db.ops.delete(id);
    const records = new Map(this.snap.records);
    records.delete(id);
    this.refresh(records);
  }

  /* ---------------- sync ---------------- */

  requestSync(delay = 0) {
    if (this.kick) clearTimeout(this.kick);
    this.kick = setTimeout(() => void this.syncNow(), delay);
  }

  private startTimer() {
    this.stopTimer();
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.syncNow();
    }, SYNC_INTERVAL_MS);
  }
  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async syncNow(): Promise<void> {
    if (this.syncing) {
      // A sync is running, but it chose what to upload before this request
      // (for example a record saved a moment ago). Run once more after it.
      this.syncAgain = true;
      return this.syncing;
    }
    if (!this.snap.user || !this.db) return;
    if (this.snap.demo) return this.demoSync();
    if (!navigator.onLine) {
      this.set({ online: false, sync: { ...this.snap.sync, state: 'offline' } });
      return;
    }
    this.syncing = this.doSync().finally(() => {
      this.syncing = null;
      if (this.syncAgain) {
        this.syncAgain = false;
        this.requestSync(0);
      }
    });
    return this.syncing;
  }

  private async doSync() {
    const db = this.db!;
    const profile = this.profile!;
    const token = profile.token;
    const epoch = this.epoch;
    const stale = () => epoch !== this.epoch;
    this.set({ sync: { ...this.snap.sync, state: 'syncing' } });
    try {
      // `records` is this sync's working copy, taken now. Anything saved while
      // the sync runs is not in it, so the end of the sync merges only what the
      // sync itself changed (`touched`) into the then-current records.
      const records = new Map(this.snap.records);
      const touched = new Map<string, LocalOp>();
      let changed = false;

      // 1. Upload records saved on this device.
      const pending = [...records.values()].filter((r) => r.status === 'pending').sort((a, b) => a.localOrder - b.localOrder);
      for (let i = 0; i < pending.length; i += PUSH_BATCH) {
        const chunk = pending.slice(i, i + PUSH_BATCH);
        const res = await api<PushResponse>('POST', '/sync/push', { ops: chunk.map((r) => r.op), clientNow: new Date().toISOString() }, token);
        // Uploaded records stay uploaded (the server ignores a repeat); if the
        // person changed meanwhile, stop here without touching the new session.
        if (stale()) return;
        const updates: LocalOp[] = [];
        res.results.forEach((r, idx) => {
          const local = chunk[idx];
          if (!local || r.id !== local.id) return;
          updates.push({ ...local, status: r.status, seq: r.seq, serverTime: r.serverTime, error: r.error, flags: r.flags.length ? r.flags : local.flags });
        });
        await db.ops.bulkPut(updates);
        for (const u of updates) {
          records.set(u.id, u);
          touched.set(u.id, u);
        }
        changed = true;
      }

      // 2. Download everything new since the last sync.
      let since = (await kvGet<number>(db, 'since')) ?? 0;
      let directory = this.snap.directory;
      let me = this.snap.user!;
      let newFromServer = false;
      for (let page = 0; page < 200; page++) {
        const res = await api<PullResponse>('GET', `/sync/pull?since=${since}`, undefined, token);
        if (stale()) return;
        const incoming: LocalOp[] = res.ops.map((o) => {
          const { seq, serverTime, actorName, clockSkewMs, status, error, flags, voidedBy: _v, ...op } = o;
          const existing = records.get(o.id);
          if (!existing) newFromServer = true;
          return {
            id: o.id,
            op: op as AnyOp,
            status,
            seq,
            serverTime,
            actorName,
            clockSkewMs,
            error,
            flags,
            localOrder: existing?.localOrder ?? 0,
          };
        });
        if (incoming.length) {
          await db.ops.bulkPut(incoming);
          for (const r of incoming) {
            records.set(r.id, r);
            touched.set(r.id, r);
          }
          changed = true;
        }
        since = res.next;
        directory = res.directory;
        me = res.me;
        await kvSet(db, 'since', since);
        await kvSet(db, 'directory', directory);
        if (!res.more) break;
      }

      if (stale()) return;
      if (JSON.stringify(me) !== JSON.stringify(this.snap.user)) {
        const updated = { ...profile, user: me, name: me.name, role: me.role };
        await deviceDb.profiles.put(updated);
        if (stale()) return;
        this.profile = updated;
      }
      const merged = new Map(this.snap.records);
      for (const [id, r] of touched) merged.set(id, r);
      const syncInfo: SyncInfo = { state: 'idle', lastSyncAt: new Date().toISOString(), lastError: null, ...this.counts(merged) };
      const directoryChanged = JSON.stringify(directory) !== JSON.stringify(this.snap.directory);
      const meChanged = JSON.stringify(me) !== JSON.stringify(this.snap.user);
      if (newFromServer || directoryChanged || meChanged) {
        this.set({ user: me, directory });
        this.refresh(merged, { sync: syncInfo, online: true });
      } else if (changed) {
        // Only our own records changed state; keep the current projection.
        for (const r of touched.values()) {
          const lr = this.snap.ledger.ops.get(r.id);
          if (lr && r.status === 'applied' && lr.status === 'pending') this.snap.ledger.ops.set(r.id, { ...lr, status: 'applied' });
        }
        if ([...touched.values()].some((r) => r.status === 'rejected' && this.snap.records.get(r.id)?.status === 'pending')) {
          this.refresh(merged, { sync: syncInfo, online: true });
        } else this.set({ records: merged, sync: syncInfo, online: true });
      } else this.set({ sync: syncInfo, online: true });
    } catch (e) {
      if (stale()) return;
      const err = e instanceof ApiError ? e : new ApiError(500, 'error', String(e));
      if (err.status === 401) {
        await this.sessionEnded(err.message);
        return;
      }
      this.set({ sync: { ...this.snap.sync, state: err.offline ? 'offline' : 'error', lastError: err.message }, online: !err.offline });
    }
  }

  private async sessionEnded(message: string) {
    if (!this.profile) return;
    const p: Profile = { ...this.profile, token: null, needsOnline: message };
    await deviceDb.profiles.put(p);
    this.profile = p;
    this.set({ sync: { ...this.snap.sync, state: 'error', lastError: `${message} Your saved records stay on this device until you sign in again.` } });
    this.lock();
  }

  /* ---------------- demo mode ---------------- */

  async openDemo(user: SessionUser): Promise<null> {
    const epoch = ++this.epoch;
    const { seedDemo, DEMO_USERS } = await import('./demo');
    if (epoch !== this.epoch) return null;
    this.db = new UserDb(DEMO_DB);
    if (!(await kvGet<boolean>(this.db, 'seeded'))) await seedDemo(this.db);
    const records = new Map((await this.db.ops.toArray()).map((r) => [r.id, r]));
    this.localOrder = [...records.values()].reduce((m, r) => Math.max(m, r.localOrder), 0);
    const directory = DEMO_USERS.map((u) => ({ id: u.id, name: u.name, role: u.role, active: true, locationId: u.locationId }));
    const profile: Profile = {
      userId: user.id,
      name: user.name,
      role: user.role,
      user,
      token: null,
      expiresAt: null,
      verifier: null,
      failedUnlocks: 0,
      lastUsedAt: new Date().toISOString(),
      needsOnline: null,
      demo: true,
    };
    this.profile = profile;
    this.snap = { ...this.snap, demo: true, user };
    const dir = user.caps.some((c) => ['workers.reconcile', 'audit.view', 'users.manage', 'costs.view'].includes(c)) ? directory : directory.filter((d) => d.id === user.id);
    this.set({
      phase: 'ready',
      user,
      demo: true,
      records,
      directory: dir,
      ledger: this.rebuild(records, dir, user),
      sync: { state: 'demo', lastSyncAt: null, lastError: null, ...this.counts(records) },
    });
    return null;
  }

  private async demoSync() {
    if (!this.db) return;
    const records = new Map(this.snap.records);
    const pending = [...records.values()].filter((r) => r.status === 'pending');
    if (!pending.length) return;
    let seq = [...records.values()].reduce((m, r) => Math.max(m, r.seq ?? 0), 0);
    const now = new Date().toISOString();
    const updates = pending.sort((a, b) => a.localOrder - b.localOrder).map((r) => ({ ...r, status: 'applied' as const, seq: ++seq, serverTime: now, clockSkewMs: 0 }));
    await this.db.ops.bulkPut(updates);
    for (const u of updates) records.set(u.id, u);
    this.refresh(records, { sync: { state: 'demo', lastSyncAt: now, lastError: null, pending: 0, rejected: 0 } });
  }

  async resetDemo() {
    const db = new UserDb(DEMO_DB);
    await db.delete();
    this.lock();
  }

  /* ---------------- preferences ---------------- */

  setPrefs(patch: Partial<Prefs>) {
    const prefs = { ...this.snap.prefs, ...patch };
    savePrefs(prefs);
    this.set({ prefs });
  }

  get token() {
    return this.profile?.token ?? null;
  }
}

export const store = new Store();

export function useApp(): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
