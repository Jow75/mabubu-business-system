// Cloudflare Worker entry point. Static app files are served by Cloudflare
// directly; only /api/* requests reach this code (see wrangler.jsonc).

import { authenticate, login, logout, setup, setupStatus } from './auth';
import { createPerson, decideAccess, exportBackup, listAuthEvents, listPeople, resetPin, unlockPerson, updateDevice, updatePerson } from './admin';
import type { Env } from './env';
import { HttpError, errorResponse, json } from './http';
import { pull, push } from './sync';
import { marketRates, recordExport } from './fx';
import { goLiveBackup, goLiveExecute, goLiveStatus } from './golive';

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  try {
    if (!path.startsWith('/api/')) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      throw new HttpError(404, 'not_found', 'Not found.');
    }
    if (method !== 'GET' && method !== 'HEAD') {
      // Same-origin only: the app never calls the API from another site.
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) throw new HttpError(403, 'bad_origin', 'Cross-site request refused.');
    }

    // Public endpoints
    if (path === '/api/health' && method === 'GET') return json({ ok: true, time: new Date().toISOString() });
    if (path === '/api/setup/status' && method === 'GET') return await setupStatus(env);
    if (path === '/api/setup' && method === 'POST') return await setup(env, request);
    if (path === '/api/auth/login' && method === 'POST') return await login(env, request);

    // Everything else needs a valid session
    const session = await authenticate(env, request);
    if (path === '/api/auth/me' && method === 'GET') return json({ user: session.user });
    if (path === '/api/auth/logout' && method === 'POST') return await logout(env, session);
    if (path === '/api/sync/push' && method === 'POST') return await push(env, session, request);
    if (path === '/api/sync/pull' && method === 'GET') return await pull(env, session, url);

    if (path === '/api/fx/market' && method === 'GET') return await marketRates(env, session);
    if (path === '/api/audit/export' && method === 'POST') return await recordExport(env, session, request);

    if (path === '/api/admin/people' && method === 'GET') return await listPeople(env, session);
    if (path === '/api/admin/people' && method === 'POST') return await createPerson(env, session, request);
    let m = /^\/api\/admin\/people\/([A-Za-z0-9_-]{3,64})(\/pin|\/unlock)?$/.exec(path);
    if (m) {
      const id = m[1]!;
      if (!m[2] && method === 'PATCH') return await updatePerson(env, session, id, request);
      if (m[2] === '/pin' && method === 'POST') return await resetPin(env, session, id, request);
      if (m[2] === '/unlock' && method === 'POST') return await unlockPerson(env, session, id);
    }
    if (path === '/api/admin/access' && method === 'POST') return await decideAccess(env, session, request);
    m = /^\/api\/admin\/devices\/([A-Za-z0-9_-]{8,64})$/.exec(path);
    if (m && method === 'PATCH') return await updateDevice(env, session, m[1]!, request);
    if (path === '/api/admin/events' && method === 'GET') return await listAuthEvents(env, session, url);
    if (path === '/api/admin/export' && method === 'GET') return await exportBackup(env, session);
    if (path === '/api/admin/golive' && method === 'GET') return await goLiveStatus(env, session);
    if (path === '/api/admin/golive/backup' && method === 'POST') return await goLiveBackup(env, session);
    if (path === '/api/admin/golive/execute' && method === 'POST') return await goLiveExecute(env, session, request);

    throw new HttpError(404, 'not_found', 'Not found.');
  } catch (e) {
    return errorResponse(e);
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};
