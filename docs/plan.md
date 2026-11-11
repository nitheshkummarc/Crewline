# Build plan

Written Tue 10 Nov 2026. Deadline Sun 15 Nov 2026, 11:59 PM IST. Target submit: Sun 15 Nov, 6 PM IST.

## Progress (resume here)

Last checkpoint: Wed 11 Nov 2026, end of module 5 plus guarantee tests. All 88 backend tests pass (`RACE_ITERATIONS=20`), ruff and mypy clean, pushed to `main`.

| Module | Scope | Status |
|---|---|---|
| 1 Foundation | Schema 0001 + 0002, migrate, dev_db, pools, `run_write`, errors, app skeleton, test harness | done |
| 2 Auth and hackathons | Signup, login, logout, me, profile (team version bump), register, looking flag, meta | done |
| 3 Teams | Create, join by code, leave, handover, delete with tombstone, remove, finalize, reopen, invite, update, team audit; race tests + negative control | done |
| 4 Join requests | Create (team FOR SHARE, participant lock, cap 5), accept (stale on 23505), decline, withdraw, lists; T-API-14 to 18, 42, 43; T-RACE-05, 06, 07, 13, 17, 18 | done |
| 5 Board and suggestions | Keyset board (teams, people), micro-cache + ETag, suggestions + scoring unit tests; guarantee tests T-GUAR-01 to 04 (overload, per-user limits, atomicity) | done |
| 6 Realtime | Listener with reconnect, EventHub (team, people, request audience), SSE endpoint, cache invalidation on notify (B-2), metrics | next |
| 7 Data and load | `database/seed.py`, k6 scenarios, chaos test, EXPLAIN | planned |
| 8 Frontend | `frontend/` React app (run `/impeccable init` first) | planned |
| 9 Ops | Dockerfile, Compose, GitHub Actions, deploy (Render + Neon), README, design doc numbers, video | planned |

How to resume: start the dev database (`uv run --project backend python database/dev_db.py start --name test` happens automatically in tests), run `uv run --project backend pytest backend/tests -q` from the repo root (about 2 minutes), then continue with the module marked next. Read "Known pitfalls" in CLAUDE.md and docs/bug-diary.md first.

## Scope tiers

| Tier | Contents | Rule |
|---|---|---|
| 0, spec must-haves | R1 to R19 in requirements.md, design doc, load report, video | Must ship |
| 1, differentiators | Negative control, invariant checker, lock-order discipline, read/write pools and timeouts, mixed load test (L-B), error contract, bug diary | Do these |
| 2, listed bonuses | Docker Compose, chaos test, `/metrics`, optimistic UI | After Tier 1 |
| 3, only if ahead | Randomized concurrent test (T-RACE-14), soak (L-C), lock strategy benchmark, audit replay | Only if ahead on Saturday |

Cut order if behind: Tier 3, then optimistic UI, then UI polish. Never cut: race test, negative control, idempotency, CI, invariants, load report.

## Schedule

| Day | Hours | Work | Done when |
|---|---|---|---|
| Tue 10 | 5 | Register on Hack4Hack and read the submission form. Min/max team size rule confirmed (ADR-010). Repo, `pyproject`, Compose, `0001_init.sql`, `migrate.py`, `db/pools.py`, `db/tx.py`, `db/errors.py`. Create team, join by code. T-RACE-01, 02, 03, 16 | Race test, negative control and same-key race pass locally |
| Wed 11 | 8 | Auth, hackathons, requests (create, accept, decline, withdraw), leave, remove, finalize, reopen, regenerate. Audit `record`. Replay fast path and explanation reads. Rate limits. API tests T-API-01 to 30. CI with Postgres | 30+ tests green in CI |
| Thu 12 | 8 | Listener, EventHub (team, people, request audience), SSE endpoint. Participant and profile events. Board + cache + ETag. Suggestions + unit tests. Metrics. Remaining race tests (04 to 13, 15, 17 to 19). Web: run `/impeccable init` to write PRODUCT.md and DESIGN.md, then client, auth pages, board, team page | Two browsers see live updates, including the People board |
| Fri 13 | 8 | Seed script, EXPLAIN check, k6 L-A1, L-A2, L-B, tuning with before/after numbers. Rest of web (requests, invite, suggestions, profile). First deploy to Render + Neon, test SSE and cold start on the host | Live URL works; load report has first numbers |
| Sat 14 | 8 | Chaos test. Accessibility pass (keyboard, phone). Optimistic UI. `/impeccable audit` and `/impeccable polish` on the main pages; `emil-design-eng` review of transitions. README, design doc, load report final numbers, bug diary. Video script. Tier 3 only if everything above is green | All checklist items except video |
| Sun 15 | 4 | Record the video. Verify everything on the live URL from a clean browser. Tag and submit | Submitted by 6 PM IST |

