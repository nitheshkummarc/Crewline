# Crewline: design

One-page design doc for the Hack4Hack PS1 submission (race-proof team formation). Draft: numbers marked `TBD` are filled from measured results before submission.

**Stack.** FastAPI (Python 3.11+, asyncpg, raw SQL) · PostgreSQL 16 · React + TypeScript · SSE · k6. One API service and one database. No Redis or queues: a team has at most 10 seats, so the database alone can serialize contention cheaply, and one store means one commit covers seat, member, audit and idempotency.

**Data model.** `teams` (denormalized `member_count`, `max_size`, `min_size`, `status`, `version`, `invite_code`) · `memberships` (PK team+user, **UNIQUE (hackathon_id, user_id)**, composite FK to `teams (id, hackathon_id)`) · `participants` (per-hackathon `looking`) · `join_requests` (one pending per user per team, partial unique index) · `idempotency_keys` · `audit_events` (append-only, no FKs). Database constraints back every rule: `CHECK (member_count BETWEEN 1 AND max_size)`, `CHECK (status = 'forming' OR member_count >= min_size)`.

**Race prevention.** A seat is taken with one conditional statement in the same transaction as the membership insert:
`UPDATE teams SET member_count = member_count + 1 WHERE id = $1 AND member_count < max_size AND status = 'forming' ...`.
Under READ COMMITTED, the 49 losers wait on the row lock, then re-check the predicate against the committed row, match 0 rows and get 409. The unique index stops one person joining two teams. Every write path takes locks in one order (idempotency, team row, requests, memberships, audit), which removes the FK-induced deadlock between a join and the last member leaving. Proof: the 50-way race test runs 20 times in CI through a real server with 60 connections, and a naive check-then-insert version **fails the same test**, so the test is known to detect races. An invariant checker (9 SQL queries) returns zero rows after every test, load run and chaos run.

**Idempotency.** Every mutation needs an `Idempotency-Key`. It is claimed as the first statement of the transaction; a concurrent duplicate waits on the unique index, then replays. The success response is stored in the same commit; rejections are not stored, because they changed nothing. No state-dependent check runs before the claim: an early "team full" check would let a retry racing its own original return 409 to the user who got the seat. A second layer: joining your own team returns 200 and the unique index blocks double membership regardless of keys.

**Realtime.** The audit insert trigger calls `pg_notify`, which is delivered only on commit. One listener per worker clears the board cache and fans out over SSE. Team events carry the snapshot and `version` (deletions carry a tombstone version); participant and profile changes are events too, so the People board and team skills stay live; join-request events go only to that team's members and the requester. Clients keep the newer version and refetch on every reconnect. We chose this over `Last-Event-ID` replay because sequence numbers are not commit-ordered.

**Latency.** Board: keyset pagination on a partial index, a 1 s single-flight cache of serialized bytes (cleared on every change), ETag. Separate read and write pools so a stampede cannot starve reads; 1 s lock and acquire timeouts return 503 + `Retry-After` instead of hanging. Results (10k users, 2k teams, 100 concurrent users): board p95 **TBD ms** local, **TBD ms** live; mixed load with stampedes p95 **TBD ms**; 0 deadlocks; max **TBD** connections.

**Security.** argon2id; JWT in an httpOnly SameSite cookie; leader checks inside the SQL predicate; 50-bit invite codes (about 53 years to a hit at 20k guesses/min) with per-user and per-IP limits; identical 404 for unknown and expired codes; no codes or emails in events.

**Suggestions.** `0.6 × skill complement + 0.3 × time-zone overlap + 0.1 × completeness − 0.1 × redundancy`, with reasons per result. Complement rewards covering the team's missing roles; similarity matching was rejected because it rewards sameness. Time zones are IANA names, so overlap respects daylight saving; a caller without a team is treated as a one-person team.

**Trade-offs.** Denormalized count (fast guard, must stay in sync, checked by I1) · rejections decided inside the transaction (correct replay, slightly more write load in stampedes) · rejections not stored (unlike Stripe) · rate limits per worker in memory · stale join requests resolved lazily to avoid a deadlock · max size fixed at event start and min size enforced at finalization (confirmed) · no organizer UI · logout does not revoke tokens early.

**Bugs found while building.** TBD from [bug-diary.md](bug-diary.md).

**With one more week.** Join as a single SQL function (1 round trip instead of 7) · shared rate limits in Postgres for multi-instance · audit replay checker that rebuilds state from events · organizer view (lock all teams, CSV export) · lock strategy benchmark (conditional UPDATE vs FOR UPDATE vs SKIP LOCKED) · capacity curve to 400 users · Playwright end-to-end tests.
