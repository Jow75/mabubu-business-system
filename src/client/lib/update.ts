// A new version of the app has taken over (the service worker skips waiting).
// The page still runs the old code, so it must reload — but never under
// someone's fingers while they type a count: if the page is in the background
// it reloads at once; otherwise a bar offers "Reload", and it reloads by itself
// the next time the person leaves the app. Records are already saved on the
// device, so a reload never loses one.

import { useSyncExternalStore } from 'react';

let ready = false;
const listeners = new Set<() => void>();

export function onNewVersion() {
  if (document.visibilityState === 'hidden') {
    location.reload();
    return;
  }
  ready = true;
  for (const l of listeners) l();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') location.reload();
  });
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
