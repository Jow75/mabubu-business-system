// A new version of the app must reach every device, but never reload the page
// under someone's fingers (src/client/lib/update.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type UpdateModule = typeof import('../src/client/lib/update');

let reloads = 0;
let visibility: 'visible' | 'hidden' = 'visible';
const handlers = new Set<() => void>();

beforeEach(() => {
  reloads = 0;
  visibility = 'visible';
  handlers.clear();
  vi.stubGlobal('document', {
    get visibilityState() {
      return visibility;
    },
    addEventListener: (type: string, fn: () => void) => type === 'visibilitychange' && handlers.add(fn),
    removeEventListener: (_type: string, fn: () => void) => handlers.delete(fn),
  });
  vi.stubGlobal('location', { reload: () => void reloads++ });
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const setVisibility = (v: 'visible' | 'hidden') => {
  visibility = v;
  for (const fn of [...handlers]) fn();
};
const load = (): Promise<UpdateModule> => import('../src/client/lib/update');

describe('a new version takes over safely', () => {
  it('in the background with nothing in progress: reloads at once', async () => {
    const u = await load();
    visibility = 'hidden';
    u.onNewVersion();
    expect(reloads).toBe(1);
  });

  it('on screen: waits for the person (the Reload bar), then reloads when the app is left', async () => {
    const u = await load();
    u.onNewVersion();
    expect(reloads).toBe(0);
    setVisibility('hidden');
    expect(reloads).toBe(1);
  });

  it('a code being typed or a form open holds it; it reloads only once the work is done and the app is left again', async () => {
    const u = await load();
    const typing = u.holdReload();
    const form = u.holdReload();
    u.onNewVersion();
    setVisibility('hidden');
    expect(reloads).toBe(0);
    setVisibility('visible');
    typing();
    typing(); // releasing twice counts once
    setVisibility('hidden');
    expect(reloads).toBe(0);
    setVisibility('visible');
    form();
    setVisibility('hidden');
    expect(reloads).toBe(1);
  });

  it('on the sign-in screen it takes over at once, so a code is never typed into the old version; digits being typed hold it', async () => {
    const u = await load();
    let signInScreen = true;
    u.setQuietScreen(() => signInScreen);
    u.onNewVersion();
    expect(reloads).toBe(1); // nothing typed yet: straight to the new version

    vi.resetModules();
    reloads = 0;
    handlers.clear();
    const w = await load();
    w.setQuietScreen(() => signInScreen);
    const typing = w.holdReload();
    w.onNewVersion();
    expect(reloads).toBe(0); // the code being typed is kept
    typing();
    setVisibility('hidden');
    expect(reloads).toBe(1);

    // Signed in and on screen: the Reload bar waits for the person, as before.
    vi.resetModules();
    reloads = 0;
    const v = await load();
    signInScreen = false;
    v.setQuietScreen(() => signInScreen);
    setVisibility('visible');
    v.onNewVersion();
    expect(reloads).toBe(0);
    expect(v.BUILD_STAMP).toBe('2026-10-26 00:00 UTC');
  });

  it('records of a temporary sign-in that exist only in the page hold it too', async () => {
    const u = await load();
    let unsent = true;
    u.setReloadGuard(() => unsent);
    visibility = 'hidden';
    u.onNewVersion();
    expect(reloads).toBe(0);
    unsent = false;
    setVisibility('visible');
    setVisibility('hidden');
    expect(reloads).toBe(1);
  });

  it('an app left open asks the server for a new version when it comes back into view, and every hour on screen', async () => {
    vi.useFakeTimers();
    const u = await load();
    const update = vi.fn(() => Promise.resolve());
    u.watchForUpdates({ update } as unknown as ServiceWorkerRegistration);
    setVisibility('hidden');
    setVisibility('visible');
    expect(update).not.toHaveBeenCalled(); // just checked when it opened
    vi.advanceTimersByTime(11 * 60_000);
    setVisibility('hidden');
    setVisibility('visible');
    expect(update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60 * 60_000);
    expect(update).toHaveBeenCalledTimes(2);
    // Offline: the check fails quietly and is tried again later.
    update.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    vi.advanceTimersByTime(60 * 60_000);
    expect(update).toHaveBeenCalledTimes(3);
  });
});
