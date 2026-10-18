// Business time is Africa/Nairobi (UTC+03:00, no daylight saving), which is
// also the time in the Comoros. Timestamps are stored in UTC ISO format;
// business dates ("which day was this?") are computed in UTC+3.

export const BUSINESS_TZ = 'Africa/Nairobi';
export const BUSINESS_OFFSET_MIN = 180;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Business date (YYYY-MM-DD, UTC+3) for an instant. */
export function businessDate(at: Date | string | number = Date.now()): string {
  const ms = typeof at === 'string' ? Date.parse(at) : typeof at === 'number' ? at : at.getTime();
  return new Date(ms + BUSINESS_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive day difference b - a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const dtf = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const tf = new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const tfs = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const df = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const dfShort = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });

/** "17 Oct 2026, 14:05" in business time. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dtf.format(new Date(iso));
}
export function fmtTime(iso: string | null | undefined, seconds = false): string {
  if (!iso) return '—';
  return (seconds ? tfs : tf).format(new Date(iso));
}
/** "Sat 17 Oct 2026" for a business date string. */
export function fmtDate(date: string | null | undefined): string {
  if (!date) return '—';
  return df.format(new Date(`${date}T00:00:00Z`));
}
export function fmtDateShort(date: string | null | undefined): string {
  if (!date) return '—';
  return dfShort.format(new Date(`${date}T00:00:00Z`));
}

/** "3 h 12 min" style duration. */
export function fmtDuration(ms: number): string {
  const abs = Math.abs(ms);
  const min = Math.round(abs / 60_000);
  if (min < 1) return `${Math.round(abs / 1000)} s`;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 48) return m ? `${h} h ${m} min` : `${h} h`;
  return `${Math.round(h / 24)} days`;
}
