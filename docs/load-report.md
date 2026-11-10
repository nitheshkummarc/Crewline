# Load test report

Template. Fill with measured numbers only. Scenario definitions are in [verification.md](verification.md) section 8.

## Setup

| Item | Local | Live |
|---|---|---|
| Machine / host | TBD (CPU, cores, RAM, OS) | Render free, Singapore |
| Database | Postgres 16 in Docker, `max_connections=200` | Neon free, ap-southeast-1, `max_connections` = TBD |
| API | uvicorn, 2 workers | uvicorn, 1 worker |
| Pools per worker | read 10, write 10, listener 1 | same |
| Data | 10,000 users, 2,000 teams, 1 hackathon | demo seed |
| k6 version and location | TBD (same machine / separate machine) | TBD |
| Commit | TBD | TBD |

Commands:

```
uv run --project backend python database/seed.py --users 10000 --teams 2000 --tokens loadtest/tokens.json
k6 run loadtest/board.js                 # L-A1
k6 run -e THINK=1 loadtest/board.js      # L-A2
k6 run loadtest/mixed.js                 # L-B
k6 run loadtest/soak.js                  # L-C
k6 run -e BASE_URL=https://<live-url> -e DURATION=30s loadtest/board.js   # L-LIVE
uv run --project backend python database/invariants.py
```

## Results

| Scenario | VUs | req/s | p50 | p95 | p99 | max | errors | Threshold |
|---|---|---|---|---|---|---|---|---|
| L-A1 board, no think time (local) | 100 | | | | | | | p95 < 200 ms |
| L-A2 board, 1 s think time (local) | 100 | | | | | | | p95 < 200 ms |
| L-B mixed: board route (local) | 100 + stampedes | | | | | | | p95 < 200 ms |
| L-B mixed: join route (local) | | | | | | | | — |
| L-C soak 10 min (local) | 100 | | | | | | | flat |
| L-LIVE board (live) | 100 | | | | | | | reported |

## Database and pool metrics

| Scenario | Max connections used | Write pool wait p95 | Read pool wait p95 | Lock timeouts | 503 busy | Deadlocks | Cache hit rate |
|---|---|---|---|---|---|---|---|
| L-A1 | | | | | | | |
| L-B | | | | | | | |
| L-C | | | | | | | |

## Stampedes in L-B

| Stampedes | Each had exactly one 200 | Mean time to resolve all 50 | Max |
|---|---|---|---|
| | | | |

## Tuning steps (before / after)

| Step | Change | Board p95 before | after | Notes |
|---|---|---|---|---|
| 1 | Partial index `teams_board` | | | EXPLAIN in docs/explain/ |
| 2 | Micro-cache of bytes | | | |
| 3 | Pool sizes | | | |

## Invariants after each run

| Run | Violations |
|---|---|
| Seed | |
| L-A1 | |
| L-B | |
| L-C | |
| Chaos | |

## Observations and limits

- What broke first and at what load: TBD
- Free tier vs local difference and why: TBD
