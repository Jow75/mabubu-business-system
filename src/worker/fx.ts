// Market reference exchange rates, fetched from the provider by the server
// and cached in D1, so phones never call the provider themselves and the
// provider is asked at most about once a day (it publishes once a day).
// When the provider cannot be reached, the last good rates are returned
// with `stale: true` and the error — never presented as current.

import { z } from 'zod';
import type { MarketRatesResponse } from '../shared/api';
import { MARKET_PROVIDER, marketFreshness, marketRatesSchema, parseOpenErApi, type MarketRates } from '../shared/fx';
import { REPORT_IDS, EXPORT_FORMATS, REPORT_INFO, canExport } from '../shared/report-catalog';
import { eventStmt, type Session } from './auth';
import type { Env } from './env';
import { HttpError, json, nowIso, readJson } from './http';

const FETCH_TIMEOUT_MS = 5000;
/** After a failed attempt, wait this long before asking the provider again. */
const RETRY_AFTER_FAILURE_MS = 30 * 60_000;
/** Small grace after the provider's promised update time. */
const UPDATE_GRACE_MS = 10 * 60_000;

interface Row {
  data: string | null;
  fetched_at: string | null;
  attempted_at: string;
  last_error: string | null;
}

async function fetchProvider(): Promise<MarketRates> {
  let res: Response;
  try {
    res = await fetch(MARKET_PROVIDER.url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (e) {
    throw new Error(e instanceof Error && e.name === 'TimeoutError' ? 'The rate provider did not answer in time.' : 'Could not reach the rate provider.');
  }
  if (res.status === 429) throw new Error('The rate provider is limiting requests; try again later.');
  if (!res.ok) throw new Error(`The rate provider answered with an error (${res.status}).`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error('The rate provider sent something that is not valid data.');
  }
  return parseOpenErApi(body, nowIso());
}

export async function marketRates(env: Env, _session: Session, now: number = Date.now()): Promise<Response> {
  const row = await env.DB.prepare('SELECT data, fetched_at, attempted_at, last_error FROM fx_market WHERE provider = ?').bind(MARKET_PROVIDER.id).first<Row>();
  let cached: MarketRates | null = null;
  if (row?.data) {
    const parsed = marketRatesSchema.safeParse(JSON.parse(row.data));
    if (parsed.success) cached = parsed.data;
  }
  const nextDue = cached ? Date.parse(cached.nextUpdateAt ?? cached.publishedAt) + (cached.nextUpdateAt ? UPDATE_GRACE_MS : 24 * 3600_000) : 0;
  const triedRecently = row ? now - Date.parse(row.attempted_at) < RETRY_AFTER_FAILURE_MS && Boolean(row.last_error) : false;
  let lastError = row?.last_error ?? null;
  let refreshedNow = false;

  if ((!cached || now >= nextDue) && !triedRecently) {
    const at = new Date(now).toISOString();
    try {
      const fresh = await fetchProvider();
      cached = fresh;
      lastError = null;
      refreshedNow = true;
      await env.DB.prepare(
        'INSERT INTO fx_market (provider, data, fetched_at, attempted_at, last_error) VALUES (?, ?, ?, ?, NULL) ON CONFLICT (provider) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at, attempted_at = excluded.attempted_at, last_error = NULL',
      )
        .bind(MARKET_PROVIDER.id, JSON.stringify(fresh), fresh.fetchedAt, at)
        .run();
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Rate refresh failed.';
      await env.DB.prepare(
        'INSERT INTO fx_market (provider, data, fetched_at, attempted_at, last_error) VALUES (?, NULL, NULL, ?, ?) ON CONFLICT (provider) DO UPDATE SET attempted_at = excluded.attempted_at, last_error = excluded.last_error',
      )
        .bind(MARKET_PROVIDER.id, at, lastError)
        .run();
    }
  }

  if (!cached) throw new HttpError(503, 'rates_unavailable', lastError ?? 'Market rates are not available yet.');
  const body: MarketRatesResponse = { rates: cached, stale: marketFreshness(cached, now).stale, refreshedNow, lastError };
  return json(body, 200, { 'cache-control': 'private, max-age=300' });
}

const exportSchema = z.object({
  report: z.enum(REPORT_IDS),
  format: z.enum(EXPORT_FORMATS),
  rows: z.number().int().min(0).max(10_000_000),
  filters: z.string().max(500),
});

/** Record that someone downloaded a report (the file itself is built on the device). */
export async function recordExport(env: Env, session: Session, request: Request): Promise<Response> {
  const r = exportSchema.safeParse(await readJson(request));
  if (!r.success) throw new HttpError(400, 'invalid', r.error.issues[0]?.message ?? 'Invalid request.');
  if (!canExport(session.user.caps, r.data.report)) throw new HttpError(403, 'forbidden', 'You do not have permission to download this report.');
  await env.DB.batch([
    eventStmt(env, 'report_exported', { actorId: session.user.id, deviceId: session.deviceId, detail: { report: r.data.report, title: REPORT_INFO[r.data.report].title, format: r.data.format, rows: r.data.rows, filters: r.data.filters } }),
  ]);
  return json({ ok: true });
}
