// Exchange rates: where a conversion's rate came from, and how to convert
// with a full trail. Two kinds of rate are kept apart on purpose:
//
//  - Recorded rates (fx.set records): entered by the family, each with a
//    date, a source and a basis (rate actually received, a market reference
//    saved on purpose, or a manual figure). Reports use these, choosing the
//    rate in force on each transaction's date, so historical profit never
//    changes when the market moves.
//  - Market reference rates: fetched from a published provider, cached with
//    their publication time. Used by the converter and, only when asked and
//    clearly labelled, for a "value at today's market rate" view.
//
// Saved amounts are never rewritten: every conversion is computed on demand
// from the original amount and currency.

import { z } from 'zod';
import { CURRENCY_CODES, convertMinor, type Currency } from './money';
import { K, type FxSeries } from './model';

export const RATE_BASES = ['actual', 'market', 'manual'] as const;
export type RateBasis = (typeof RATE_BASES)[number];
export const RATE_BASIS_LABEL: Record<RateBasis | 'live', string> = {
  actual: 'Rate actually received',
  market: 'Market reference (saved)',
  manual: 'Entered by hand',
  live: 'Market reference (live)',
};

/** One rate used in a conversion, with everything needed to check it. */
export interface RateUse {
  from: Currency;
  to: Currency;
  /** 1 `from` = `rate` `to`. */
  rate: number;
  /** The rate exactly as recorded/published, before any inversion. */
  recorded: { from: Currency; to: Currency; rate: string };
  /** true when the recorded rate was the other direction (1 to = x from). */
  inverse: boolean;
  /** Date the rate applies from (recorded rate) or was published (market). */
  effectiveDate: string;
  source: string;
  basis: RateBasis | 'live';
  /** fx.set entry id, or the provider for a market rate. */
  ref: string;
  /** Also used for amounts dated before it: no rate for this pair was recorded on or before their date (ADR-002 amendment, 31 Oct 2026). */
  later?: boolean;
}

/**
 * Recorded rate in force on `date`: the latest entry on or before it (tries
 * the inverse pair too). If none was recorded that early — trading began
 * before the first rates were written down — the first rate recorded after
 * it is used and marked `later`, so reports say so (owner's decision,
 * 31 Oct 2026; ADR-002 amendment). Null only when no rate for the pair was
 * ever recorded.
 */
export function findRecordedRate(get: (key: string) => unknown, from: Currency, to: Currency, date: string): RateUse | null {
  if (from === to) return null;
  const direct = get(K.fx(from, to)) as FxSeries | undefined;
  const inverse = get(K.fx(to, from)) as FxSeries | undefined;
  const pick = (s: FxSeries | undefined) => {
    let found: FxSeries['entries'][number] | null = null;
    for (const e of s?.entries ?? []) if (e.date <= date) found = e;
    return found;
  };
  const use = (e: FxSeries['entries'][number], inv: boolean, later: boolean): RateUse => ({
    from,
    to,
    rate: inv ? 1 / Number(e.rate) : Number(e.rate),
    recorded: inv ? { from: to, to: from, rate: e.rate } : { from, to, rate: e.rate },
    inverse: inv,
    effectiveDate: e.date,
    source: e.source,
    basis: e.basis ?? 'manual',
    ref: e.id,
    ...(later ? { later: true } : {}),
  });
  const d = pick(direct);
  if (d) return use(d, false, false);
  const i = pick(inverse);
  if (i) return use(i, true, false);
  // None that early: the first one recorded afterwards (entries are kept oldest first), whichever direction is earlier.
  const fd = direct?.entries[0];
  const fi = inverse?.entries[0];
  if (fd && (!fi || fd.date <= fi.date)) return use(fd, false, true);
  if (fi) return use(fi, true, true);
  return null;
}

/* ------------------------------------------------------------------ */
/* Market reference rates                                              */
/* ------------------------------------------------------------------ */

export const MARKET_PROVIDER = {
  id: 'open.er-api.com',
  name: 'ExchangeRate-API (open access)',
  url: 'https://open.er-api.com/v6/latest/USD',
  // The provider's terms require this attribution wherever the rates are shown.
  attribution: { text: 'Rates By Exchange Rate API', href: 'https://www.exchangerate-api.com' },
  terms: 'https://www.exchangerate-api.com/terms',
} as const;

export interface MarketRates {
  provider: string;
  base: Currency;
  /** Units of each currency per 1 `base`. Only currencies the provider published. */
  rates: Partial<Record<Currency, number>>;
  /** When the provider says these rates were last updated (ISO). */
  publishedAt: string;
  /** When the provider says it will next update (ISO), if given. */
  nextUpdateAt: string | null;
  /** When our server (or this device, in demo) fetched them (ISO). */
  fetchedAt: string;
}

const positive = z.number().finite().positive();
const erApiSchema = z.object({
  result: z.literal('success'),
  base_code: z.string(),
  time_last_update_unix: z.number().int().positive(),
  time_next_update_unix: z.number().int().nonnegative().optional(),
  rates: z.record(z.string(), z.number()),
});

