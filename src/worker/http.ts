export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const BASE_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, ...headers } });
}

/** Respond with a body that is already JSON text (avoids re-parsing stored JSON). */
export function rawJson(text: string, status = 200): Response {
  return new Response(text, { status, headers: BASE_HEADERS });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.code, message: e.message, ...e.extra }, e.status);
  console.error(e);
  return json({ error: 'server_error', message: 'Something went wrong on the server.' }, 500);
}

const MAX_BODY = 512 * 1024;

export async function readJson(request: Request): Promise<unknown> {
  const len = Number(request.headers.get('content-length') ?? '0');
  if (len > MAX_BODY) throw new HttpError(413, 'too_large', 'Request is too large.');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'too_large', 'Request is too large.');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'bad_json', 'Request body is not valid JSON.');
  }
}

export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

export const nowIso = () => new Date().toISOString();
