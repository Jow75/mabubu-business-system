// Installing Mabubu as an app on this device (Chrome and Edge on Windows,
// Chrome on Android). Only the browser's own install flow is used: the
// Install button appears only after the browser has offered an install
// (`beforeinstallprompt`), so it can never be a button that does nothing.
// The installed app is the same site — same account, same records, same
// server; nothing is copied and no second database is made.

import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
  /** The browser has offered an install that our button can open. */
  canInstall: boolean;
  /** This page is running as the installed app (its own window), not in a browser tab. */
  installed: boolean;
}

let offer: BeforeInstallPromptEvent | null = null;
let state: InstallState = { canInstall: false, installed: false };
const listeners = new Set<() => void>();
const emit = (patch: Partial<InstallState>) => {
  state = { ...state, ...patch };
  for (const l of listeners) l();
};

function runningInstalled(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return ['standalone', 'window-controls-overlay', 'minimal-ui'].some((m) => window.matchMedia(`(display-mode: ${m})`).matches);
}

/** Start listening before the first render, so the browser's offer is not missed. */
export function watchInstall() {
  if (typeof window === 'undefined') return;
  state = { ...state, installed: runningInstalled() };
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep the offer for our own, quieter button instead of the browser's banner.
    e.preventDefault();
    offer = e as BeforeInstallPromptEvent;
    emit({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    emit({ canInstall: false });
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => emit({ installed: runningInstalled() }));
}

/** Open the browser's own install dialog. The browser allows this once per offer. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = offer;
  if (!e) return 'unavailable';
  offer = null;
  emit({ canInstall: false });
  await e.prompt();
  return (await e.userChoice).outcome;
}

export function useInstall(): InstallState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );
}
