// When the browser gives the app no IndexedDB at all (some private windows,
// storage switched off), the app must say so instead of hanging on "Opening…".
// No fake-indexeddb here on purpose: this file runs without IndexedDB.

import { describe, expect, it, vi } from 'vitest';

describe('storage unavailable', () => {
  it('boot ends on an explanation, not a stuck opening screen', async () => {
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
