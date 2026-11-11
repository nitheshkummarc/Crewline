// Scenario L-B: 100 board readers, a 50-user join stampede on one team every 5 s, and team-creation churn.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE, loadData, params } from './lib.js';

const data = loadData();
const READERS = 100;
const STAMPEDE_USERS = 50;
const STAMPEDES = 12;

export const options = {
  scenarios: {
    board: { executor: 'constant-vus', vus: READERS, duration: '65s', exec: 'boardReader' },
    stampede: {
      executor: 'per-vu-iterations', vus: STAMPEDE_USERS, iterations: STAMPEDES, maxDuration: '90s',
      exec: 'stampede', startTime: '5s',
    },
    churn: {
      executor: 'constant-arrival-rate', rate: 2, timeUnit: '1s', duration: '60s', preAllocatedVUs: 5,
      exec: 'churn', startTime: '5s',
    },
  },
  thresholds: {
    'http_req_duration{route:board_teams}': ['p(95)<200'],
    'checks{kind:stampede}': ['rate==1'],
    'http_req_failed{route:board_teams}': ['rate<0.001'],
  },
};

let cursor = null;

/** Board reader: same mix as L-A without think time. */
export function boardReader() {
  const token = data.tokens[__VU - 1];
  let url = `${BASE}/api/hackathons/${data.hackathon_id}/board/teams`;
  if (cursor && Math.random() < 0.3) url += `?cursor=${cursor}`;
  const res = http.get(url, params(token, 'board_teams'));
  if (res.status === 200) cursor = res.json('next_cursor');
}

/** Each iteration, all stampede VUs join the same open team with fresh users; only 200 or 409 is allowed. */
export function stampede() {
  const token = data.tokens[READERS + __ITER * STAMPEDE_USERS + (__VU - 1)];
  const code = data.codes[__ITER % data.codes.length];
  const res = http.post(`${BASE}/api/teams/join`, JSON.stringify({ code }), params(token, 'join', true));
  check(res, { 'join 200 or 409': (r) => r.status === 200 || r.status === 409 }, { kind: 'stampede' });
  sleep(5);
}

/** Churn: fresh users create teams at 2 per second. */
export function churn() {
  const index = READERS + STAMPEDES * STAMPEDE_USERS + __ITER + (__VU - 1) * 1000;
  const token = data.tokens[index % data.tokens.length];
  const res = http.post(`${BASE}/api/hackathons/${data.hackathon_id}/teams`, JSON.stringify({ name: `Churn ${index}` }),
    params(token, 'create_team', true));
  check(res, { 'create 201 or 409': (r) => r.status === 201 || r.status === 409 });
}