No new features on Sunday.

## Daily routine

1. Start: re-read the day's row, run `make test` and `make race`.
2. Every feature: code, tests, invariants, CODEMAP, api.md, verification.md status.
3. End: push, CI green, note real bugs in bug-diary.md.

## Video script (5 minutes max)

| Time | Content |
|---|---|
| 0:00 | The problem in one sentence; stack and why one database |
| 0:30 | Run the negative control (multiple winners), then the real race test (exactly one) |
| 1:30 | Walk the join SQL: conditional UPDATE, READ COMMITTED re-check, lock order, unique index, CHECK backstop |
| 2:15 | Idempotency: retry of a winning join replays 200; same key, different body gives 422 |
| 2:45 | Two browsers and a phone: live board, request accept, leader handover |
| 3:30 | Load report: L-A and L-B numbers, pool metrics, 0 deadlocks |
| 4:10 | Chaos test output and invariant checker clean |
| 4:40 | Known gaps and what one more week adds |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Race test is secretly serial (small pool, in-process transport, sequential awaits) | Real uvicorn subprocess, pool 60, barrier, negative control must fail |
| Idempotency rows left without response | Claim and store in one transaction; I9 |
| Event sent before commit | Only the audit trigger publishes; pg_notify is commit-bound |
| Pool starvation from long transactions or SSE | Two pools, SSE never holds a connection, timeouts, `/metrics` |
| Render free sleeps or buffers SSE | Keep-warm ping, `X-Accel-Buffering: no`, tested Friday |
| Neon scale-to-zero drops the listener | Listener reconnect + resync (B-3) |
| k6 and the app compete for one laptop's CPU | Note hardware; run k6 from a second machine if possible; label results |
| Python CPU on a small host | Cached bytes, orjson, no ORM, argon2 off the event loop |
| Code I cannot explain | Write the transaction core by hand; read every generated line; drills below |
| Scope creep after Thursday | Tier rules above |
| Submitting late | Submit by 6 PM Sunday |

## Interview preparation

Answer each with the code open:

1. Why a conditional UPDATE, not FOR UPDATE, SKIP LOCKED or Redis? (Exact, one statement, one system. SKIP LOCKED can report full while the winner may still roll back.)
2. What happens to the 49 losers, step by step? (Wait on the row lock, re-check the predicate on the committed row, 0 rows, 409.)
3. Why READ COMMITTED, and why no subquery in the guarding WHERE?
4. What is the lock order and which deadlock does it prevent? (FK KEY SHARE from membership insert vs FOR UPDATE / DELETE on the team.)
5. How do you know the race test really races? (Real server, 60 connections, barrier, negative control fails.)
6. What if the process dies mid-join? With two instances? (Postgres aborts the open transaction; retry with the same key. Instances share only the database.)
7. How does a retry replay, and why are rejections not stored?
8. Why 409 vs 503, and which does the client retry?
9. How did you size the pools? What happens when they run out?
10. Why are events hints and not a replay log?
11. What breaks first at 10x load? (Python CPU on the board; then the write pool under stampedes; then the single listener fan-out.)
12. Why Postgres when the organizers prefer MongoDB?

Live-change drills (each under 10 minutes, with a test):
- Change the max team size rule (for example, per-team override).
- Add a field to the board response.
- Add a new audit action (for example, `team_renamed`).
- Change invite code expiry to 24 h and show the test.
- Add a "transfer leadership" endpoint with the leader predicate.

## One more week

Join as a single SQL function (1 round trip) · shared rate limits in Postgres · audit replay checker · organizer view (lock all teams, CSV export) · lock strategy benchmark · capacity curve to 400 users · Playwright end-to-end tests · token revocation list.
