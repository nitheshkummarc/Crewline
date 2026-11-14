// Fetch wrapper: same-origin credentials, Idempotency-Key on mutations, error envelope, retry of 503 and network errors.
//
// Contents:
//   ApiError: Error with the HTTP status and the API error code.
//   newIdempotencyKey: Return a random key for one user action (32 hex characters, inside the 16 to 64 limit).
//   retryDelay: Return the delay before retry number `attempt` (1-based), honoring Retry-After in seconds.
//   toApiError: Parse the error envelope into an ApiError.
//   request: Send one API request; retry network errors and 503 up to 3 times with the same Idempotency-Key.
import type { ErrorCode } from './types';

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  /** Key reused by every automatic retry of one user action; a new one is made when absent. */
  idempotencyKey?: string;
  /** Signup, login and logout carry no key (api.md conventions). */
  noIdempotency?: boolean;
  signal?: AbortSignal;
}

const MAX_RETRIES = 3;

/** Error with the HTTP status and the API error code. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | string,
    message: string,
    public readonly requestId: string | null = null,
    public readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Return a random key for one user action (32 hex characters, inside the 16 to 64 limit). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/** Waits used between retries; tests replace `sleep` to run instantly. */
export const timing = {
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  jitter: () => Math.random() * 250,
};

/** Return the delay before retry number `attempt` (1-based), honoring Retry-After in seconds. */
export function retryDelay(attempt: number, retryAfter: number | null): number {
  const base = retryAfter !== null ? retryAfter * 1000 : 200 * 2 ** (attempt - 1);
  return base + timing.jitter();
}

/** Parse the error envelope into an ApiError. */
async function toApiError(response: Response): Promise<ApiError> {
  const retryAfter = Number(response.headers.get('Retry-After')) || null;
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'error' in body) {
      const error = (body as { error: { code?: string; message?: string; request_id?: string | null } }).error;
      return new ApiError(response.status, error.code ?? 'internal_error', error.message ?? response.statusText,
        error.request_id ?? null, retryAfter);
    }
  } catch {
    // Non-JSON body (proxy page): fall through to a generic error.
  }
  return new ApiError(response.status, response.status === 503 ? 'busy' : 'internal_error',
    response.statusText || 'Request failed', null, retryAfter);
}

/** Send one API request; retry network errors and 503 up to 3 times with the same Idempotency-Key. */
export async function request<T>(method: Method, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && !options.noIdempotency) {
    headers['Idempotency-Key'] = options.idempotencyKey ?? newIdempotencyKey();
  }
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
        // GETs revalidate with the browser cache, so board ETags turn into 304s.
        cache: method === 'GET' ? 'no-cache' : 'no-store',
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (attempt >= MAX_RETRIES) {
        throw new ApiError(0, 'network_error', 'No connection. Check your network and try again.');
      }
      await timing.sleep(retryDelay(attempt + 1, null));
      continue;
    }
    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }
    const error = await toApiError(response);
    if (response.status === 503 && attempt < MAX_RETRIES) {
      await timing.sleep(retryDelay(attempt + 1, error.retryAfter));
      continue;
    }
    throw error;
  }
}
