import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACES, DEFAULT_SIZES, toSeed } from '../src/client/lib/seed';

describe('starter data seeding is idempotent', () => {
  it('seeds every default on a clean business', () => {
    expect(toSeed([], DEFAULT_PLACES)).toHaveLength(DEFAULT_PLACES.length);
    expect(toSeed([], DEFAULT_SIZES.map((name) => ({ name })))).toHaveLength(DEFAULT_SIZES.length);
  });

  it('seeds nothing when every default already exists (re-run)', () => {
    const existingPlaces = DEFAULT_PLACES.map((p) => ({ name: p.name }));
    const existingSizes = DEFAULT_SIZES.map((name) => ({ name }));
    expect(toSeed(existingPlaces, DEFAULT_PLACES)).toEqual([]);
    expect(toSeed(existingSizes, DEFAULT_SIZES.map((name) => ({ name })))).toEqual([]);
  });

  it('matches on a trimmed, case-insensitive name', () => {
    expect(toSeed([{ name: '  comoros ' }], [{ name: 'Comoros' }])).toEqual([]);
    expect(toSeed([{ name: 'MOMBASA' }], DEFAULT_PLACES).map((p) => p.name)).toEqual(['Dar es Salaam', 'Comoros']);
  });

  it('only adds the defaults that are missing', () => {
    const existing = [{ name: 'Comoros' }];
    expect(toSeed(existing, DEFAULT_PLACES).map((p) => p.name)).toEqual(['Mombasa', 'Dar es Salaam']);
  });

  it('drops duplicates within the wanted list itself', () => {
    expect(toSeed([], [{ name: 'Child' }, { name: 'child' }, { name: 'Child ' }])).toHaveLength(1);
  });
});
