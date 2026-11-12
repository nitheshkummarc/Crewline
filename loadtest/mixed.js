// Scenario L-B: 100 board readers, a 50-user stampede on a fresh one-seat team every 5 s, and team-creation churn.
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE, loadData, params, postAction } from './lib.js';

const data = loadData();
const READERS = 100;
const STAMPEDE_USERS = 50;
const STAMPEDES = 12;

const stampedeWins = new Counter('stampede_wins');

// Each stampede team has exactly one free seat, so each stampede must have exactly one winner.
const winnerThresholds = {};
for (let i = 0; i < STAMPEDES; i++) winnerThresholds[`stampede_wins{stampede:${i}}`] = ['count==1'];

export const options = {
  setupTimeout: '60s',
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
    'http_req_failed{route:board_teams}': ['rate<0.001'],
    'checks{kind:stampede}': ['rate==1'],
    ...winnerThresholds,
  },
};

/** Create one team per stampede with 3 of 4 seats taken (leader plus two joins); return their invite codes. */
export function setup() {
  const codes = [];
  const last = data.tokens.length - 1;
  for (let i = 0; i < STAMPEDES; i++) {
    // Setup users come from the end of the token list; readers, stampeders and churn use the start.
    const [leader, a, b] = [data.tokens[last - 3 * i], data.tokens[last - 3 * i - 1], data.tokens[last - 3 * i - 2]];
    const created = http.post(`${BASE}/api/hackathons/${data.hackathon_id}/teams`,
      JSON.stringify({ name: `Stampede ${i}` }), params(leader, 'setup', true));
    if (created.status !== 201) fail(`setup create ${i}: ${created.status} ${created.body}`);
    const invite = http.get(`${BASE}/api/teams/${created.json('id')}/invite`, params(leader, 'setup'));
    const code = invite.json('code');
    for (const token of [a, b]) {
      const joined = http.post(`${BASE}/api/teams/join`, JSON.stringify({ code }), params(token, 'setup', true));
      if (joined.status !== 200) fail(`setup join ${i}: ${joined.status} ${joined.body}`);
    }
    codes.push(code);
  }
  return { codes };
}

let cursor = null;

/** Board reader: same mix as L-A without think time. */
export function boardReader() {
  const token = data.tokens[__VU - 1];
  let url = `${BASE}/api/hackathons/${data.hackathon_id}/board/teams`;
  if (cursor && Math.random() < 0.3) url += `?cursor=${cursor}`;
  const res = http.get(url, params(token, 'board_teams'));
  if (res.status === 200) cursor = res.json('next_cursor');
}

/** Iteration i: all 50 stampede VUs join team i with fresh users; after busy retries only 200 or 409, one 200 per team. */
export function stampede(setupData) {
  const token = data.tokens[READERS + __ITER * STAMPEDE_USERS + (__VU - 1)];
  const res = postAction(`${BASE}/api/teams/join`, JSON.stringify({ code: setupData.codes[__ITER] }), token, 'join');
  check(res, { 'join 200 or 409': (r) => r.status === 200 || r.status === 409 }, { kind: 'stampede' });
  stampedeWins.add(res.status === 200 ? 1 : 0, { stampede: String(__ITER) });
  sleep(5);
}

/** Churn: fresh users create teams at 2 per second. */
export function churn() {
  const index = READERS + STAMPEDES * STAMPEDE_USERS + __ITER + (__VU - 1) * 1000;
  const token = data.tokens[index % data.tokens.length];
  const res = postAction(`${BASE}/api/hackathons/${data.hackathon_id}/teams`, JSON.stringify({ name: `Churn ${index}` }),
    token, 'create_team');
  check(res, { 'create 201 or 409': (r) => r.status === 201 || r.status === 409 });
}
