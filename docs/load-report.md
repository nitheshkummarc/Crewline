# Load and latency report

Measured numbers only. Scenario definitions are in [verification.md](verification.md) section 8.
Status: development measurements with the Python latency probe are below. The official k6 runs (L-A, L-B, L-C, L-LIVE) are pending: k6 is not installed on the dev machine yet (`winget install k6 --source winget`) and will also run in CI.

## Setup (development measurements, 11 Nov 2026)

| Item | Value |
|---|---|
| Machine | Intel Core i5-12500H (12 cores, 16 threads), 15.7 GB RAM, Windows 11, background CPU load 19 to 44 % |
| Database | PostgreSQL 16.2 (bundled binaries via `database/dev_db.py`), `max_connections=300`, same machine |
| API | uvicorn, 1 worker (the free-tier deploy also runs 1 worker), pools read 10 and write 10 opened at startup |
| Data | `database/seed.py --users 10000 --teams 2000`: 1 hackathon, 10,000 users, 2,000 teams, 3,992 memberships; seeded in 0.9 s, invariants I1 to I9 clean |
| Load client | `backend/scripts/latency_probe.py` on the same machine (Python, httpx) |
| Server-side numbers | Taken from the API's own JSON access log (`duration_ms` per route), so client overhead is excluded |

Commands:

```
uv run --project backend python database/dev_db.py start --name test
JWT_SECRET=... uv run --project backend python database/seed.py --url <db> --tokens loadtest/tokens.json
DATABASE_URL=<db> JWT_SECRET=... LOG_LEVEL=INFO uvicorn --factory app.main:create_app --app-dir backend --port 8805
python backend/scripts/latency_probe.py --base http://127.0.0.1:8805 --rounds 30 --offset 1300 --users 100 --seconds 15 --server-log <log>
```

## Every endpoint, uncontended (server-side, 30 rounds each, after tuning)

| Route | p50 | p95 | p99 |
|---|---|---|---|
| GET /api/auth/me | 1.0 | 1.9 | 22.0 (first request) |
| GET /api/hackathons/{hid}/me | 1.4 | 1.9 | 11.7 |
| GET /api/hackathons/{hid}/board/people | 1.6 | 2.2 | 3.0 |
| GET /api/hackathons/{hid}/suggestions | 16.5 | 32.4 | 40.1 |
| GET /api/teams/{tid} | 1.4 | 2.0 | 2.2 |
| GET /api/teams/{tid}/invite | 1.2 | 1.6 | 1.9 |
| GET /api/teams/{tid}/requests | 1.3 | 1.7 | 2.3 |
| GET /api/teams/{tid}/audit | 1.5 | 1.9 | 4.0 |
| POST /api/hackathons/{hid}/teams | 4.0 | 4.9 | 19.9 |
| POST /api/teams/join | 4.1 | 5.5 | 7.4 |
| POST /api/teams/{tid}/requests | 4.0 | 5.1 | 8.2 |
| POST /api/requests/{rid}/accept | 4.0 | 4.7 | 4.9 |
| POST /api/teams/{tid}/leave | 3.7 | 4.6 | 4.7 |
| PATCH /api/teams/{tid} | 3.6 | 4.6 | 4.6 |
| PATCH /api/users/me | 4.2 | 5.7 | 6.5 |

All in milliseconds. Targets: writes p95 < 150 ms uncontended, suggestions p95 < 300 ms. All met.

## Teams board under 100 concurrent users (no think time, closed loop)

| Run | Client p50 | Client p95 | Client p99 | req/s | Errors | Server-side p95 | Load client CPU |
|---|---|---|---|---|---|---|---|
| 1 client process, 100 users, 30 s | 157.7 | 184.7 | 197.3 | 623 | 0 | 15.7 | saturated |
| 1 client process, 100 users, 20 s, 1 worker | 150.7 | 174.9 | 189.5 | 652 | 0 | — | 19.7 CPU-s in 20 s (100 %) |
| 1 client process, 100 users, 20 s, 2 workers | 149.3 | 169.3 | 178.4 | 663 | 0 | — | 19.6 CPU-s in 20 s (100 %) |
| **4 client processes x 25 users, 20 s** | **75.8** | **114.5** | **153.7** | **1,224** | **0** | — | 15 to 15.7 CPU-s each in 20 s |
| 1 client process, 100 users, 15 s (after tuning) | 156.5 | 296.6 | 349.1 | 576 | 0 | 24.2 | 14.7 CPU-s in 15 s (98 %) |

Spec target: board p95 < 200 ms at 100 concurrent users. Met with every load client configuration that is not CPU-saturated, and server-side p95 is 15.7 to 24 ms.

Why the single-process client numbers are not the board's latency: during the run the load client used a full core while the server used about 35 % of one (6.9 CPU-s in 20 s) and PostgreSQL 0.2 CPU-s (the board cache serves most reads). A second server worker did not raise throughput (652 to 663 req/s), which confirms the client was the limit. Splitting the same 100 users over 4 client processes doubled throughput and cut p95 to 114.5 ms. With a closed loop, latency is about users / throughput (100 / 652 req/s ≈ 153 ms), so a saturated client caps it. The official number comes from k6, which uses far less CPU per request.

## Database plans

`EXPLAIN (ANALYZE, BUFFERS)` on the seeded data, saved in [explain/board.md](explain/board.md):

| Query | Plan | Execution time |
|---|---|---|
| Teams board first page | Index Only Scan using `teams_board` | 4.1 ms |
| People board first page | Index Only Scan using `participants_board` | 0.23 ms |
| Suggestions candidates | Seq scans + top-N heapsort of about 6,000 rows (an ORDER BY on an expression with a parameter cannot use an index) | 9.5 ms |

## Tuning steps (before and after, measured)

| Step | Change | Before | After |
|---|---|---|---|
| 1 | Test clients share one TLS context (bug B-19, test-only) | race round 41 s | 2.6 s |
| 2 | Pools opened at startup, never reaped (bug B-20) | stampede 409 p95 826 ms | 470 ms |
| 3 | Suggestions: cache ZoneInfo objects and offsets per zone and instant; compute overlap once per candidate (bug B-21) | scoring 17.7 ms; endpoint p50 32.0 ms | scoring 3.8 ms; endpoint p50 16.5 ms |

## Correctness under load

| Run | Result |
|---|---|
| Seed | Invariants I1 to I9 clean |
| 50-way stampedes (T-RACE-01, 20 rounds) | Exactly one winner every round; invariants clean |
| Overload (T-GUAR-01) | Fast 503 with Retry-After, no 500, correct final membership |
| Chaos (T-CHAOS-01): 3 hard kills in 60 s, 200 users | 23,012 actions, 0 x 500, 0 replay mismatches, 0 over capacity, invariants clean |

## Pending (k6)

| Scenario | Status |
|---|---|
| L-A1 / L-A2 board, 100 VUs | script `loadtest/board.js` written; to run with k6 |
| L-B mixed (board + stampedes + churn) | script `loadtest/mixed.js` written; to run with k6 |
| L-C soak 10 min | script `loadtest/soak.js` written; to run with k6 |
| L-LIVE against the deployed URL | after deploy (module 9) |
