// The language choice is a device preference: asked once, remembered across
// restarts, changeable at any time, and never creates or re-sends records.

import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DEMO_USERS } from '../src/shared/demo-data';
import { vendorAccounts } from '../src/shared/queries';

const storage = new Map<string, string>();
type StoreModule = typeof import('../src/client/lib/store');

async function freshStore(): Promise<StoreModule['store']> {
  vi.resetModules();
  const { store } = await import('../src/client/lib/store');
  return store;
}

beforeAll(() => {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  const events = { addEventListener: () => {}, removeEventListener: () => {} };
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', { ...events, visibilityState: 'visible', documentElement: { lang: '' } });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('offline in tests');
  });
});

describe('language preference on this device', () => {
  it('is unset on first use, so the app asks once', async () => {
    const store = await freshStore();
    expect(store.getSnapshot().prefs.lang).toBeNull();
  });

  it('is remembered after closing and reopening the app', async () => {
    let store = await freshStore();
    store.setPrefs({ lang: 'fr' });
    expect(JSON.parse(storage.get('mabubu.prefs')!).lang).toBe('fr');
    store = await freshStore();
    expect(store.getSnapshot().prefs.lang).toBe('fr');
    store.setPrefs({ lang: 'sw' });
    store = await freshStore();
    expect(store.getSnapshot().prefs.lang).toBe('sw');
  });

  it('ignores a damaged stored value and asks again', async () => {
    storage.set('mabubu.prefs', JSON.stringify({ lang: 'xx', theme: 'dark' }));
    const store = await freshStore();
    expect(store.getSnapshot().prefs.lang).toBeNull();
    expect(store.getSnapshot().prefs.theme).toBe('dark');
  });

  it('switching language creates no record, queues nothing to sync and changes no balance', async () => {
    const store = await freshStore();
    await store.boot();
    await store.openDemo(DEMO_USERS[0]!);
    await vi.waitFor(() => expect(store.getSnapshot().sync.pending).toBe(0), { timeout: 3000 });
    const before = store.getSnapshot();
    const recs = before.records.size;
    const ops = before.ledger.ops.size;
    const balances = JSON.stringify(vendorAccounts(before.ledger));
    for (const lang of ['fr', 'sw', 'en', 'fr'] as const) store.setPrefs({ lang });
    const after = store.getSnapshot();
    expect(after.records.size).toBe(recs);
    expect(after.ledger.ops.size).toBe(ops);
    expect(after.sync.pending).toBe(0);
    expect(JSON.stringify(vendorAccounts(after.ledger))).toBe(balances);
  });
});
