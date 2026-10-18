// Starter reference data and an idempotency guard for seeding it.
//
// The starter setup can be reached more than once (for example if setup is
// re-run). Seeding must never create a second copy of a default place or size
// group. `toSeed` keeps only the wanted items whose name is not already present
// and drops duplicates within the wanted list itself, comparing on a trimmed,
// lower-cased name. It is a plain function so it can be unit-tested on its own.

import type { Currency } from '../../shared/money';

export interface DefaultPlace {
  name: string;
  kind: 'purchasing' | 'transit' | 'selling';
  currency: Currency;
}

export const DEFAULT_PLACES: DefaultPlace[] = [
  { name: 'Mombasa', kind: 'purchasing', currency: 'KES' },
  { name: 'Dar es Salaam', kind: 'transit', currency: 'TZS' },
  { name: 'Comoros', kind: 'selling', currency: 'KMF' },
];

export const DEFAULT_SIZES: string[] = ['Newborn & baby', 'Small child', 'Child', 'Between child & adult', 'Small adult'];

/** Normalised key used to decide whether two reference names are "the same". */
export function refKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Of `wanted`, the items that do not already exist (by normalised name) and are
 * not repeated. `existing` is the reference data already in the ledger.
 */
export function toSeed<T extends { name: string }>(existing: readonly { name: string }[], wanted: readonly T[]): T[] {
  const have = new Set(existing.map((x) => refKey(x.name)));
  const out: T[] = [];
  for (const w of wanted) {
    const k = refKey(w.name);
    if (have.has(k)) continue;
    have.add(k);
    out.push(w);
  }
  return out;
}
