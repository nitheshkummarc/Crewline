# Verification plan

How every claim in this project is proven. Each test has an ID used in test names, [requirements.md](requirements.md) and the bug diary.
Status values: `planned`, `written`, `passing`. Update this file in the same commit as the test.

## 1. Invariants

`database/invariants.sql` holds one query per invariant; each must return zero rows. `database/invariants.py` runs them, prints violations, and exits non-zero if any exist.

| ID | Invariant | Enforced by | Query (must return no rows) |
|---|---|---|---|
| I1 | `member_count` equals actual membership rows | Transactions | `SELECT t.id FROM teams t LEFT JOIN memberships m ON m.team_id = t.id GROUP BY t.id HAVING count(m.user_id) <> t.member_count;` |
| I2 | Every team has 1 to `max_size` members | `teams_cap` | `SELECT id FROM teams WHERE member_count < 1 OR member_count > max_size;` |
| I3 | The leader is a member of the team | Transactions | `SELECT t.id FROM teams t LEFT JOIN memberships m ON m.team_id = t.id AND m.user_id = t.leader_id WHERE m.user_id IS NULL;` |
| I4 | At most one team per user per hackathon | Unique index | `SELECT hackathon_id, user_id FROM memberships GROUP BY 1, 2 HAVING count(*) > 1;` |
| I5 | A finalized team meets its minimum size | `teams_min_when_finalized` | `SELECT id FROM teams WHERE status = 'finalized' AND member_count < min_size;` |
| I6 | A membership's hackathon equals its team's | Composite FK | `SELECT m.team_id, m.user_id FROM memberships m JOIN teams t ON t.id = m.team_id WHERE t.hackathon_id <> m.hackathon_id;` |
| I7 | Every membership has a creating audit event | Same-transaction audit | `SELECT m.team_id, m.user_id FROM memberships m WHERE NOT EXISTS (SELECT 1 FROM audit_events a WHERE a.team_id = m.team_id AND a.action IN ('team_created', 'member_joined_via_code', 'request_accepted') AND (a.payload->>'user_id')::uuid = m.user_id);` |
| I8 | A join request is accepted at most once | Status predicate | `SELECT payload->>'request_id' FROM audit_events WHERE action = 'request_accepted' GROUP BY 1 HAVING count(*) > 1;` |
| I9 | No committed idempotency key without a response | Claim and store in one transaction | `SELECT user_id, key FROM idempotency_keys WHERE response_status IS NULL OR response_body IS NULL;` |

I9 note: the response columns are nullable because the claim inserts the row before the response exists. The checker runs in its own transaction and sees only committed rows, so any row it returns is a real bug (a commit without a stored response), never an in-flight claim.

When the invariant checker runs: after every concurrency test module, after the API test suite, on seeded data, after every load scenario, after the chaos test, and in CI as its own step.

Seed caveat for I7: `database/seed.py` writes `team_created` and `member_joined_via_code` audit rows for seeded members so I7 holds on seeded data.

## 2. API tests (pytest, real PostgreSQL)

