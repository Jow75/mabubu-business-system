// Market reference rates on this device: the last good set is kept so the
// converter works offline, always shown with its age. Rates come from our
// server (which caches the provider); in demo mode, with no server account,
// this device asks the provider directly.

import { useEffect, useSyncExternalStore } from 'react';
import type { MarketRatesResponse } from '../../shared/api';
import { MARKET_PROVIDER, marketFreshness, marketRatesSchema, parseOpenErApi, type MarketRates } from '../../shared/fx';
import { api, ApiError } from './api';
import { store } from './store';

const KEY = 'mabubu.market';
const CHECK_EVERY_MS = 30 * 60_000;

export interface MarketState {
  rates: MarketRates | null;
  loading: boolean;
  /** Why the latest attempt to get fresh rates failed. */
  error: string | null;
  /** When this device last asked for rates. */
  checkedAt: number | null;
}

let state: MarketState = { rates: load(), loading: false, error: null, checkedAt: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<MarketState>) => {
  state = { ...state, ...patch };
  for (const l of listeners) l();
};

function load(): MarketRates | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = marketRatesSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
function save(m: MarketRates) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable: rates just won't survive a reload */
  }
}

let inflight: Promise<void> | null = null;

export function refreshMarketRates(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && state.checkedAt && Date.now() - state.checkedAt < CHECK_EVERY_MS && state.rates && !marketFreshness(state.rates).stale) return Promise.resolve();
  set({ loading: true });
  inflight = (async () => {
    try {
      let rates: MarketRates;
      let serverError: string | null = null;
      const snap = store.getSnapshot();
      if (snap.demo || !store.token) {
        const res = await fetch(MARKET_PROVIDER.url, { cache: 'no-store' });
        if (!res.ok) throw new Error(res.status === 429 ? 'The rate provider is limiting requests; try again later.' : `The rate provider answered with an error (${res.status}).`);
        rates = parseOpenErApi(await res.json(), new Date().toISOString());
      } else {
        const r = await api<MarketRatesResponse>('GET', '/fx/market', undefined, store.token);
        rates = r.rates;
        serverError = r.lastError;
      }
      save(rates);
      set({ rates, error: serverError, loading: false, checkedAt: Date.now() });
    } catch (e) {
      const msg = e instanceof ApiError ? (e.offline ? 'No connection. Showing the last rates saved on this device.' : e.message) : e instanceof TypeError ? 'No connection. Showing the last rates saved on this device.' : e instanceof Error ? e.message : 'Could not get rates.';
      set({ error: msg, loading: false, checkedAt: Date.now() });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useMarketRates(): MarketState & { stale: boolean; ageMs: number | null } {
  const s = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
  useEffect(() => {
    void refreshMarketRates();
  }, []);
  const f = s.rates ? marketFreshness(s.rates) : null;
  return { ...s, stale: f ? f.stale : true, ageMs: f?.ageMs ?? null };
}
