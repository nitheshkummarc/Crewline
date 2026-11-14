// Shared k6 helpers: seeded tokens and codes, base URL, request params with route tags, idempotency keys, busy retries.
//
// Contents:
//   loadData: Seeded data written by database/seed.py --tokens: { hackathon_id, tokens: [...], codes: [...] }.
//   params: Request params with the session cookie and a route tag for per-route thresholds.
//   postAction: POST one logical action; on 503 busy wait Retry-After plus jitter and resend with the same
//       Idempotency-Key.
//   idempotencyKey: A random 32-character hex key, one per logical action.
import http from 'k6/http';
import { sleep } from 'k6';
import { Counter } from 'k6/metrics';

/** 503 busy answers that were retried with the same key (counted, not failures). */
export const busyRetries = new Counter('busy_retries');

/** Seeded data written by database/seed.py --tokens: { hackathon_id, tokens: [...], codes: [...] }. */
export function loadData() {
  return JSON.parse(open(__ENV.TOKENS || './tokens.json'));
}

export const BASE = __ENV.BASE_URL || 'http://127.0.0.1:8000';

/** Request params with the session cookie and a route tag for per-route thresholds. */
export function params(token, route, mutate = false) {
  const headers = { Cookie: `crewline_session=${token}` };
  if (mutate) {
    headers['Content-Type'] = 'application/json';
    headers['Idempotency-Key'] = idempotencyKey();
  }
  return { headers, tags: { route } };
}

/** POST one logical action; on 503 busy wait Retry-After plus jitter and resend with the same Idempotency-Key. */
export function postAction(url, body, token, route, attempts = 5) {
  const request = params(token, route, true);
  let res = http.post(url, body, request);
  for (let i = 1; i < attempts && res.status === 503; i++) {
    busyRetries.add(1, { route });
    sleep(Number(res.headers['Retry-After'] || 1) * (1 + Math.random() * 0.5));
    res = http.post(url, body, request);
  }
  return res;
}

/** A random 32-character hex key, one per logical action. */
export function idempotencyKey() {
  let key = '';
  for (let i = 0; i < 32; i++) key += Math.floor(Math.random() * 16).toString(16);
  return key;
}
