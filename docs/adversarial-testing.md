# Adversarial testing: what held, what broke, how it was found

After modules 1 to 9 passed their own tests, a separate attack campaign tried to break Crewline. It ran from its own repository (kept outside this one) against a frozen copy of commit `de0059f`, so the product could not be adjusted to pass it. Every finding below has a reproduction that failed on that commit, a root cause proven with logs or SQL, and a regression test in this repo that fails on the old code.

## How the bugs were found

| Technique | What it does | Found |
|---|---|---|
| Pairwise overlap (area A) | Two write paths on the same team or user, 30 repetitions each through the real server with a barrier | BRK-01, BRK-02 |
| Schedule exploration (area A) | Runs the real services in process, pauses each transaction before every statement, and replays every interleaving with at most 2 preemptions (1,215 schedules). Any failure is replayable from its schedule string | BRK-01, BRK-02 (exact schedules) |
| Randomized mixes (area B) | 16 random operations at once per step over 12 kinds, all checks after every step | BRK-01 again, on its own (seed 3, step 65) |
| Idempotency probes (area C) | Replays, duplicate keys, changed bodies, retries after limits, large purge backlogs | BRK-03, BRK-04, BRK-05 |
| Fault injection (area D) | `pg_terminate_backend` on a waiting write, `LOCK TABLE` against reads, PostgreSQL restart under 40-client churn | BRK-06, BRK-07 |
| Network faults (area E) | A TCP proxy between the API and PostgreSQL adds latency, resets links, or makes them half-open | BRK-10, BRK-06 under resets |
| Security probes (area F) | Forged and orphaned tokens, IDOR, CSRF, NUL bytes, huge bodies, timing of invite errors | BRK-08, BRK-09 |
| Schema fuzzing (area G) | 9,600 requests generated from the API schema | BRK-03 again |
| Mutation testing (area K) | Breaks one guard at a time in a copy and checks that the product's own suite notices | 5 surviving mutants (gaps in this repo's tests) |

Checks applied after every run: the invariant checker (I1 to I10), event checks (the last team event equals the database snapshot; one version never maps to two snapshots; audit rows name the right user), allowed status codes only, `pg_stat_database.deadlocks` unchanged, and no traceback in the server log.

## What held under attack

- **Last-seat race:** exactly one winner in every pair and mix; no team ever over capacity.
- **19 write-path pairs** (join vs leave, delete, finalize, reopen, regenerate; accept vs withdraw, decline, code joiners; two leaders accepting the same user; and more), 30 repetitions each: all held, 0 deadlocks.
- **Idempotency:** replays byte-identical on 15 endpoints, also with 15 ms of injected latency per database message.
- **Crash and restart:** 3 hard kills of the API (9,643 actions, 0 replay mismatches); a PostgreSQL restart under load left every committed 200 replaying byte-identical and the invariants clean.
- **Realtime:** 400 streams, a reader that never reads, a 400-stream reconnect storm, a killed LISTEN backend: every stream got its events or a resync.
- **Security:** forged, expired and `alg: none` tokens rejected; no invite code or email leaks; unknown and expired invites indistinguishable by body and timing.
- **Load:** about 1,000 board requests/s with p95 141 ms at 100 virtual users, 0 failures.

## What broke

Data never became invalid: no finding broke an invariant. The breaks were in availability, in the live view and in the error contract.

| ID | Severity | What broke | Bug diary | Regression test | Status |
|---|---|---|---|---|---|
| BRK-10 | high (conditional) | A silently dead database link hung requests, then exhausted the pool for good; live updates stopped without a resync | B-34 | T-CHAOS-03 | fixed |
| BRK-06 | medium | A lost connection mid-request (backend killed, PostgreSQL restart, socket reset) returned 500, not 503 | B-35 | T-GUAR-06 | fixed |
| BRK-07 | low | A read blocked past the read `statement_timeout` returned 500 | B-35 | T-GUAR-07 | fixed |
| BRK-01 | medium | A profile change overlapping the same user's join or accept left the team's last live event with the old skills | B-36 | T-RACE-19 | fixed |
| BRK-02 | low | A profile change overlapping the same user's leave audited and bumped the team they had just left | B-37 | T-RACE-20 | fixed |
| BRK-03 | low | An explicit `null` in a profile update returned 500 | B-38 | T-API-29b | fixed |
| BRK-08 | low | A valid session for a deleted user returned 500 on writes | B-40 | T-API-50 | fixed |
| BRK-09 | low | A NUL character in any text field returned 500 | B-39 | T-API-51 | fixed |
| BRK-04 | low | A retry of a committed request could get 429 instead of its stored response | B-41 | T-GUAR-02b | fixed |
| BRK-05 | low | The hourly idempotency purge stopped working past a large backlog | - | purge test | open |

