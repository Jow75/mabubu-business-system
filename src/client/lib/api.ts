import type { ApiErrorBody } from '../../shared/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body: Partial<ApiErrorBody> = {},
  ) {
    super(message);
  }
  /** True when the request never reached the server. */
  get offline() {
    return this.status === 0;
  }
}

export async function api<T>(method: string, path: string, body?: unknown, token?: string | null): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'offline', 'No connection to the server.');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    const b = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(res.status, b.error ?? 'error', b.message ?? `Server error (${res.status}).`, b);
  }
  return data as T;
}