/** Validate an open.er-api.com response and keep only the currencies we use. */
export function parseOpenErApi(json: unknown, fetchedAt: string): MarketRates {
  const r = erApiSchema.safeParse(json);
  if (!r.success) throw new Error(`Unexpected response from the rate provider: ${r.error.issues[0]?.message ?? 'invalid'}`);
  const d = r.data;
  if (d.base_code !== 'USD') throw new Error(`Rate provider returned base ${d.base_code}, expected USD.`);
  const rates: Partial<Record<Currency, number>> = {};
  for (const c of CURRENCY_CODES) {
    const v = d.rates[c];
    if (v !== undefined && positive.safeParse(v).success) rates[c] = v;
  }
  if (rates.USD !== 1) throw new Error('Rate provider response is inconsistent (USD is not 1).');
  return {
    provider: MARKET_PROVIDER.id,
    base: 'USD',
    rates,
    publishedAt: new Date(d.time_last_update_unix * 1000).toISOString(),
    nextUpdateAt: d.time_next_update_unix ? new Date(d.time_next_update_unix * 1000).toISOString() : null,
    fetchedAt,
  };
}

export const marketRatesSchema = z.object({
  provider: z.string(),
  base: z.enum(CURRENCY_CODES),
  rates: z.partialRecord(z.enum(CURRENCY_CODES), positive),
  publishedAt: z.string(),
  nextUpdateAt: z.string().nullable(),
  fetchedAt: z.string(),
});

/**
 * Market rate 1 from = x to. The provider publishes every currency against
 * USD, so other pairs are worked out through USD: x = rate(to) / rate(from).
 * Returns null when either currency was not published.
 */
export function marketRate(m: MarketRates, from: Currency, to: Currency): { rate: number; legs: { currency: Currency; perBase: number }[] } | null {
  if (from === to) return { rate: 1, legs: [] };
  const a = m.rates[from];
  const b = m.rates[to];
  if (!a || !b) return null;
  return { rate: b / a, legs: [{ currency: from, perBase: a }, { currency: to, perBase: b }] };
}

/** How old the market rates are, and whether they should be treated as out of date. */
export function marketFreshness(m: MarketRates, now: number = Date.now()): { stale: boolean; ageMs: number } {
  const published = Date.parse(m.publishedAt);
  const next = m.nextUpdateAt ? Date.parse(m.nextUpdateAt) : published + 24 * 3600_000;
  // The provider updates once a day. Allow 3 hours after the promised update
  // before calling the rates stale; never trust anything older than 36 hours.
  const stale = now > next + 3 * 3600_000 || now - published > 36 * 3600_000;
  return { stale, ageMs: Math.max(0, now - published) };
}

/* ------------------------------------------------------------------ */
/* Traced conversion                                                   */
/* ------------------------------------------------------------------ */

export type ConversionBasis = 'transaction' | 'market';
export const CONVERSION_BASIS_LABEL: Record<ConversionBasis, string> = {
  transaction: 'Recorded rate in force on each transaction’s date',
  market: 'Today’s market reference rate (current value, not historical cost)',
};

/**
 * Converts amounts into one reporting currency and remembers every rate it
 * used and every rate it could not find. It never invents a rate: a missing
 * rate gives `null` and is listed in `missing`.
 */
export class Converter {
  readonly uses = new Map<string, RateUse>();
  readonly missing = new Set<string>();

  constructor(
    private readonly get: (key: string) => unknown,
    readonly target: Currency,
    readonly basis: ConversionBasis = 'transaction',
    private readonly market: MarketRates | null = null,
  ) {}

  rate(from: Currency, date: string): RateUse | null {
    if (from === this.target) return null;
    let use: RateUse | null = null;
    if (this.basis === 'market') {
      const m = this.market ? marketRate(this.market, from, this.target) : null;
      if (m && this.market) {
        use = {
          from,
          to: this.target,
          rate: m.rate,
          recorded: { from, to: this.target, rate: String(m.rate) },
          inverse: false,
          effectiveDate: this.market.publishedAt.slice(0, 10),
          source: `${MARKET_PROVIDER.name}, published ${this.market.publishedAt.replace('T', ' ').slice(0, 16)} UTC, via USD (1 USD = ${m.legs[0]?.perBase} ${from} = ${m.legs[1]?.perBase} ${this.target})`,
          basis: 'live',
          ref: this.market.provider,
        };
      } else this.missing.add(`${from}→${this.target} (no market rate available)`);
    } else {
      use = findRecordedRate(this.get, from, this.target, date);
      if (!use) this.missing.add(`${from}→${this.target} (no rate recorded)`);
    }
    if (use) {
      // One line per rate in the "rates used" list; it says so if it also served earlier amounts.
      const key = `${use.ref}|${from}`;
      const prev = this.uses.get(key);
      this.uses.set(key, prev ? { ...prev, ...(prev.later || use.later ? { later: true } : {}) } : use);
    }
    return use;
  }

  convert(amount: number, from: Currency, date: string): number | null {
    if (from === this.target) return amount;
    const use = this.rate(from, date);
    return use ? convertMinor(amount, from, this.target, use.rate) : null;
  }

  /** Rates used, oldest first, for the "how this was converted" table. */
  ratesUsed(): RateUse[] {
    return [...this.uses.values()].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.from.localeCompare(b.from));
  }
}

/** Add an amount to a per-currency total. */
export function addTo(totals: Partial<Record<Currency, number>>, currency: Currency, amount: number) {
  totals[currency] = (totals[currency] ?? 0) + amount;
}
