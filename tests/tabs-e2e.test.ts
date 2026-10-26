// A normal sign-in on one of the person's own devices, across tabs and
// reloads (owner's request, 26 Oct 2026; AUTH_AND_RECOVERY §11): a reload or a
// link pasted into a new tab continues the person signed in in this browser
// instead of asking for the code again; Lock in one tab locks them all; with
// no tab signed in, or after the idle time, the code is asked as before; a
// session the server has ended is never continued. End to end: the real app
// store on an in-memory IndexedDB, talking through fetch to the real Worker.

import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { handle } from '../src/worker/index';
import type { Env } from '../src/worker/env';
import { createD1 } from './d1-shim';

vi.setConfig({ testTimeout: 30_000 });

const SETUP_TOKEN = 'setup-token-for-tests-123';
const env: Env & { DB: ReturnType<typeof createD1> } = { DB: createD1(), PIN_PEPPER: 'test-pepper-0123456789-abcdefghijklmnop', SETUP_TOKEN };
const n = (sql: string) => (env.DB.raw.prepare(sql).get() as { n: number }).n;
const logins = () => n("SELECT COUNT(*) AS n FROM auth_events WHERE kind IN ('login', 'login_ok', 'setup_owner')");
const sessions = () => n('SELECT COUNT(*) AS n FROM sessions');

/** A browser tab's sessionStorage: kept across a reload of that tab only. */
class TabStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

type AppStore = (typeof import('../src/client/lib/store'))['store'];
const open: AppStore[] = [];

/** A page load in a tab with the given tab storage (a new tab gets a new one). Same browser, same IndexedDB. */
async function page(storage: TabStorage): Promise<AppStore> {
  vi.stubGlobal('sessionStorage', storage);
  vi.resetModules();
  const s = (await import('../src/client/lib/store')).store;
  await s.boot();
  open.push(s);
  return s;
}

/** The page is gone (tab closed or reloaded): its timers and its line to the other tabs stop. */
function close(s: AppStore) {
  const old = s as unknown as { stopTimer(): void; epoch: number; channel: BroadcastChannel | null };
  old.stopTimer();
  old.epoch++;
  old.channel?.close();
}

beforeAll(() => {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  const events = { addEventListener: () => {}, removeEventListener: () => {} };
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', { ...events, visibilityState: 'hidden' });
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => handle(new Request(`https://mabubu.test${input}`, init), env));
});

afterAll(() => {
  for (const s of open) close(s);
});

describe('a normal sign-in continues across tabs and reloads of this browser', () => {
  const tabA = new TabStorage();
  let a: AppStore;

  it('first setup signs the owner in on this laptop', async () => {
    a = await page(tabA);
    expect(a.getSnapshot().phase).toBe('setup');
    await a.setup(SETUP_TOKEN, 'George', '470915');
    expect(a.getSnapshot().phase).toBe('ready');
    await a.syncNow();
  });

  it('a reload of the tab continues the sign-in: no code, no new session on the server', async () => {
    const before = { logins: logins(), sessions: sessions() };
    close(a);
    a = await page(tabA);
    expect(a.getSnapshot().phase).toBe('ready');
    expect(a.getSnapshot().user).toMatchObject({ name: 'George', role: 'owner' });
    expect(a.getSnapshot().user?.temporary).toBeFalsy();
    expect(a.getSnapshot().user?.caps).toContain('users.manage');
    await a.syncNow();
    expect(a.getSnapshot().sync.state).not.toBe('error');
    expect({ logins: logins(), sessions: sessions() }).toEqual(before);
  });

  it('a link pasted into a new tab opens signed in while another tab is signed in', async () => {
    const before = sessions();
    const b = await page(new TabStorage());
    expect(b.getSnapshot().phase).toBe('ready');
    expect(b.getSnapshot().user?.id).toBe(a.getSnapshot().user?.id);
    expect(sessions()).toBe(before);
    // Lock in the new tab locks this browser: the first tab too.
    b.lock();
    await vi.waitFor(() => expect(a.getSnapshot().phase).toBe('welcome'));
    close(b);
  });

  it('with no tab signed in, a new tab or a reload asks for the code', async () => {
    const c = await page(new TabStorage());
    expect(c.getSnapshot().phase).toBe('welcome');
    close(c);
    close(a);
    a = await page(tabA);
    expect(a.getSnapshot().phase).toBe('welcome');
    // The code still unlocks as always.
    expect(await a.unlock(a.getSnapshot().profiles[0]!, '470915')).toBeNull();
    expect(a.getSnapshot().phase).toBe('ready');
  });

  it('a reload after the idle time asks for the code', async () => {
    const mark = JSON.parse(tabA.getItem('mabubu.open')!) as { userId: string; at: number };
    tabA.setItem('mabubu.open', JSON.stringify({ ...mark, at: Date.now() - 21 * 60_000 }));
    close(a);
    a = await page(tabA);
    expect(a.getSnapshot().phase).toBe('welcome');
    expect(await a.unlock(a.getSnapshot().profiles[0]!, '470915')).toBeNull();
  });

  it('a session the server ended is never continued: the new tab finds out at once and both tabs go to sign-in', async () => {
    const { deviceDb } = await import('../src/client/lib/db');
    const saved = (await deviceDb.profiles.toArray()).find((p) => !p.demo)!;
    // Ended on the server (e.g. the owner signed this device out from another one).
    await handle(new Request('https://mabubu.test/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${saved.token}` }, body: '{}' }), env);
    const d = await page(new TabStorage());
    await d.syncNow();
    await vi.waitFor(() => expect(d.getSnapshot().phase).toBe('welcome'));
    await vi.waitFor(() => expect(a.getSnapshot().phase).toBe('welcome'));
    expect(d.getSnapshot().profiles.find((p) => p.userId === saved.userId)?.needsOnline).toBeTruthy();
    // Marked "sign in online": a further tab does not continue it either.
    close(d);
    const e = await page(new TabStorage());
    expect(e.getSnapshot().phase).toBe('welcome');
    close(e);
  });
});
