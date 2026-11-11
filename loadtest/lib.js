// Shared k6 helpers: seeded tokens and codes, base URL, request params with route tags, idempotency keys.

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

/** A random 32-character hex key, one per logical action. */
export function idempotencyKey() {
  let key = '';
  for (let i = 0; i < 32; i++) key += Math.floor(Math.random() * 16).toString(16);
  return key;
}
