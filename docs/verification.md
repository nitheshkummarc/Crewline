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
| I10 | At most one Race lab hackathon | Partial unique index `hackathons_one_lab` | `SELECT count(*) FROM hackathons WHERE is_lab HAVING count(*) > 1;` |

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
| T-API-29b | Explicit null for `display_name`, `skills`, `timezone` on `PATCH /api/users/me` (B-38) | 400 `validation_error` each; 500 on the old code | passing |
| T-API-50 | Valid session token for a user id with no row: register, create team, profile update (B-40) | 401 `unauthenticated` each; 500 on the old code | passing |
| T-API-51 | U+0000 in a team name, display name, request message (B-39) | 400 `validation_error` each; 500 on the old code | passing |
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
| T-API-46 | Form token minimum fill time | Fresh token from `GET /api/auth/form-token` used at once on signup and login: 400 `bot_check_failed`; same token after 2 s: 201; no token: 400 `validation_error`; token response is `no-store` | passing |
| T-API-47 | Honeypot and forged tokens | Filled `company`, a token signed with another secret, an expired token, or a session JWT as form token: 400 `bot_check_failed`; a form token as the session cookie: 401 | passing |
| T-API-48 | Security headers and web cache rules | CSP (scripts from self only, no `'unsafe-*'` for scripts), HSTS, nosniff, Referrer-Policy on API, SPA shell, assets and API 404; shell `no-cache`, hashed asset `immutable`, API responses without a cache rule; client routes fall back to index.html | passing |
| T-API-49 | HEAD on health checks and web routes (B-32) | `HEAD` on `/healthz`, `/readyz`, `/`, a client route and a hashed asset returns 200 with no body and the security headers; `HEAD` on an unknown `/api` path stays 404 | passing |
| T-LAB-01 | Race lab race, 40 people for the last seat | One 200, 39 `team_full`, none other; 4 seats, 4 memberships, 3 join events | passing |
| T-LAB-02 | Race lab spam, 12 clicks | Same key: all 200 with identical bodies, one committed, 1 membership, 1 join event, 1 stored key. New keys: one committed, the rest 200 already in, 1 membership | passing |
| T-LAB-03 | Race lab queue, 8 requests | All created; queue oldest first; first accept 200, second 409 `team_full`; 4 seats | passing |
| T-LAB-04 | Race lab walkthrough | Traced join runs claim, conditional UPDATE, membership, audit, store, commit in that order; the retry replays without an UPDATE; the full team rolls back with 409 | passing |
| T-LAB-05 | Race lab hidden hackathon and limits | Lab hackathon not in `GET /api/hackathons`; size over the cap 400; latency report lists routes and pools; anonymous 401 | passing |
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
| T-RACE-19 | Profile update vs the same user's code join (even rounds) or accept (odd rounds), 20 rounds, two HTTP connections per user (B-36) | Both 200; the team's last event equals `team_snapshot()` (E1); no version maps to two snapshots (E2); deadlock retry counter unchanged; invariants clean. Fails on the old code (last team event is stale) | passing |
| T-RACE-20 | Profile update vs the same user's leave, 20 rounds (B-37) | Both 200; no `member_profile_updated` for that user after their `member_left` in the team; E1, E2; no deadlock retry; invariants clean. Fails on the old code | passing |

## 3b. Guarantee tests (dedicated servers)

`backend/tests/concurrency/test_guarantees.py`. Each starts its own server with special settings; the fault tests use a separate database (`crewline_faults`) with a trigger that makes the audit insert fail for listed users. Mapping to guarantees: architecture.md section 17.

