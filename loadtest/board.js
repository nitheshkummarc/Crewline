// Scenario L-A: teams board under 100 concurrent users; THINK=1 gives L-A2 (1 s think time).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE, loadData, params } from './lib.js';

const data = loadData();
const THINK = Number(__ENV.THINK || 0);

export const options = {
  scenarios: {
    board: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP || '30s', target: 100 },
        { duration: __ENV.DURATION || '60s', target: 100 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    'http_req_duration{route:board_teams}': ['p(95)<200'],
    'http_req_failed{route:board_teams}': ['rate<0.001'],
  },
};

let cursor = null;

/** One board read: 70 % first page, 30 % follow the last cursor. */
export default function () {
  const token = data.tokens[(__VU - 1) % data.tokens.length];
  let url = `${BASE}/api/hackathons/${data.hackathon_id}/board/teams`;
  if (cursor && Math.random() < 0.3) url += `?cursor=${cursor}`;
  const res = http.get(url, params(token, 'board_teams'));
  check(res, { 'board 200': (r) => r.status === 200 });
  if (res.status === 200) cursor = res.json('next_cursor');
  if (THINK) sleep(THINK);
}
