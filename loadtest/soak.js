// Scenario L-C: 10-minute steady board load with 1 s think time; latency must stay flat.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE, loadData, params } from './lib.js';

const data = loadData();

export const options = {
  scenarios: { soak: { executor: 'constant-vus', vus: 100, duration: __ENV.DURATION || '10m' } },
  thresholds: {
    'http_req_duration{route:board_teams}': ['p(95)<200', 'p(99)<400'],
    'http_req_failed{route:board_teams}': ['rate<0.001'],
  },
};

/** One board read followed by 1 s of think time. */
export default function () {
  const token = data.tokens[(__VU - 1) % data.tokens.length];
  const res = http.get(`${BASE}/api/hackathons/${data.hackathon_id}/board/teams`, params(token, 'board_teams'));
  check(res, { 'board 200': (r) => r.status === 200 });
  sleep(1);
}