| ID | Guarantee | Scenario | Assertions | Status |
|---|---|---|---|---|
| T-GUAR-01 | Queue wait under overload | Server with write pool 2, acquire timeout 0.2 s, in-flight cap 4; 40 joins at once for the last seat, no retry; then the same with retries | First pass: some `503 busy` with `Retry-After: 1`, each in under 2 s, no 500, at most one 200. After retries: no 503 or 500, team has exactly 4 members | passing |
| T-GUAR-02 | Per-user request limits | Server with 5 mutations/min, 3 logins/min, 2 signups/hour | 6th mutation of one user is 429 `rate_limited` with `Retry-After`; another user still gets 200; 4th login 429; 3rd signup 429 | passing |
| T-GUAR-02b | Committed key after the limits (B-41) | Limited server: create a team with key K, then mutations until 429, then K again. Main server: join with key J, then wrong codes until 429, then J again | Both replays return the stored 201 and 200 byte for byte; 429 on the old code | passing |
| T-GUAR-03 | Atomicity of join | Audit insert fails for the joining user | 500; seat count, membership and idempotency key all unchanged; same key succeeds after the fault is removed; invariants clean | passing |
| T-GUAR-04 | Atomicity of accept | Audit insert fails for the requester | 500; request still pending, count unchanged; accept succeeds after the fault is removed; invariants clean | passing |
| T-GUAR-05 | Forwarded-for spoofing (B-33) | 4 failed logins on the limited server, each with a new fake `X-Forwarded-For` | `[401, 401, 401, 429]`: the per-IP login limit still applies | passing |
| T-GUAR-06 | Lost write connection (B-35) | A join waits on an externally held team row lock; its write backend is terminated | 503 `busy` with `Retry-After: 1`, not 500; the same key then returns 200 | passing |
| T-GUAR-07 | Read timeout (B-35) | An external transaction holds `LOCK TABLE teams IN ACCESS EXCLUSIVE MODE`; `GET /api/teams/{id}` | 503 `busy` with `Retry-After: 1` after the read `statement_timeout`, not 500 | passing |

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
| T-UNIT-08 | Every seeded account email passes the login model (B-22) | passing |
| T-UNIT-09 | Rate-limit client IP: without `CLIENT_IP_HEADER` the socket peer is used whatever `X-Forwarded-For` says; with it, the header value (trimmed) is used, and a missing or blank header falls back to the peer (B-33) | passing |

## 5. Web tests (Vitest)

| ID | Test | Status |
|---|---|---|
| T-WEB-01 | Optimistic accept (a join through a request) patches seats and the request list at once, rolls back on 409 `team_full`, and the live region says "Someone took the last seat." | passing |
| T-WEB-02 | `api/client` retries 503 and network errors with the same `Idempotency-Key` (Retry-After honored), stops at 409, gives up after 3 retries, sends no key on signup, login and GET | passing |
| T-WEB-03 | `mergeTeam` keeps the higher version; null removes; older snapshot does not overwrite newer event; full, finalized or not-looking teams leave the board; inserts stay inside the page range (B-26) | passing |
| T-WEB-04 | Tombstone: after a `team_deleted` event, a board fetch that still contains the team (lower version) does not restore it | passing |
| T-WEB-05 | Every route renders; every internal link targets a real route, every external link is a known real URL, `#` links have a target; exactly one primary action per page; no request URL with an empty segment (B-24); invite code shown as the API formats it (B-25) | passing |
| T-WEB-06 | Form limits match the API: password 8 to 128, names 1 to 60, email, skills taxonomy, IANA zones (offsets refused), invite code normalization, API `validation_error` mapped to its field | passing |
| T-WEB-07 | Event stream: one EventSource per hackathon, refetch on open, newer team events patch board and status and are announced, older ones ignored, deletions tombstoned, people and request events refresh their lists | passing |
| T-WEB-09 | Board filters: name search, skills a team needs or has, sort by open seats, URL round trip with defaults dropped, people search | passing |
| T-WEB-10 | Activity feed: team events become readable items, non-news events skipped, deleted teams named from cache, newest first, duplicates ignored, capped at 30 | passing |
| T-WEB-11 | Team colors are stable per id and spread over all 8 bands; initials from names | passing |
| T-WEB-12 | Theme switch has exactly two options, Light and Dark; with nothing saved the device theme is checked and not saved; Light when the browser cannot tell; a click applies and saves; a saved choice wins over the device; arrow keys wrap | passing |
| T-WEB-08 | Content rules in every frontend text file (source, configs, e2e, scripts, index.html, README; B-31): no em dash, no banned marketing words, no `rounded-full`, no purple, gradients only in the style files and never on buttons, no AI badge, no secrets, only public `VITE_` env values | passing |