### BRK-10: half-open database links (B-34)

- **How found:** a proxy stopped forwarding on its open connections without closing them. Reads, writes and `/readyz` got no answer within 25 s; 35 s later every request got 503 because every pool connection was stuck; the open stream never got a resync.
- **Cause:** no client-side timeout on either pool, and `statement_timeout` cannot fire when the server never receives the statement. The listener keepalive had no timeout and swallowed errors.
- **Fix:** `command_timeout=5` on both pools; the keepalive gives up after 5 s and terminates the link, so the existing reconnect and resync path runs.

### BRK-06 and BRK-07: transient database errors were 500 (B-35)

- **How found:** terminating a write backend while it waited on a lock gave 500 (a retry with the same key then succeeded). A PostgreSQL restart under load gave 139 x 500. Reads blocked by `LOCK TABLE teams` gave 500.
- **Cause:** only lock, statement and pool timeouts counted as busy. A connection lost inside a transaction block surfaces as asyncpg `InterfaceError`, with the real error hidden in `__context__`. Reads do not pass through `run_write`, where timeouts become 503.
- **Fix:** killed backends, restarts, lost sockets and `InternalClientError` count as busy; the check walks the exception chain; the generic error handler answers 503 for the same chain. The client already retries 503 with the same key, so the user sees the result instead of an error.

### BRK-01 and BRK-02: profile change racing the same user's join, accept or leave (B-36, B-37)

- **How found:** pairwise overlap through the real server (27 of 30 and 16 of 30 repetitions), then the schedule explorer pinned exact interleavings, for example `A A A A A A A A B B B B B B B B B A` (A: profile update, B: join; A stops just before COMMIT, B runs and commits, A commits). A randomized mix found BRK-01 again without being pointed at it.
- **Cause (BRK-01):** the profile and the join shared no lock. Each read the other's data before it committed, so the join's live event carried the old skills at the same version the database now shows with the new skills. Clients only apply a higher version, so every live board stayed stale.
- **Cause (BRK-02):** PostgreSQL re-checks a waiting row lock only against the locked table's row, not the joined membership row, so a membership deleted by a leave still matched.
- **Fix:** the profile update locks the user's participant rows first; a membership insert needs a `KEY SHARE` on that row, which `FOR UPDATE` blocks, so the two serialize. The version bump runs in a new statement that re-checks membership. The documented lock order changed for this one path (ADR-007), with the argument for why it cannot deadlock; 1,215 explored schedules and the race tests show 0 deadlocks.

### BRK-03, BRK-08, BRK-09: inputs that reached the database and answered 500 (B-38 to B-40)

- **How found:** probing request hashing (explicit nulls), schema fuzzing over every operation, and security probes (a forged-but-valid token for a deleted user, NUL bytes in text).
- **Cause:** the API let through values the database refuses: a null for a NOT NULL column, U+0000 in `text`, and a user id with no row (sessions are checked without a database hit). The resulting database errors were not mapped, so they became 500.
- **Fix:** refuse them at the boundary: explicit nulls are 400, every request body rejects U+0000 through one shared base model, and a session whose user is gone gets 401. A 22021 handler stays as a backstop for text outside bodies.

### BRK-04: a retry of a committed request was rate limited (B-41)

- **How found:** idempotency probes: commit a join or a create with key K, exhaust a limit with other requests, then retry K.
- **Cause:** the limits ran before the replay fast path, so a request that had already succeeded was refused on retry.
- **Fix:** limits run after the replay and before the claim, so a committed key always returns its stored response and new work is still limited.
