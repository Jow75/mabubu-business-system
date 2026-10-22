// When the browser gives the app no IndexedDB at all (some private windows,
// storage switched off), the app must say so instead of hanging on "Opening…".
// No fake-indexeddb here on purpose: this file runs without IndexedDB.

import { describe, expect, it, vi } from 'vitest';

describe('storage unavailable', () => {
  // The app store is imported inside the test, and transforming it takes a few
  // seconds on a busy machine (the boot itself takes well under 100 ms), so
  // allow more than the 5 s default, as the other store tests do.
  it('boot ends on an explanation, not a stuck opening screen', { timeout: 30_000 }, async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
    const events = { addEventListener: () => {}, removeEventListener: () => {} };
    vi.stubGlobal('window', events);
    vi.stubGlobal('document', { ...events, visibilityState: 'visible' });
    const fetchSpy = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchSpy);
    const { store } = await import('../src/client/lib/store');
    await store.boot();
    const s = store.getSnapshot();
    expect(s.storageError).toBe(true);
    expect(s.phase).not.toBe('boot');
    expect(s.device).toBeNull();
  });
});