## 5b. End-to-end tests (Playwright, real API and database, phone 360 px and laptop 1280 px)

Run against a server started with relaxed signup and login limits (as the pytest server does) and seeded data: `npm --prefix frontend run e2e`. Every page used in a flow fails the test on a Content-Security-Policy violation, an uncaught error, or horizontal overflow at its viewport (B-28, B-29).

| ID | Flow | Status |
|---|---|---|
| E2E-01 | Sign up in the UI (bot check, skills, agreement), register, create a team, see a well-formed invite code and its QR code | passing |
| E2E-02 | Signup field errors appear next to the fields with `aria-invalid` and `aria-describedby` | passing |
| E2E-03 | A join through a shared `?code=` link appears live on the leader's page without a reload | passing |
| E2E-04 | Ask to join with a message, the leader sees it live and accepts, the asker sees their team; the leader leaves and leadership moves to the asker | passing |
| E2E-05 | Two browsers press join on the last seat at the same moment: exactly one gets the team, the other sees `team_full` "Someone took the last seat." | passing |
| E2E-06 | The skip link is the first tab stop and moves focus to main | passing |
| E2E-07 | Unknown routes show the 404 page with a working link home; unknown `/api` paths keep the JSON 404 | passing |
| E2E-08 | Command palette: Ctrl+K opens it, typing a team name and Enter opens that team, Escape closes it | passing |
| E2E-10 | Race lab in the browser: Trace a join shows the seat UPDATE, commit and rollback steps; a 30-person race shows 30 attempts and four database checks as expected | passing |
| E2E-09 | Live feed, search and peek: a team created by another user appears in the feed live, search narrows the board to it, peek shows its leader | passing |

## 6. Ops checks

