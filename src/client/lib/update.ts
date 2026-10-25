// A new version of the app has taken over (the service worker skips waiting).
// The page still runs the old code, so it must reload — but never under
// someone's fingers: a bar offers "Reload", and otherwise it reloads by itself
// the next time the person leaves the app with nothing in progress. "In
// progress" means a code being typed, an open form or sheet, or a temporary
// sign-in whose unsent records live only in this page (ADR-006). Records the
// app saved are on the device already, so a reload never loses one of those.
//
// An app left open for days must still notice new versions: moving between
// screens never asks the server, so it checks when the app comes back into
// view and every hour while it is on screen.

import { useEffect, useSyncExternalStore } from 'react';

let ready = false;
let holds = 0;
let unsafe: () => boolean = () => false;
const listeners = new Set<() => void>();

/** What a reload would lose that the app has not saved (see store.reloadUnsafe). */
export function setReloadGuard(fn: () => boolean) {
  unsafe = fn;
}

function safeNow(): boolean {
  return holds === 0 && !unsafe();
}

function reloadIfLeft() {
  if (document.visibilityState === 'hidden' && safeNow()) location.reload();
}

export function onNewVersion() {
  if (document.visibilityState === 'hidden' && safeNow()) {
    location.reload();
    return;
  }
  ready = true;
  for (const l of listeners) l();
  document.addEventListener('visibilitychange', reloadIfLeft);
}

/** Work in progress: a new version waits until the returned function is called. */
export function holdReload(): () => void {
  holds++;
  let held = true;
  return () => {
    if (held) holds--;
    held = false;
  };
}

/** While `active` (a code being typed, a form or sheet open), a new version waits for the person. */
export function useHoldReload(active: boolean) {
  useEffect(() => (active ? holdReload() : undefined), [active]);
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => ready,
    () => ready,
  );
}

const CHECK_EVERY_MS = 60 * 60_000;
const CHECK_ON_RETURN_MS = 10 * 60_000;

/** Ask the server for a new version when the app comes back into view (at most every 10 minutes) and every hour on screen. */
export function watchForUpdates(registration: ServiceWorkerRegistration) {
  let last = Date.now();
  const check = () => {
    last = Date.now();
    registration.update().catch(() => undefined); // offline: next time
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - last > CHECK_ON_RETURN_MS) check();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') check();
  }, CHECK_EVERY_MS);
}