| ID | Test | Expected | Status |
|---|---|---|---|
| T-API-01 | Signup validates input and creates a user | 201, cookie set; 400 on short password, bad email, unknown skill | passing |
| T-API-02 | Signup with an existing email | 409 `email_taken` (case-insensitive) | passing |
| T-API-03 | Login with a wrong password | 401 `invalid_credentials` | passing |
| T-API-04 | Protected route without or with an expired cookie | 401 `unauthenticated` | passing |
| T-API-05 | Register for a hackathon twice | 200 both times, one participant row | passing |
| T-API-06 | Create team | 201, leader is the only member, count 1, status forming, audit `team_created` with user_id | passing |
| T-API-07 | Create a second team in the same hackathon | 409 `already_in_team`, no team row created | passing |
| T-API-08 | Join with a valid code | 200, count +1, audit `member_joined_via_code` | passing |
| T-API-09 | Join with an expired code | 404 `invite_invalid` | passing |
| T-API-10 | Join with an unknown code | 404 with a body identical to T-API-09 apart from request_id | passing |
| T-API-11 | Join a full team | 409 `team_full`, count unchanged | passing |
| T-API-12 | Join a team you are already in | 200 with current team, no new row, no audit | passing |
| T-API-13 | Join a finalized team | 409 `team_finalized` | passing |
| T-API-14 | Create a join request twice | 201 then 200 with the same request id | passing |
| T-API-15 | Accept a request as a non-leader | 403 `not_leader`, nothing changed | passing |
| T-API-16 | Decline a request as leader; decline again | 200 then 409 `request_not_pending` | passing |
| T-API-17 | Withdraw own request; withdraw someone else's | 200; 404 | passing |
| T-API-18 | Accept a request from a user who joined another team | 409 `already_in_team`, request becomes `stale`, team count unchanged, audit `request_stale` | passing |
| T-API-19 | Non-leader member leaves | 200, count −1, leader unchanged, audit `member_left` | passing |
| T-API-20 | Leader leaves with 3 members | Earliest joined member becomes leader, audit `leader_promoted` actor null | passing |
| T-API-21 | Last member leaves | Team row gone, its requests gone, audit `member_left` and `team_deleted` remain | passing |
| T-API-22 | Leader removes a member; non-leader tries; leader removes self | 200; 403 `not_leader`; 409 `cannot_remove_self` | passing |
| T-API-23 | Finalize below min size; at min size | 409 `below_min_size`; 200, status finalized | passing |
| T-API-24 | Member leaves a finalized team | Status back to forming, audit `team_reopened` | passing |
| T-API-25 | Regenerate invite code | Old code 404, new code works, audit has no code in payload | passing |
| T-API-26 | Same key, same body, sent twice in sequence | Second response identical to the first, one effect | passing |
| T-API-27 | Same key, different body | 422 `idempotency_key_mismatch` | passing |
| T-API-28 | Mutation without `Idempotency-Key` | 400 `idempotency_key_required` | passing |
| T-API-29 | Validation: bad UUID, name too long, limit 500, message 281 chars, unknown IANA time zone | 400 `validation_error` each (never FastAPI's default 422) | passing |
| T-API-30 | 6 wrong codes in a minute from one user | 6th gets 429 `rate_limited` with `Retry-After` | passing |
| T-API-31 | Board pagination | Pages do not overlap, full and finalized teams excluded, `next_cursor` null at end | passing |
| T-API-32 | Board ETag | Second request with `If-None-Match` gets 304 | passing |
| T-API-33 | Suggestions | Candidate covering missing roles ranks above a duplicate-skill candidate; breakdown and reasons present; deterministic order | passing |
| T-API-34 | Audit append-only | Direct `UPDATE audit_events` and `DELETE` raise | passing |
| T-API-35 | SSE event after commit | Subscriber receives `team` event with new version within 1 s of a join | passing |
| T-API-36 | No SSE event after rollback | A rejected join (409) produces no event | passing |
| T-API-37 | Team audit endpoint | Members get events newest first; non-member gets 403 `members_only` | passing |
| T-API-38 | `/metrics` | Exposes pool gauges and route histograms | passing |
| T-API-39 | Invite code visibility | Board and events never contain `invite_code`; `/invite` returns it to members only | passing |
| T-API-40 | Participant registers, then toggles `looking` | Each publishes a `people` event; the People board reflects it on the next fetch (cache cleared); audit rows `participant_registered`, `participant_updated` | passing |
| T-API-41 | Team member changes skills | Team `version` increases; a `team` event carries the new skills; board shows them | passing |
| T-API-42 | Request event privacy | A non-member subscriber receives no `request` events; the leader and the requester do | passing |
| T-API-43 | Create a request for a full team | 409 `team_full`, no request row | passing |
| T-API-44 | Suggestions for a caller without a team | `context.team_id` null; the time zone term compares against the caller; a candidate covering the caller's missing roles ranks first | passing |
| T-API-45 | Leave as the last member | `team_deleted` event has `team: null` and `version` = last version + 1 | passing |

## 3. Concurrency tests

Setup: real uvicorn subprocess, write pool 60, one client per user, `asyncio.Event` barrier, retry 503 with the same key, exact assertions, invariants after.

| ID | Scenario | Assertions | Status |
|---|---|---|---|
| T-RACE-01 | 50 users join one team with one open seat, repeated `RACE_ITERATIONS` (20) times | Each iteration: exactly 1 × 200, 49 × 409 `team_full`; `member_count == max_size`; 4 membership rows; invariants clean | passing |
| T-RACE-02 | Negative control: naive check-then-insert on a schema without `teams_cap`, 15 ms sleep between check and write | More than 1 winner in at least one iteration (the test can fail) | passing |
| T-RACE-03 | Real join on the same weakened schema | Exactly 1 winner every iteration (the predicate does the work, not only the CHECK) | passing |
| T-RACE-04 | One user joins two different teams at the same instant | Exactly one membership; the other team's count unchanged | passing |
| T-RACE-05 | Code join and leader accept race for the last seat | Exactly one new member | passing |
| T-RACE-06 | Two leaders accept the same user at the same instant | One membership; other request `stale`; other team count unchanged | passing |
| T-RACE-07 | Same request accepted twice concurrently (two tabs) | Count +1 once; one 200, one 409 `request_not_pending` | passing |
| T-RACE-08 | Leader leaves while 10 users join | Leader is always a member; I1 to I3 hold | passing |
| T-RACE-09 | Last member leaves while 10 users join | No deadlock, no 500; either team deleted and joins 404, or joins succeed then leave decrements; invariants clean | passing |
| T-RACE-10 | Same idempotency key sent 20 times at once | One membership; 20 identical bodies | passing |
| T-RACE-11 | Retry after a successful last-seat join (bug B-1) | Retry with the same key, sent after the original commits, returns 200 replay, not 409 | passing |
| T-RACE-12 | Key reused after a 409 | Request re-executes (no stuck row); I9 clean | passing |
| T-RACE-13 | Accept vs withdraw of the same request | Exactly one transition; counts consistent | passing |
| T-RACE-14 | Randomized: 200 operations (join, leave, request, accept, decline, withdraw, remove) on 20 teams and 50 users, 16 workers, fixed seed printed on failure | Invariants clean; no 500 | planned (Tier 3) |
| T-RACE-15 | Deadlock counter | `pg_stat_database.deadlocks` unchanged after the whole concurrency suite | passing |
| T-RACE-16 | A join and its retry (same key) fire together with 48 other joiners for the last seat (bug B-7) | If the keyed request wins, both copies return the same 200; never a 200 plus a 409 for the same key | passing |
| T-RACE-17 | 20 users create join requests while 20 others join by code until the team is full | No request created after the team became full (`created_at` vs the filling audit event) unless it was created before; no 500 | passing |
| T-RACE-18 | One user fires 8 create-request calls to 8 teams at once | Exactly 5 pending, 3 × 409 `too_many_pending_requests` | passing |
| T-RACE-19 | Profile update while 10 users join the same team | No deadlock; final snapshot version is the highest; invariants clean | planned |

## 3b. Guarantee tests (dedicated servers)

`backend/tests/concurrency/test_guarantees.py`. Each starts its own server with special settings; the fault tests use a separate database (`crewline_faults`) with a trigger that makes the audit insert fail for listed users. Mapping to guarantees: architecture.md section 17.

| ID | Guarantee | Scenario | Assertions | Status |
|---|---|---|---|---|
| T-GUAR-01 | Queue wait under overload | Server with write pool 2, acquire timeout 0.2 s, in-flight cap 4; 40 joins at once for the last seat, no retry; then the same with retries | First pass: some `503 busy` with `Retry-After: 1`, each in under 2 s, no 500, at most one 200. After retries: no 503 or 500, team has exactly 4 members | passing |
| T-GUAR-02 | Per-user request limits | Server with 5 mutations/min, 3 logins/min, 2 signups/hour | 6th mutation of one user is 429 `rate_limited` with `Retry-After`; another user still gets 200; 4th login 429; 3rd signup 429 | passing |
| T-GUAR-03 | Atomicity of join | Audit insert fails for the joining user | 500; seat count, membership and idempotency key all unchanged; same key succeeds after the fault is removed; invariants clean | passing |
| T-GUAR-04 | Atomicity of accept | Audit insert fails for the requester | 500; request still pending, count unchanged; accept succeeds after the fault is removed; invariants clean | passing |

## 4. Unit tests

| ID | Test | Status |
|---|---|---|
| T-UNIT-01 | Scoring: circular hour distance (`Pacific/Kiritimati` vs `Pacific/Pago_Pago`), DST (`America/New_York` vs `Europe/London` in March and November give different offsets), overlap, complement with empty `M`, redundancy, clamp, tie order, one-person group | passing |
| T-UNIT-06 | Time zone validation: valid IANA names pass, offsets like `+05:30` and unknown names fail | passing |
| T-UNIT-07 | Sliding-window limiter: allows `limit` events per window per key, then returns a positive wait | passing |
| T-UNIT-02 | Invite codes: alphabet, length, normalization (`o`→`0`, `l`→`1`, dashes), format regex matches the DB CHECK | passing |
| T-UNIT-03 | Cursor encode and decode round trip; tampered cursor → 400 | passing |
| T-UNIT-04 | Request hash: key order and whitespace do not change the hash; body change does | passing |
| T-UNIT-05 | Error mapping: each constraint name maps to the right error code | passing |

## 5. Web tests (Vitest)

| ID | Test | Status |
|---|---|---|
| T-WEB-01 | Optimistic join rolls back on 409 and shows the conflict message | planned |
| T-WEB-02 | `backend/client` retries 503 with the same `Idempotency-Key` and stops on 409 | planned |
| T-WEB-03 | `mergeTeam` keeps the higher version; null removes; older snapshot does not overwrite newer event | planned |
| T-WEB-04 | Tombstone: after a `team_deleted` event, a board fetch that still contains the team (lower version) does not restore it | planned |

## 6. Ops checks

| ID | Check | Status |
|---|---|---|
| T-OPS-01 | `database/seed.py --users 10000 --teams 2000` finishes in under 60 s and invariants pass | planned |
| T-OPS-02 | `docker compose up` from a clean clone serves `/readyz` | planned |
| T-OPS-03 | `EXPLAIN (ANALYZE, BUFFERS)` of both board queries on seeded data shows index scans on `teams_board` / `participants_board`; output saved in `docs/explain/` | planned |
| T-OPS-04 | CI fails when a race test fails (verify once by breaking the predicate on a branch) | planned |
| T-OPS-05 | Schema: migrations re-run applies nothing; `teams_cap` rejects an over-capacity raw UPDATE; health, readiness, request id and 404 envelope | passing |

## 7. Chaos test (T-CHAOS-01)

`backend/scripts/chaos.py`:
1. Start uvicorn as a subprocess against Compose Postgres; seed 20 teams with 1 open seat and 200 users.
2. Start a client workload: users join random teams with per-action idempotency keys, retrying network errors and 503 with the same key.
3. Every 20 s, hard-kill the API process (`Popen.kill()`), wait 2 s, restart it. Three kills total.
4. Let clients finish their retries.
5. Assert: invariants I1 to I9 clean; every client action ended in 200 or 409; for every key that got 200, a matching membership exists; no team over capacity.
6. Print a summary: kills, in-flight requests at each kill, retries, final counts.

Status: planned (Tier 2).

## 8. Load scenarios (k6)

All on seeded data (10,000 users, 2,000 teams). Pre-minted tokens. Requests tagged by `route`. Results go to [load-report.md](load-report.md).

| ID | Scenario | Thresholds |
|---|---|---|
| L-A1 | Board, 100 VUs, no think time, 30 s ramp then 60 s steady; 70% first page, 30% follow a cursor | `http_req_duration{route:board_teams}` p95 < 200 ms (internal goal < 80 ms), errors < 0.1% |
| L-A2 | Same with 1 s think time | Same |
| L-B | Mixed: L-A1 board readers + every 5 s a 50-way stampede on a fresh one-seat team + 2 req/s create, join, leave churn + 50 open SSE streams | Board p95 < 200 ms; each stampede exactly one 200; no 5xx except `busy`; invariants clean afterwards |
| L-C | Soak: L-A2 for 10 minutes | Pool waiting, memory and p95 flat; invariants clean |
| L-LIVE | L-A1 for 30 s against the live URL | Reported, labeled as free tier |

Report per scenario: p50, p95, p99, max, req/s, error rate, pool wait p95, max connections used, deadlocks, lock timeouts, CPU and memory, plus a before/after table for each tuning step.

## 9. Manual checks

| ID | Check | Status |
|---|---|---|
| M-01 | Whole flow on a phone (360 px): signup, register, create team, copy code, join from second phone, request, accept, leave | planned |
| M-02 | Whole flow keyboard only: tab order, visible focus, skip link, no traps | planned |
| M-03 | Screen reader announces "Someone took the last seat" via the live region | planned |
| M-04 | Two browsers on the board: a join in one appears in the other within 1 s | planned |
| M-05 | Kill Wi-Fi for 30 s on the board, restore: the page refetches and is correct | planned |
| M-06 | Leave on a team page while another member watches: their view updates; leader badge moves | planned |
| M-07 | Live URL from a clean browser: reviewer accounts work, SSE not buffered | planned |

## 10. Bug classes found in review (must have regression tests)

| ID | Bug | Regression test |
|---|---|---|
| B-1 | Retry of a successful last-seat join returns 409 because the full pre-check runs before the idempotency lookup | T-RACE-11 |
| B-2 | After an event, a refetch hits the 1 s micro-cache and shows the old state | Cache clear on notify; T-API-35 extended to refetch the board after the event |
| B-3 | Listener connection drops and live updates silently stop | Listener reconnect test: terminate the listener backend with `pg_terminate_backend`, expect a `resync` event |
| B-4 | Cancelling a user's other pending requests inside the join transaction deadlocks with another leader's accept | Not implemented by design (ADR-014); T-RACE-06 covers the scenario |
| B-7 | A retry racing its own original sees no committed key, then a "team full" pre-check returns 409 | All business decisions after the claim (ADR-013); T-RACE-16 |
| B-8 | A join request is created while the team fills or is finalized (FK `KEY SHARE` does not conflict with seat updates) | `FOR SHARE` on the team row; T-API-43, T-RACE-17 |
| B-9 | People board and team skills do not update on registration, `looking` or profile changes | Participant and profile events (ADR-034); T-API-40, T-API-41 |
| B-10 | Request events leak who asked to join which team to the whole hackathon | Audience filter (ADR-035); T-API-42 |
| B-11 | An in-flight fetch restores a team that was just deleted | Tombstone version; T-API-45, T-WEB-04 |
| B-12 | Time zone term undefined for a caller without a team | One-person group (ADR-023); T-API-44 |

Real bugs found during the build go to [bug-diary.md](bug-diary.md).

## 11. CI pipeline (.github/workflows/ci.yml)

| Job | Steps | Fails when |
|---|---|---|
| `lint` | ruff, mypy, `tsc --noEmit`, eslint | Any error |
| `api-tests` | Postgres 16 service, migrate, pytest `backend/tests/api backend/tests/unit`, invariants | Any failure or violation |
| `race-tests` | Postgres 16 service, migrate, pytest `backend/tests/concurrency` with `RACE_ITERATIONS=20`, invariants, deadlock check | Any failure, violation or deadlock |
| `web-tests` | `npm ci`, vitest | Any failure |
| `compose-smoke` | `docker compose up -d`, wait for `/readyz`, one signup and create team | Non-200 |
| `k6-smoke` | Seed small data, `k6 run` L-A1 for 20 s with thresholds | Threshold breach |

README shows the CI badge.

## 12. Submission acceptance checklist

- [ ] All must-haves R1 to R19 show `passing` in requirements.md
- [ ] 20+ API tests (target 45 API + 19 race + 4 guarantee + 7 unit + 4 web) green in CI
- [ ] T-RACE-01 and T-RACE-02 both behave as expected in CI logs
- [ ] Invariants clean on seed, after tests, after L-B, after chaos
- [ ] Load report filled with measured numbers, commands and hardware
- [ ] Design doc is one page and matches the code
- [ ] `make race` and `make invariants` work from a clean clone
- [ ] Live URL works on a phone; SSE live; reviewer accounts listed
- [ ] Video recorded (5 minutes max)
- [ ] Commit tagged `submission-2026-11-15`; submitted by 6 PM IST