| ID | Check | Status |
|---|---|---|
| T-OPS-01 | `database/seed.py --users 10000 --teams 2000` finishes in under 60 s and invariants pass | passing (0.9 s, invariants clean) |
| T-OPS-02 | `docker compose up` from a clean clone serves `/readyz` | passing (CI job `compose-smoke` on a clean checkout, run 43066048160; image 185 MB) |
| T-OPS-03 | `EXPLAIN (ANALYZE, BUFFERS)` of both board queries on seeded data shows index scans on `teams_board` / `participants_board`; output saved in `docs/explain/` | passing |
| T-OPS-04 | CI fails when a race test fails (verify once by breaking the predicate on a branch) | passing (11 Nov 2026: a throwaway branch removed `member_count < max_size` from the join-by-code UPDATE; CI run [43065335527](https://github.com/nitheshkummarc/Crewline/actions/runs/43065335527) failed the race job on T-RACE-03, real join on the schema without `teams_cap`: `Counter({200: 50})`, all 50 racers took one seat. T-RACE-01 on the full schema still passed because the `teams_cap` CHECK turned every overflow into 409. Branch deleted, never merged) |
| T-OPS-05 | Schema: migrations re-run applies nothing; `teams_cap` rejects an over-capacity raw UPDATE; health, readiness, request id and 404 envelope | passing |

## 7. Chaos test (T-CHAOS-01)

`backend/scripts/chaos.py`:
1. Start uvicorn as a subprocess against Compose Postgres; seed 20 teams with 1 open seat and 200 users.
2. Start a client workload: users join random teams with per-action idempotency keys, retrying network errors and 503 with the same key.
3. Every 20 s, hard-kill the API process (`Popen.kill()`), wait 2 s, restart it. Three kills total.
4. Let clients finish their retries.
5. Assert: invariants I1 to I9 clean; every client action ended in 200 or 409; for every key that got 200, a matching membership exists; no team over capacity.
6. Print a summary: kills, in-flight requests at each kill, retries, final counts.

Status: passing. Run on 11 Nov 2026 (`python backend/scripts/chaos.py`, 200 users, 20 one-seat teams, 60 s, 3 kills at 15, 34 and 53 s): 23,012 actions (3,582 x 200, 19,430 x 409), 779 network retries and 749 busy retries with the same keys, 0 responses of 500, 0 replay mismatches, 0 teams over capacity, 0 keys without a response, invariants clean.

The replay check is stronger than the plan above: every action that finally got 200 is re-sent with its key after the run and must return byte-identical content, which proves no effect was lost or applied twice across the crashes.

### T-CHAOS-03 Half-open database links (B-34)

`backend/tests/concurrency/test_half_open.py`. A TCP proxy in the test process sits between a dedicated server (write and read pools of 2) and PostgreSQL. After a team and an open SSE stream exist, the proxy stops forwarding on every open link without closing it (no FIN, no RST); new links still work. Assertions: the next read answers 503 `busy` with `Retry-After: 1` within 8 s (command timeout 5 s); reads return to 200 within 30 s; the stream receives `resync` within 45 s (keepalive every 30 s, 5 s timeout). Status: passing.

## 8. Load scenarios (k6)

All on seeded data (10,000 users, 2,000 teams). Pre-minted tokens. Requests tagged by `route`. Results go to [load-report.md](load-report.md).

| ID | Scenario | Thresholds |
|---|---|---|
| L-A1 | Board, 100 VUs, no think time, 30 s ramp then 60 s steady; 70% first page, 30% follow a cursor | `http_req_duration{route:board_teams}` p95 < 200 ms (internal goal < 80 ms), errors < 0.1% |
| L-A2 | Same with 1 s think time | Same |
| L-B | Mixed: 100 board readers + 12 stampedes, one every 5 s, of 50 fresh users on a fresh one-seat team (k6 `setup()` creates each team with 3 of 4 seats taken) + 2 creates per second churn + 50 open SSE streams (`backend/scripts/sse_listeners.py`). Joins and creates retry `503 busy` with the same key after `Retry-After`, like the web client | Board p95 < 200 ms; every stampede exactly one 200 (`stampede_wins{stampede:i}` count == 1 for each i); after retries only 200/201 or 409; every SSE stream stays open and receives team events; invariants clean and deadlocks 0 afterwards |
| L-C | Soak: L-A2 for 10 minutes | Pool waiting, memory and p95 flat; invariants clean |
| L-LIVE | L-A1 for 30 s against the live URL | Reported, labeled as free tier |

Report per scenario: p50, p95, p99, max, req/s, error rate, pool wait p95, max connections used, deadlocks, lock timeouts, CPU and memory, plus a before/after table for each tuning step.

## 9. Manual checks

| ID | Check | Status |
|---|---|---|
| M-01 | Whole flow on a phone (360 px): signup, register, create team, copy code, join from second phone, request, accept, leave | automated in E2E-01, 03, 04 at 360 px; check on a real phone in module 9 |
| M-02 | Whole flow keyboard only: tab order, visible focus, skip link, no traps | planned |
| M-03 | Screen reader announces "Someone took the last seat" via the live region | planned |
| M-04 | Two browsers on the board: a join in one appears in the other within 1 s | automated in E2E-03 (team page); board check on the live URL in module 9 |
| M-05 | Kill Wi-Fi for 30 s on the board, restore: the page refetches and is correct | planned |
| M-06 | Leave on a team page while another member watches: their view updates; leader badge moves | automated in E2E-04 |
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

Runs on every push (any branch), every pull request and on demand. Every job that needs a database starts `postgres:16` (or `postgres:18` in the API and race matrix jobs) with `max_connections=300` through `.github/scripts/start-postgres.sh` (a service container cannot pass server flags, and the concurrency tests run several servers at once, like `dev_db.py` locally). Jobs that need a running API start it with `.github/scripts/start-api.sh` and upload its log on failure. The pytest, Playwright and k6 jobs post their result line (test counts; board p50, p95, p99, max and req/s) as an annotation on the run page. All steps run in bash with `pipefail`, so piping into `tee` cannot hide a failure.

| Job | Steps | Fails when |
|---|---|---|
| `lint` | ruff, mypy (inside `backend/`), `tsc -b`, eslint | Any error |
| `api-tests` | Matrix PostgreSQL 16 and 18 (18 is what Neon runs; first green on both in run 43069784023: 86 passed each), pytest `backend/tests/api backend/tests/unit` (migrations applied by the fixture), invariants on the test database | Any failure or violation |
| `race-tests` | Matrix PostgreSQL 16 and 18 (run 43069784023: 20 passed each), pytest `backend/tests/concurrency` with `RACE_ITERATIONS=20` (races, negative control, guarantees, deadlock counter check), invariants | Any failure, violation or deadlock |
| `web-tests` | `npm ci`, vitest, contrast check, production build | Any failure |
| `e2e` | PostgreSQL 16, migrate, seed 300 users and 40 teams, build web, start the API with the pytest server's relaxed rate limits (bot check on), E2E-01 to 10 on 360 px and 1280 px in the runner's preinstalled Chrome (no browser download), invariants | Any failure or violation |
| `compose-smoke` | `docker compose up -d --build --wait` (image built from the `Dockerfile`), then `.github/scripts/compose-smoke.sh`: `/readyz`, `database/seed.py` inside the API container, signup through the real bot check, register, create team (201), web app served at `/`; image size as an annotation | Any non-2xx or missing page |
| `k6-smoke` | PostgreSQL 16, migrate, seed 10,000 users and 2,000 teams with tokens, start the API with default pools and limits, `k6 run` L-A1 (100 VUs, 5 s ramp, 15 s steady) with its thresholds, invariants | Threshold breach or violation |

README shows the CI badge.

The load scenarios run in a separate workflow, `.github/workflows/load.yml` (on demand, and on pushes that change `loadtest/`, `backend/scripts/sse_listeners.py`, `.github/scripts/k6_notice.py` or the workflow): PostgreSQL 18 as on Neon, the API with production settings (1 worker, default pools and limits) except `RATE_CODE_PER_IP_MIN` raised because every k6 request comes from one IP; L-A1, L-A2, L-B with 50 SSE streams, invariants and the deadlock counter, then L-C. Each result is posted as a run annotation by `.github/scripts/k6_notice.py` and the summaries are uploaded as an artifact.

## 12. Submission acceptance checklist

- [ ] All must-haves R1 to R19 show `passing` in requirements.md
- [x] 20+ API tests (catalog IDs: 49 API + 5 lab + 19 race + 5 guarantee + 9 unit + 12 web + 10 end-to-end; collected: 74 API incl. lab + 15 unit + 21 concurrency, 70 Vitest, 20 Playwright runs) green in CI
- [x] T-RACE-01 and T-RACE-02 both behave as expected in CI logs (run 43063463873)
- [x] Invariants clean on seed, after tests, after L-B, after chaos (L-B and L-C: load run 43194526097)
- [x] Load report filled with measured numbers, commands and hardware
- [ ] Design doc is one page and matches the code
- [ ] `make race` and `make invariants` work from a clean clone
- [ ] Live URL works on a phone; SSE live; reviewer accounts listed
- [ ] Video recorded (5 minutes max)
- [ ] Commit tagged `submission-2026-11-15`; submitted by 6 PM IST
