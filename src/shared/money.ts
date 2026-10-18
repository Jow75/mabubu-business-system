// Money is always an integer number of minor units in its own currency.
// Floating point is only used when converting between currencies for
// reports, never for stored transaction amounts.

export const CURRENCY_CODES = ['KES', 'KMF', 'TZS', 'USD', 'EUR'] as const;
export type Currency = (typeof CURRENCY_CODES)[number];

export interface CurrencyInfo {
  code: Currency;
  /** Decimal places stored. KMF has no minor unit in practice. */
  exp: number;
  prefix: string;
  name: string;
}

export const CURRENCIES: Record<Currency, CurrencyInfo> = {
  KES: { code: 'KES', exp: 2, prefix: 'KSh', name: 'Kenyan shilling' },
  KMF: { code: 'KMF', exp: 0, prefix: 'KMF', name: 'Comorian franc' },
  TZS: { code: 'TZS', exp: 0, prefix: 'TSh', name: 'Tanzanian shilling' },
  USD: { code: 'USD', exp: 2, prefix: 'US$', name: 'US dollar' },
  EUR: { code: 'EUR', exp: 2, prefix: '€', name: 'Euro' },
};

export function isCurrency(c: string): c is Currency {
  return (CURRENCY_CODES as readonly string[]).includes(c);
}

/** Parse a typed amount ("1,000", "82.50") into minor units. Returns null
 *  when the text is not a valid non-negative amount for that currency. */
export function parseMoney(currency: Currency, input: string): number | null {
  const s = input.replace(/[\s,]/g, '');
  if (s === '') return null;
  const { exp } = CURRENCIES[currency];
  const re = exp > 0 ? new RegExp(`^\\d+(\\.\\d{0,${exp}})?$`) : /^\d+$/;
  if (!re.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const minor = Number(whole) * 10 ** exp + Number((frac + '0'.repeat(exp)).slice(0, exp) || '0');
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Minor units → plain major-unit string without currency ("1,000", "82.50"). */
export function formatAmount(currency: Currency, minor: number): string {
  const { exp } = CURRENCIES[currency];
  const neg = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const whole = Math.floor(abs / 10 ** exp);
  const frac = exp > 0 ? abs % 10 ** exp : 0;
  let out = whole.toLocaleString('en-US');
  if (exp > 0 && frac !== 0) out += '.' + String(frac).padStart(exp, '0');
  return (neg ? '−' : '') + out;
}

export function formatMoney(currency: Currency, minor: number, opts: { signed?: boolean } = {}): string {
  const body = formatAmount(currency, Math.abs(minor));
  const sign = minor < 0 ? '−' : opts.signed && minor > 0 ? '+' : '';
  return `${sign}${CURRENCIES[currency].prefix} ${body}`;
}

/** Major units as a number (for display maths only). */
export function toMajor(currency: Currency, minor: number): number {
  return minor / 10 ** CURRENCIES[currency].exp;
}
export function fromMajor(currency: Currency, major: number): number {
  return Math.round(major * 10 ** CURRENCIES[currency].exp);
}

/* ------------------------------------------------------------------ */
/* Comoros local counting convention                                   */
/* ------------------------------------------------------------------ */
// In everyday speech in Ngazidja, amounts are counted in units of five
// francs: a KMF 1,000 note is "200" (majana maili). The app only ever
// stores and calculates official KMF; the local count is a display aid.

export const LOCAL_COUNT_DIVISOR = 5;

export function localCount(kmf: number): number {
  return kmf / LOCAL_COUNT_DIVISOR;
}

export function formatLocalCount(kmf: number): string {
  const v = localCount(kmf);
  const neg = v < 0;
  const abs = Math.abs(v);
  const s = Number.isInteger(abs)
    ? abs.toLocaleString('en-US')
    : abs.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (neg ? '−' : '') + s;
}

/* ------------------------------------------------------------------ */
/* Exchange rates (reports only)                                       */
/* ------------------------------------------------------------------ */

/** A rate is stored as a decimal string meaning 1 `from` = rate `to`. */
export function isValidRate(rate: string): boolean {
  return /^\d{1,12}(\.\d{1,10})?$/.test(rate) && Number(rate) > 0;
}

export function convertMinor(minor: number, from: Currency, to: Currency, rate: string | number): number {
  if (from === to) return minor;
  const major = toMajor(from, minor) * Number(rate);
  return fromMajor(to, major);
}

/** qty × unit price, guarded against unsafe integers. */
export function lineTotal(qty: number, unitMinor: number): number {
  const v = qty * unitMinor;
  if (!Number.isSafeInteger(v)) throw new Error('Amount too large');
  return v;
}
