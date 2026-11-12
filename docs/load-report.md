# Load and latency report

Measured numbers only. Scenario definitions are in [verification.md](verification.md) section 8.
Status: the k6 scenarios L-A1, L-A2, L-B and L-C were run on 12 Nov 2026 in the `load.yml` workflow (results first, below). The development measurements with the Python latency probe and the CI smoke runs follow. L-LIVE (against the deployed URL, free tier) has its own section below.

## k6 results (L-A1, L-A2, L-B, L-C), 12 Nov 2026

Run [43194526097](https://github.com/nitheshkummarc/Crewline/actions/runs/43194526097) of `.github/workflows/load.yml` on commit `3aced2b`. Every number below is from that run's annotations; the k6 summaries, SSE log and API log are in its `load-results` artifact.

| Item | Value |
|---|---|
| Machine | GitHub-hosted `ubuntu-24.04` runner: 4 vCPU Intel Xeon Platinum 8573C, 15 GB RAM. k6, the API and PostgreSQL share it, so the numbers include the load generator's own CPU use |
| Database | PostgreSQL 18 (`postgres:18` in Docker, `max_connections=300`), the version Neon runs in production |
| API | 1 uvicorn worker, production defaults: pools read 10 and write 10 opened at startup, in-flight write cap 30, 1 s board cache. Only `RATE_CODE_PER_IP_MIN` is raised, because every k6 request comes from one IP |
| Data | `database/seed.py --users 10000 --teams 2000 --tokens loadtest/tokens.json` |
| Tool | k6 v2.3.0; `--summary-trend-stats "avg,min,med,max,p(90),p(95),p(99)"` |

Teams board (`GET /api/hackathons/{hid}/board/teams`, client-side, milliseconds):

| Scenario | Command | p50 | p95 | p99 | max | req/s | Requests | Thresholds |
|---|---|---|---|---|---|---|---|---|
| L-A1: 100 VUs, no think time, 30 s ramp + 60 s steady | `k6 run loadtest/board.js` | 54.9 | 80.1 | 93.9 | 147.2 | 1,643 | 147,898 | passed |
| L-A2: same with 1 s think time | `k6 run -e THINK=1 loadtest/board.js` | 0.8 | 2.4 | 3.9 | 10.7 | 83 | 7,520 | passed |
| L-B: mixed (below) | `k6 run loadtest/mixed.js` with `sse_listeners.py --streams 50` alongside | 61.4 | 92.4 | 110.4 | 636.5 | 1,444 | 102,539 | passed |
| L-C: 100 VUs, 1 s think time, 10 minutes | `k6 run loadtest/soak.js` | 8.2 | 21.4 | 40.2 | 71.8 | 99 | 59,500 | passed (p95 < 200, p99 < 400) |

Spec target: board p95 < 200 ms at 100 concurrent users. Met in every scenario, including L-B with stampedes and churn running at the same time.

L-B in detail: 100 board readers, 12 stampedes (one every 5 s) of 50 fresh users on a fresh one-seat team, 2 team creations per second, and 50 open SSE streams.

| Check | Result |
|---|---|
| Winners per stampede | `[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]`: exactly one in each of the 12 |
| Final statuses of joins and creates | only 200/201 or 409, after 11 `503 busy` answers retried with the same key |
| SSE | 50 streams, 0 failed, 97 team events received by each (4,850 in total), 0 dropped by the server |
| Database | 0 deadlocks (`pg_stat_database`), 0 deadlock or state retries, 0 listener reconnects |
| Invariants I1 to I10 | clean after L-B and again after L-C |

L-C covers the whole 10 minutes in one aggregate: p99 40.2 ms and max 71.8 ms over 59,500 requests leave no room for a slowdown during the run. A per-minute series was not recorded.

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
| 1 client process, 100 users, 20 s, 1 worker | 150.7 | 174.9 | 189.5 | 652 | 0 | - | 19.7 CPU-s in 20 s (100 %) |
| 1 client process, 100 users, 20 s, 2 workers | 149.3 | 169.3 | 178.4 | 663 | 0 | - | 19.6 CPU-s in 20 s (100 %) |
| **4 client processes x 25 users, 20 s** | **75.8** | **114.5** | **153.7** | **1,224** | **0** | - | 15 to 15.7 CPU-s each in 20 s |
| 1 client process, 100 users, 15 s (after tuning) | 156.5 | 296.6 | 349.1 | 576 | 0 | 24.2 | 14.7 CPU-s in 15 s (98 %) |

Spec target: board p95 < 200 ms at 100 concurrent users. Met with every load client configuration that is not CPU-saturated, and server-side p95 is 15.7 to 24 ms.

Why the single-process client numbers are not the board's latency: during the run the load client used a full core while the server used about 35 % of one (6.9 CPU-s in 20 s) and PostgreSQL 0.2 CPU-s (the board cache serves most reads). A second server worker did not raise throughput (652 to 663 req/s), which confirms the client was the limit. Splitting the same 100 users over 4 client processes doubled throughput and cut p95 to 114.5 ms. With a closed loop, latency is about users / throughput (100 / 652 req/s ≈ 153 ms), so a saturated client caps it. The official number comes from k6, which uses far less CPU per request.

## k6 smoke in CI (L-A1 shortened, every push)

Job `k6-smoke` in `.github/workflows/ci.yml`: GitHub-hosted `ubuntu-24.04` runner; PostgreSQL 16 (`postgres:16` in Docker, `max_connections=300`), the API (1 uvicorn worker, default pools read 10 and write 10) and k6 all on the same runner. Data from `database/seed.py --users 10000 --teams 2000`. Command: `k6 run -e RAMP=5s -e DURATION=15s loadtest/board.js` (100 VUs, no think time, 70 % first page, 30 % next cursor). Numbers are client-side, from the run's annotation.

| Run | Commit | p50 | p95 | p99 | max | req/s | Requests | Thresholds |
|---|---|---|---|---|---|---|---|---|
| [43063124622](https://github.com/nitheshkummarc/Crewline/actions/runs/43063124622) | `d4a0f5f` | 68.5 | 108.1 | 123.4 | 177.6 | 1,308 | 26,226 | passed |
| [43063463873](https://github.com/nitheshkummarc/Crewline/actions/runs/43063463873) | `5fe142c` | 47.6 | 71.1 | 81.2 | 140.2 | 1,925 | 38,558 | passed |

All in milliseconds. Spec target p95 < 200 ms: met in both runs. The two runs differ by about 1.5x on identical code, which is runner-to-runner variation on shared hardware; the full L-A runs report their own numbers.

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
| Seed | Invariants clean (I1 to I9 at the time; I10 was added with the Race lab and is clean on every later seed) |
| 50-way stampedes (T-RACE-01, 20 rounds) | Exactly one winner every round; invariants clean |
| Overload (T-GUAR-01) | Fast 503 with Retry-After, no 500, correct final membership |
| L-B under load (k6 run 43194526097): 12 stampedes of 50 on one-seat teams with readers, churn and 50 SSE streams | Exactly one winner in each stampede; 0 deadlocks; invariants clean after L-B and after L-C |
| Chaos (T-CHAOS-01): 3 hard kills in 60 s, 200 users | 23,012 actions, 0 x 500, 0 replay mismatches, 0 over capacity, invariants clean |

## L-LIVE: the deployed URL (free tier), 12 Nov 2026

Target https://crewline-20bm.onrender.com: Render free web service (Singapore, 1 uvicorn worker, 0.1 CPU) and Neon free PostgreSQL 18 (Singapore), seeded with 300 users and 40 teams. Client: k6 v2.3.0 on the dev laptop in India over a home connection (TCP connect to the site about 66 ms). Sessions: 20 seeded users logged in through the API (`live_tokens.py` in the session scratchpad, not in the repo) and shared by the 100 VUs. Command: `k6 run -e BASE_URL=<live> -e TOKENS=<file> -e RAMP=10s -e DURATION=30s [-e THINK=1] loadtest/board.js`.

| Run | p50 | p95 | p99 | max | req/s | Requests | Errors | p95 < 200 ms |
|---|---|---|---|---|---|---|---|---|
| 100 VUs, 1 s think time (people reading the board) | 68.8 | 101.0 | 314.6 | 414.0 | 80 | 3,291 | 0 | met |
| 100 VUs, no think time (stress) | 893.7 | 1,110.6 | 1,307.9 | 1,507.4 | 124 | 5,073 | 0 | not met |

Why the stress run is slow, from the measurements: the API's own timing for the board (Race lab latency window, last 1,000 requests) was p50 7.3 ms and p95 107.5 ms, so most of the 1.1 s is queueing in front of the handler. In a closed loop, latency is about users divided by throughput (100 / 124 req/s, about 0.8 s), and throughput is capped by the free plan's 0.1 CPU: the same code on 4 vCPU served 1,643 req/s at p95 80.1 ms (L-A1 above). A paid instance or a second worker raises the cap; the code does not change.

