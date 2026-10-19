// Property and reconciliation tests for the money layer and vendor balances.
// Expected values here are derived independently (by hand or by a separate
// calculation), never by calling the function under test, so a shared mistake
// in the implementation cannot make a test pass by agreeing with itself.

import { describe, expect, it } from 'vitest';
import { op, ok, seeded, IDS } from './helpers';
import { purchaseBalances, vendorAccounts } from '../src/shared/queries';
import { CURRENCY_CODES, convertMinor, formatAmount, fromMajor, lineTotal, parseMoney, toMajor, type Currency } from '../src/shared/money';

// Small deterministic PRNG so failures are reproducible.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randint = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

describe('money layer — properties', () => {
  it('converting within the same currency is exactly identity (no float drift)', () => {
    const r = rng(1);
    for (let i = 0; i < 500; i++) {
      const c = CURRENCY_CODES[randint(r, 0, CURRENCY_CODES.length - 1)]!;
      const minor = randint(r, 0, 5_000_000);
      const rate = (r() * 1000).toFixed(6);
      expect(convertMinor(minor, c, c, rate)).toBe(minor);
    }
  });

  it('major ↔ minor is a clean round trip for every currency', () => {
    const r = rng(2);
    for (let i = 0; i < 500; i++) {
      const c = CURRENCY_CODES[randint(r, 0, CURRENCY_CODES.length - 1)]!;
      const minor = randint(r, 0, 9_000_000);
      expect(fromMajor(c, toMajor(c, minor))).toBe(minor);
    }
  });

  it('parse ∘ format is a round trip (what is shown re-reads to the same minor units)', () => {
    const r = rng(3);
    for (let i = 0; i < 500; i++) {
      const c = CURRENCY_CODES[randint(r, 0, CURRENCY_CODES.length - 1)]!;
      const minor = randint(r, 0, 9_000_000);
      expect(parseMoney(c, formatAmount(c, minor))).toBe(minor);
    }
  });

  it('converts to independently hand-computed values', () => {
    // KES 100.00 at 1 KES = 15 KMF → 1500 KMF (whole francs).
    expect(convertMinor(10_000, 'KES', 'KMF', '15')).toBe(1500);
    // KES 130.00 at 1 KES = 0.0075 USD → 0.975 USD → 98 cents (rounded).
    expect(convertMinor(13_000, 'KES', 'USD', '0.0075')).toBe(98);
    // KMF 2000 at 1 KMF = 0.00203 EUR → 4.06 EUR → 406 cents.
    expect(convertMinor(2000, 'KMF', 'EUR', '0.00203')).toBe(406);
    // TZS 50000 at 1 TZS = 0.0054 KES → 270.00 KES → 27000 cents.
    expect(convertMinor(50_000, 'TZS', 'KES', '0.0054')).toBe(27_000);
  });

  it('a currency conversion rounds to within one minor unit of the true value', () => {
    const r = rng(4);
    for (let i = 0; i < 500; i++) {
      const from = CURRENCY_CODES[randint(r, 0, CURRENCY_CODES.length - 1)]!;
      const to = CURRENCY_CODES[randint(r, 0, CURRENCY_CODES.length - 1)]!;
      if (from === to) continue;
      const minor = randint(r, 0, 2_000_000);
      const rate = (0.0001 + r() * 500).toFixed(6);
      const got = convertMinor(minor, from, to, rate);
      // True value computed with JS numbers independently of the function's internals.
      const trueMajorTo = (minor / 10 ** { KES: 2, KMF: 0, TZS: 0, USD: 2, EUR: 2 }[from]) * Number(rate);
      const trueMinorTo = trueMajorTo * 10 ** { KES: 2, KMF: 0, TZS: 0, USD: 2, EUR: 2 }[to];
      expect(Math.abs(got - trueMinorTo)).toBeLessThanOrEqual(0.5 + 1e-6);
    }
  });

  it('lineTotal multiplies exactly and refuses amounts beyond safe integers', () => {
    expect(lineTotal(50, 250_00)).toBe(1_250_000);
    expect(lineTotal(0, 999)).toBe(0);
    expect(() => lineTotal(1_000_000, 10_000_000_000_000)).toThrow();
  });
});

describe('vendor balances reconcile with purchases and payments (randomised)', () => {
  // Intake 'awaiting' (collect later): the whole line value is payable at once,
  // so the expected payable is just Σ(qty × unitCost), known without the engine.
  it('payable = Σ purchase costs; paid = Σ payments; balance and credit follow', () => {
    for (let trial = 0; trial < 40; trial++) {
      const r = rng(1000 + trial);
      const L = seeded();
      const vendor = IDS.hafsa;
      const gt = IDS.hafsaElastic80;

      let expectedPayable = 0;
      const nPurch = randint(r, 1, 5);
      for (let i = 0; i < nPurch; i++) {
        const qty = randint(r, 1, 50);
        const unitCost = randint(r, 1, 100_000); // up to KSh 1,000.00
        expectedPayable += qty * unitCost;
        ok(
          L,
          op('purchase.record', {
            id: `pp-${trial}-${i}`,
            vendorId: vendor,
            locationId: IDS.msa,
            date: '2026-02-01',
            currency: 'KES',
            intake: 'awaiting',
            lines: [{ garmentTypeId: gt, qty, unitCost }],
            note: '',
          }),
        );
      }

      let paidTotal = 0;
      const nPay = randint(r, 0, 4);
      for (let j = 0; j < nPay; j++) {
        const amount = randint(r, 1, 2_000_000);
        paidTotal += amount;
        ok(
          L,
          op('vendor.payment', {
            vendorId: vendor,
            purchaseId: null,
            date: '2026-02-02',
            amount,
            currency: 'KES',
            method: 'mpesa',
            reference: `R${trial}-${j}`,
            note: '',
          }),
        );
      }

      const account = vendorAccounts(L).find((a) => a.vendorId === vendor && a.currency === 'KES')!;
      expect(account).toBeDefined();
      // Purchases ↔ vendor payable.
      expect(account.payable).toBe(expectedPayable);
      // Payment totals ↔ account paid.
      expect(account.paid).toBe(paidTotal);
      // We owe payable − paid (negative means the vendor holds our credit).
      expect(account.balance).toBe(expectedPayable - paidTotal);
      // Excess payment that could not be allocated to any purchase is credit.
      expect(account.unallocated).toBe(Math.max(0, paidTotal - expectedPayable));

      // Payments allocated across purchases ↔ never more than each purchase owes.
      const pbs = [...purchaseBalances(L).values()].filter((p) => p.vendorId === vendor);
      const allocated = pbs.reduce((s, p) => s + p.paid, 0);
      const remaining = pbs.reduce((s, p) => s + p.balance, 0);
      expect(allocated).toBe(Math.min(paidTotal, expectedPayable));
      expect(remaining).toBe(Math.max(0, expectedPayable - paidTotal));
      for (const p of pbs) expect(p.paid).toBeLessThanOrEqual(p.payable); // no purchase over-paid
    }
  });
});
