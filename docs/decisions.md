# Architecture decision records

Each record: the decision, why, what was rejected, and the consequences. Status is `accepted` unless stated.
When a decision changes, edit its record, set the date, and note what changed. Do not delete records.

Index:
[001 PS1](#adr-001) · [002 FastAPI](#adr-002) · [003 PostgreSQL](#adr-003) · [004 asyncpg, no ORM](#adr-004) · [005 Conditional UPDATE](#adr-005) · [006 READ COMMITTED](#adr-006) · [007 Lock order](#adr-007) · [008 Denormalized count](#adr-008) · [009 Composite FKs](#adr-009) · [010 Team lifecycle](#adr-010) · [011 Leader handover](#adr-011) · [012 Delete on last leave](#adr-012) · [013 Idempotency](#adr-013) · [014 Lazy stale requests](#adr-014) · [015 Invite codes](#adr-015) · [016 Auth](#adr-016) · [017 SSE](#adr-017) · [018 Events as hints](#adr-018) · [019 Audit log](#adr-019) · [020 Pools](#adr-020) · [021 Board](#adr-021) · [022 No Redis](#adr-022) · [023 Suggestions](#adr-023) · [024 Participants](#adr-024) · [025 Error contract](#adr-025) · [026 Deployment](#adr-026) · [027 Testing](#adr-027) · [028 Chaos](#adr-028) · [029 No organizer UI](#adr-029) · [030 Rejected ideas](#adr-030) · [031 Frontend](#adr-031) · [032 Rate limits in memory](#adr-032) · [033 IANA time zones](#adr-033) · [034 Participant and profile events](#adr-034) · [035 Request event audience](#adr-035) · [036 Design skills](#adr-036) · [037 Bot checks](#adr-037) · [038 Visual system](#adr-038) · [039 Security headers](#adr-039) · [040 Race lab](#adr-040)

---

## ADR-001 Choose PS1 and let the judging order set priorities {#adr-001}

**Decision.** Build PS1 (race-proof team formation). Spend effort in the judges' order: concurrency correctness, then defensible design, then code quality, tests and UX.
**Why.** PS1's hard part is a small, provable core (one seat, many contenders) that can be demonstrated with tests and measured numbers within 5 days.
**Consequences.** Never cut: race test, idempotency, CI, load report. Cut first: UI polish, optimistic UI, tracing.

## ADR-002 Python FastAPI for the API {#adr-002}

**Decision.** FastAPI on Python 3.11+ with uvicorn (3.11 is the installed version on the dev machine; CI and the Docker image use 3.11).
**Why.** It is the stack I write fastest and can explain line by line in the interview. Async I/O fits a database-bound service; pydantic v2 gives strict validation.
**Rejected.** Node/Express (Hack4Hack's preferred stack): allowed alternatives are accepted if defended; speed and explainability matter more within 5 days.
**Consequences.** Python CPU per request is higher than Node; mitigated with orjson, cached bytes for the board, no ORM, argon2 in a threadpool. Must be defended in the design doc.

## ADR-003 PostgreSQL as the single source of truth {#adr-003}

**Decision.** PostgreSQL 16 for all state: teams, memberships, requests, idempotency keys, audit.
**Why.** The rules can be enforced by the database itself: CHECK constraints (capacity, min size when finalized), unique indexes (one team per hackathon, one pending request), composite foreign keys (same hackathon), and row locks with predicate re-check. One ACID store means the seat, the membership, the audit row and the idempotency response commit or roll back together.
**Rejected.** MongoDB (preferred by the organizers): transactions work, but there is no cross-document CHECK, no composite FK, and the rules would live in app code. Postgres makes the guarantees visible in the schema.
**Consequences.** Need a managed Postgres free tier (Neon) and real Postgres in CI.

## ADR-004 asyncpg with raw SQL, no ORM {#adr-004}

**Decision.** asyncpg pools and hand-written SQL in `repo.py` files. Plain SQL migration files.
**Why.** Every concurrency guarantee depends on the exact SQL (predicates, lock clauses, statement order). An ORM hides it and adds lazy loads inside transactions. asyncpg is the fastest Python Postgres driver.
**Rejected.** SQLAlchemy ORM (hidden queries, slower), SQLAlchemy Core (fine but extra layer), Alembic (not needed for one schema).
**Consequences.** Row-to-model mapping is manual (small dataclasses / pydantic models).

## ADR-005 Conditional UPDATE as the seat guard {#adr-005}

**Decision.** Take a seat with `UPDATE teams SET member_count = member_count + 1 ... WHERE ... AND member_count < max_size RETURNING ...` in the same transaction as the membership insert.
**Why.** It is one statement, exact, and needs nothing beyond the database. Contention per team is tiny (at most 10 seats, transactions under 10 ms), so serializing on one row is cheap: a 50-way stampede resolves in roughly 50 to 150 ms.

| Alternative | Why rejected |
|---|---|
| Check then insert in Python | Broken: all contenders read the old count. Kept only as the negative control |
| In-process lock (`asyncio.Lock`) | Breaks with 2 workers or 2 instances |
| Redis lock (Redlock) | Second system; lock expiry plus process pauses can admit two holders |
| Redis counter (`DECR`/Lua) | Fast, but Redis and Postgres can disagree (dual write) |
| `SELECT ... FOR UPDATE` then UPDATE | Correct, one more round trip holding the lock; used only where we may delete (leave) |
| SERIALIZABLE + retry | Correct, but more aborts and retries under contention |
| Seat rows + `SKIP LOCKED` | Built for thousands of units; for 4 seats it adds rows and can report "full" while the winner might still roll back |
| Hold with TTL then confirm | Needed when there is a payment step; joining is instant |
| Waiting room / queue | Built for millions of users; 10,000 do not need it |

**Consequences.** Every write path must lock the team row first (ADR-007). `teams_cap` CHECK is the backstop if a predicate is ever wrong.

## ADR-006 READ COMMITTED isolation {#adr-006}

**Decision.** Default READ COMMITTED for all transactions.
**Why.** A blocked UPDATE re-checks its WHERE clause against the newly committed row, which is exactly the behavior the seat guard needs. No retry storms.
**Rule that follows.** Guarding predicates compare columns of the same row only. A subquery like `(SELECT count(*) ...) < max` is not re-evaluated against the new row and would allow over-filling.
**Rejected.** SERIALIZABLE (more aborts, retries everywhere, harder to explain).

## ADR-007 One lock order for every write path {#adr-007}

**Decision.** Idempotency row, then team row(s) (ascending id when several), then participant row, then join request rows, then membership rows, then audit insert.
**Why.** Inserting a membership takes a `KEY SHARE` lock on the team row through the FK. A joiner that inserted a membership first and then updated the team could deadlock with a leaver that locked the team and then deleted it. Taking the team row first in every path removes the cycle.
**Documented exception.** Withdraw touches only the request row and holds nothing else, so it cannot complete a cycle (architecture.md 6.6, 6.12).
**Changed 10 Nov 2026.** Create request now locks the team row `FOR SHARE` first instead of relying on the FK `KEY SHARE` (which does not conflict with seat updates), and locks the participant row for the exact pending cap. Profile update locks the user's team rows in id order.
**Consequences.** Code review checks statement order. CI asserts `pg_stat_database.deadlocks` does not increase.

## ADR-008 Denormalized member_count and a version column {#adr-008}

**Decision.** `teams.member_count` stored and updated in the same transaction as membership changes; `teams.version` incremented on every team change.
**Why.** The capacity guard needs a column on the same row (ADR-006). The board reads counts without joining memberships. `version` lets clients order events and snapshots per team.
**Consequences.** Every membership change must update the count in the same transaction. Invariant I1 checks count equals rows after every test and load run.

## ADR-009 Composite foreign keys for hackathon consistency {#adr-009}

**Decision.** `teams UNIQUE (id, hackathon_id)`; `memberships (team_id, hackathon_id) → teams (id, hackathon_id)`; same for `join_requests`; `memberships (hackathon_id, user_id) → participants`.
**Why.** Without it, a membership could carry the wrong `hackathon_id` and slip past the one-team-per-hackathon unique index. With it, the database rejects the mismatch.
**Source.** Review finding, accepted on 10 Nov 2026.

## ADR-010 Team lifecycle: forming and finalized {#adr-010}

**Decision.** `teams.status` is `forming` or `finalized`. The leader finalizes only when `member_count >= min_size`. Finalized teams accept no joins. Any leave or removal sets status back to `forming`. CHECK `status = 'forming' OR member_count >= min_size`.
**Why.** The spec requires min and max size. Max is enforced on every join. Min cannot block joining (every team starts with 1 member), so it is enforced at finalization, and the database guarantees a finalized team meets it.
**Rejected.** Three states (FORMING, READY, LOCKED): READY is derived from the count; storing it adds an invariant with no benefit. Organizer-wide lock: no organizer role in scope (ADR-029).
**Assumption stated in the design doc.** The spec does not define when min size applies; finalization is our interpretation.
**Confirmed 10 Nov 2026.** Max team size is fixed when the event starts (each team copies it at creation; it never changes). Min size applies only at finalization. This is exactly the design above; the UI shows "needs N more to finalize" on forming teams.

## ADR-011 Leader handover to the earliest member {#adr-011}

**Decision.** When the leader leaves, the remaining member with the smallest `(joined_at, user_id)` becomes leader, in the same transaction, audited as `leader_promoted` with actor `system`.
**Why.** Deterministic, testable, explainable. `joined_at` uses `clock_timestamp()` so members of one team have distinct times; `user_id` breaks any tie.
**Rejected.** Random choice (not testable), leader-chosen successor (extra UI, can be added later as "transfer leadership").

## ADR-012 Last member leaving deletes the team {#adr-012}

**Decision.** If the leaving member is the last one, delete the team row in the same transaction; join requests cascade; audit events remain (no FK from audit).
**Why.** Spec rule. `teams_cap` requires `member_count >= 1`, so an empty team cannot exist even briefly.
**Rejected.** Soft delete: adds a status every query must filter, and the audit log already preserves history.

## ADR-013 Idempotency design {#adr-013}

**Decision.** `Idempotency-Key` required on every mutation. Claimed with `INSERT ... ON CONFLICT DO NOTHING` as the first statement of the write transaction. Success responses of committed changes are stored in the same transaction. Rejections (4xx), 503s and "nothing changed" 200s (already a member, existing pending request) are not stored. Keys kept 24 h. Request hash (method, route, params, canonical body) must match on reuse, else 422.
**Why.** Claiming inside the transaction means a concurrent duplicate waits on the unique index and then replays; a crashed attempt leaves nothing behind. Not storing rejections is safe because a rejection changed nothing, and it avoids replaying an outdated "team full".
**No business pre-checks (changed 10 Nov 2026).** Before the claim, only state-free checks (input format, rate-limit check) and the replay fast path (which can only return a really committed response) are allowed. Every state-dependent outcome (full, finalized, unknown code, already in a team) is decided after the claim. The earlier design ran "team full" and "unknown code" pre-checks before the claim; a retry racing its own original could then return 409 to the user who got the seat (bugs B-1, B-7). After the claim, the retry waits on the original's key row and replays.
**Cost.** Requests that end in rejection open a short write transaction. Measured in L-B.
**Differs from Stripe**, which also stores failures. Stated as a trade-off.
**Consequences.** Layer 2: natural idempotency (unique membership, joining your own team returns 200) protects even a client that sends no or new keys.

## ADR-014 Stale join requests are handled lazily {#adr-014}

**Decision.** When a user joins a team, their other pending requests are left untouched. If a leader later accepts one, the membership insert fails (23505), the accept rolls back, and a follow-up transaction marks the request `stale`. Leader request lists hide requests from users who already have a team.
**Why.** Cancelling all of a user's pending requests inside the join transaction locks other teams' request rows while holding a fresh membership, which can deadlock with another leader's accept of one of those requests. Lazy handling has no extra locks and no cycle.
**Rejected.** Eager cancellation in the join transaction (deadlock risk), request expiry timers (not required by the spec).

## ADR-015 Invite codes {#adr-015}

**Decision.** 10 characters of Crockford base32 (about 50 bits) from `secrets.choice`, stored in plaintext with a UNIQUE constraint, expiring after the hackathon's `invite_ttl` (default 48 h), enforced in SQL with the database clock. Leader can regenerate. Unknown and expired codes return the same 404. Input normalization maps `O`→`0` and `I`/`L`→`1` and strips dashes.
**Why plaintext, not hashed.** Members must be able to view the code again; a code hash would require showing it only once. Anyone with database read access already has everything else.
**Why 50 bits.** With 2,000 live codes and 20,000 guesses per minute, expected time to a hit is about 53 years, versus a 48 h code life.

## ADR-016 Authentication with JWT in an httpOnly cookie {#adr-016}

**Decision.** argon2id password hashes. JWT HS256 (2 h) in an httpOnly, Secure, SameSite=Lax cookie. Verified locally on each request.
**Why.** `EventSource` cannot send an Authorization header but does send same-origin cookies. Local verification keeps auth off the database hot path. SameSite plus the mandatory custom `Idempotency-Key` header covers CSRF.
**Rejected.** Token in localStorage (XSS exposure, no SSE auth), server-side sessions (a database read per request).
**Known gap.** Logout does not revoke a token before expiry.

## ADR-017 SSE for realtime {#adr-017}

**Decision.** Server-sent events over WebSockets.
**Why.** Traffic is one-way (server to browser). SSE runs over plain HTTP, reconnects automatically, works with the cookie, and needs no protocol code.
**Rejected.** WebSockets (bidirectional not needed, more code), polling (load and latency).

## ADR-018 Events are hints; the database is the truth {#adr-018}

**Decision.** The audit insert trigger sends `pg_notify`. Each event carries the team snapshot with its `version`. Clients merge by version and refetch on every (re)connect. No `Last-Event-ID` replay.
**Why.** `pg_notify` is delivered only on commit and discarded on rollback, so no client sees an uncommitted change. Replay by `seq` is unreliable because identity values are allocated before commit, so a later-committing lower `seq` can be skipped. Refetch-on-reconnect plus per-team versions cannot miss state.
**Rejected.** A per-hackathon counter row incremented in every write (would serialize all writes in a hackathon on one hot row), BIGSERIAL replay (gap problem above).
**Consequences.** On listener reconnect the server sends `resync`; every notify clears the board micro-cache before fan-out. Deleted teams are sent as tombstones (`team: null` with the deletion `version`), and clients ignore older snapshots of a tombstoned team, so an in-flight fetch cannot restore it (bug B-11). SSE frames carry no `id:` field.

## ADR-019 Append-only audit log in the same transaction {#adr-019}

**Decision.** `audit_events` with no foreign keys, append-only trigger, one row per action, written by `audit.repo.record` in the same transaction as the change. Payload includes the affected `user_id`, before/after counts, leader changes, and the team snapshot. Participant registration, `looking` changes and profile changes are audited too (ADR-034), so every published event has an audit row.
**Why.** "Who changed what and when" for every change, impossible to have a change without its audit row (same commit), history survives team deletion. The insert trigger doubles as the event publisher, so nothing can be published without being audited.
**Deferred.** Rebuilding state from the log (replay checker).

## ADR-020 Two pools, timeouts in server settings, direct connections {#adr-020}

**Decision.** Per worker: write pool (10), read pool (10), one listener connection. Timeouts set through asyncpg `server_settings`. Acquire timeout 1 s; write in-flight cap 30.
**Why.** A join stampede cannot starve board reads (bulkhead). Server settings avoid a `SET LOCAL` round trip per transaction. Fast 503 is better than a hung request.
**Rejected.** PgBouncer transaction mode (breaks LISTEN and prepared statements; not needed at this budget).
**Consequences.** Pool sizes are starting values; tune from the load test and record before/after numbers.
**Changed 10 Nov 2026 (bug B-20).** Pools open all their connections at startup (`min_size = max_size`) and never close idle ones (`max_inactive_connection_lifetime = 0`). A new PostgreSQL backend pays catalog loading and statement planning on first use (measured 60 to 130 ms vs 4 ms warm), and asyncpg's default 300 s idle reaping would recreate cold connections after every quiet period. Cost: the connections are held permanently, which on Neon keeps the compute awake (the LISTEN connection already does); counted in the connection budget.

## ADR-021 Board: keyset pagination, partial index, 1 s byte cache {#adr-021}

**Decision.** Keyset pagination on `(created_at, id)` with a partial index matching the board filter. A 1 s per-key micro-cache holding serialized bytes, single-flight on miss, cleared on every notification for that hackathon. ETag and 304.
**Why.** Index-only work per page, constant cost at any depth, and a stampede of 100 readers runs one query per second per page. Bytes avoid re-serializing JSON in Python.
**Rejected.** OFFSET pagination (cost grows with depth), Redis cache (second system), no cache (works, but Python CPU on a small host is the risk).

## ADR-022 No Redis, queues or microservices {#adr-022}

**Decision.** One API service and one database.
**Why.** Nothing in the measured load needs them, and every extra system adds a consistency problem to defend. Simpler architecture with proof beats a bigger one without.
**Revisit when.** Multiple API instances need shared rate limits (move limits to Postgres or Redis) or event fan-out exceeds one listener per instance.

## ADR-023 Deterministic, explainable suggestions {#adr-023}

**Decision.** Weighted score: 0.6 complement + 0.3 timezone overlap + 0.1 completeness − 0.1 redundancy, with reasons returned (formula in architecture.md section 11).
**Why.** The spec asks for complementary skills and time zone with the scoring explained. A formula is testable and explainable.
**Caller without a team.** The caller alone is the group: their skills are `T` and the time zone term compares candidates against the caller (review finding P1).
**Rejected.** Cosine similarity (rewards sameness, the opposite of complementary), ML embeddings (not needed, not explainable in 5 days).

## ADR-024 Per-hackathon participants table {#adr-024}

**Decision.** `participants (hackathon_id, user_id, looking)`. Skills and time zone stay on `users`.
**Why.** A global `looking` flag cannot describe someone looking in hackathon A but teamed in B. Skills are a property of the person, not the event.
**Source.** Review finding, accepted with reduced scope on 10 Nov 2026.

## ADR-025 Error contract {#adr-025}

**Decision.** 409 for business conflicts (never retried), 404 for unknown or expired invites (same body), 403 for not leader, 422 for idempotency key mismatch, 429 with `Retry-After` for rate limits, 503 with `Retry-After` for lock timeout, pool exhaustion, in-flight cap and exhausted deadlock retries (retried by the client with the same key). Full table in api.md.
**Why.** The client needs one rule: retry only 503 and network errors, always with the same key.
**Validation is 400.** FastAPI returns 422 for request validation by default; a custom `RequestValidationError` handler returns 400 `validation_error`, because 422 means idempotency key mismatch in this contract.

## ADR-026 Deployment: Render + Neon in Singapore, same origin {#adr-026}

**Decision.** API and built SPA in one Render free web service; Neon free Postgres; both in Singapore. External keep-warm ping.
**Why.** Same region keeps database round trips around 1 to 2 ms; same origin avoids CORS and cookie issues for SSE; Singapore is closest to India for both providers.
**Risks.** Render free sleeps and has little CPU; Neon scales to zero. Both are tested Friday and reported honestly in the load report.

## ADR-027 Tests against real PostgreSQL through a real server {#adr-027}

**Decision.** pytest with a real Postgres (`dev_db.py` or Compose locally; in CI `postgres:16` started with `docker run ... -c max_connections=300`, because a service container cannot pass server flags and the concurrency tests run several servers at once; changed 11 Nov 2026). Race tests send real HTTP to a uvicorn subprocess with a 60-connection write pool, release with a barrier, repeat 20 times. A naive check-then-insert implementation must fail the same test.
**Why.** A race test that cannot fail proves nothing. In-process transports and small pools can serialize requests and hide races.

## ADR-028 Chaos test by hard-killing the API process {#adr-028}

**Decision.** `backend/scripts/chaos.py` starts uvicorn as a subprocess, runs a join workload, kills it with `Popen.kill()` (SIGKILL on Linux, TerminateProcess on Windows) three times, restarts it, lets clients retry with the same keys, then runs the invariant checker.
**Why.** Portable and deterministic; container restart policies and PID 1 signal handling make in-container kills unreliable.

## ADR-029 No organizer UI; hackathons come from seed or CLI {#adr-029}

**Decision.** Hackathons are created by `database/seed.py`. No organizer role or dashboard.
**Why.** Not required by PS1. Time goes to the team-formation core.
**Stated as a gap** in the design doc.

## ADR-030 Ideas considered and rejected or deferred {#adr-030}

| Idea | Status | Reason |
|---|---|---|
| Leader-is-member circular deferrable FK | Rejected | Correct but hard to explain; invariant I3 plus transactions cover it |
| `Last-Event-ID` replay | Rejected | Sequence gap problem (ADR-018) |
| Per-hackathon event counter row | Rejected | Serializes all writes per hackathon |
| Join request expiry | Rejected | Not in the spec |
| Business pre-checks before the idempotency claim | Rejected | Breaks replay for a retry racing its original (ADR-013) |
| Best-effort pending request cap | Rejected | An exact cap costs one participant row lock (ADR-007) |
| Three-state team lifecycle | Rejected | READY is derived (ADR-010) |
| Audit replay to rebuild state | Deferred | Tier 3 |
| Lock strategy benchmark (UPDATE vs FOR UPDATE vs SKIP LOCKED) | Deferred | Tier 3 |
| Join as a single SQL function (1 round trip) | Deferred | One more week |
| Background invariant service | Rejected | Checker runs after tests and load runs instead |
| Kafka, microservices, Kubernetes | Rejected | No requirement needs them |
| Per-team in-process queue for stampedes | Deferred | In-flight cap and pool timeout are enough so far |

## ADR-031 Frontend stack {#adr-031}

**Decision.** Vite, React 18, TypeScript strict, React Router v6, TanStack Query v5, Tailwind CSS, Vitest. Changed 11 Nov 2026: added headless Radix primitives (dialog, tabs, dropdown menu, switch), `motion`, `lucide-react`, `zod`, the self-hosted Archivo font, Testing Library, eslint-plugin-jsx-a11y and Playwright. Still no styled component library.
**Why.** TanStack Query gives caching, optimistic updates and rollback with little code. Tailwind is fast to write and keeps focus styles consistent. Radix gives correct focus trapping, keyboard handling and ARIA for dialogs, tabs and menus without imposing a look. `motion` animates rows entering and leaving the live board and honors reduced motion. `zod` keeps the client form limits in one place next to the API limits. Playwright runs the real flows on phone and laptop sizes against the real API.
**Measured cost.** Main chunk 508 kB raw, 162.5 kB gzip after the redesign (473 kB / 151 kB before; React DOM, motion, zod and TanStack Query are most of it); pages are lazy chunks of 3 to 43 kB.
**Changed 11 Nov 2026 (redesign).** Added `cmdk` (command palette with correct listbox semantics), `qrcode.react` (invite QR codes for in-person events) and Radix Popover (skill filter panel).

## ADR-032 Rate limits in process memory {#adr-032}

**Decision.** Sliding-window counters per worker in `core/ratelimit.py`.
**Why.** Rate limits are abuse protection, not correctness. The real defense against code guessing is 50 bits of entropy. A database-backed limiter would add a write per attempt.
**Consequences.** With 2 workers, effective limits are up to 2× the configured values. Stated as a gap.

## ADR-033 IANA time zones instead of fixed offsets {#adr-033}

**Decision.** `users.timezone` stores an IANA name (`Asia/Kolkata`, `America/New_York`), validated against `zoneinfo.available_timezones()`. Offsets are computed at the current instant when scoring and displaying. `tzdata` is a dependency so Windows has the database.
**Why.** A fixed UTC offset goes wrong twice a year in daylight-saving zones. The browser gives the IANA name directly, so signup is simpler too.
**Rejected.** `utc_offset_min` (simpler but wrong across DST).
**Consequences.** The suggestions SQL no longer prefilters by offset; time zones are scored in Python.

## ADR-034 Participant and profile changes are events {#adr-034}

**Decision.** Registration, `looking` changes and profile changes write audit rows (`participant_registered`, `participant_updated`, `member_profile_updated`). A profile change bumps the `version` of the user's teams (locked in id order) so their snapshots, which aggregate member skills, are republished as newer.
**Why.** The People board and team skills must update live. Without this, a `looking` change or a skill edit would be invisible until a manual refresh, and the cached team snapshot would be stale with an unchanged version (review finding P0, bug B-9).
**Rejected.** Publishing with `pg_notify` from the service directly (breaks the rule that only audited changes are published).

## ADR-035 Request events go only to their audience {#adr-035}

**Decision.** `request_created`, `request_declined`, `request_withdrawn` and `request_stale` are delivered only to the team's members at commit time and the requester. `audit.repo.record` stores this `audience` in the payload; the hub filters on it.
**Why.** Who asked to join which team is not public board information (review finding, bug B-10). `request_accepted` changes membership, so it is published as a public `team` event with no request detail.

## ADR-036 Design skills for the web UI {#adr-036}

**Decision.** Three design guidance tools used locally during UI work (not part of the repo): `impeccable` (pbakaus, main skill for app UI), `emil-design-eng` (Emil Kowalski, motion and interaction polish), `design-taste-frontend` (Leonxlnx taste-skill, marketing pages only).
**Why.** The UI is judged on usability, phone and keyboard support; the skills raise visual quality without a component library.
**Precedence.** Project rules (accessibility, data flow, consistency) win over any skill guidance. The app is an operational tool: restraint and clarity over effects. taste-skill's shader and scene effects are not used in the app.
**Consequences.** The tools are third-party and stay out of the submission repo.

## ADR-037 Bot checks on signup and login: form token and honeypot {#adr-037}

**Decision.** `GET /api/auth/form-token` returns a JWT (HS256, the session secret, audience `crewline-form`, issue time in milliseconds, 2 h expiry). Signup and login must send it as `form_token`, plus the honeypot field `company`, which the form hides off-screen. `core/formguard.check_form` rejects a filled honeypot, a bad, expired or session token, or a submit under 2 s after issue, with 400 `bot_check_failed`. It runs before the rate limiter.
**Why.** Required by the product rules. A signed token needs no storage, so it works across workers and restarts, like the session. The audience claim means a form token never verifies as a session and a session token never passes as a form token. Checking before the rate limit keeps scripted posts from using up the signup quota of a shared campus IP.
**Rejected.** A third-party CAPTCHA (external script, privacy cost, breaks the strict CSP), storing issued tokens in the database (a write per page view), a client-only check (a script skips it).
**Consequences.** A token can be reused until it expires; the per-IP and per-email rate limits bound that. A headless browser that waits 2 s passes; stated as a gap. Tests mint aged tokens with the test secret instead of sleeping.

## ADR-038 Visual system: wristband team colors {#adr-038}

**Decision.** Every team gets one of 8 band colors, picked from its id with a hash so every client shows the same color. The color follows the team everywhere: board card header, seat tabs, page hero, peek sheet, activity feed. Light theme by default, dark from the system setting; wide Archivo for headings; sidebar on laptops and bottom tabs on phones. The board is a card grid with search, skill filters and sort in the URL, a live activity feed, a peek sheet and a command palette.
**Why.** The project owner reviewed the first version (a dark departure-board look, 11 Nov 2026) and found it plain and hard to scan. Team colors turn a list of names into something the eye can track while it changes live, and the feed makes the realtime system visible instead of silent.
**Changed 11 Nov 2026 (event pass).** Owner picked a hackathon-event direction and allowed subtle non-purple gradients (rule 11 updated): dot-grid canvas, glowing navy banners with real facts (live status, team sizes, open teams), soft band gradients on team headers, sentence-case labels instead of uppercase eyebrows, login steps instead of decorative stripes. **Changed 11 Nov 2026 (later).** Navy brand shell (sidebar, login panel, page banners) and an orange primary action in both themes; a Light, Dark or System switch; dark mode is navy, never black; every blue at hue 194 to 210 so nothing reads as purple. **Changed 11 Nov 2026.** Replaced the concourse board look. Kept: one primary action per page, measured contrast, no gradients, no pill buttons, reduced motion respected.
**Rejected.** Category-standard grey cards with one blue accent (plain), a dark-only board (heavy in daylight), server-side search on the board endpoint (would bypass the 1 s page cache; the client filters loaded pages and says so).
**Consequences.** Filters search only loaded pages; the UI says how many loaded teams match and offers to load more. Activity is live only (no history across reloads), because there is no hackathon-wide audit endpoint.

## ADR-039 Security headers and a strict CSP {#adr-039}

**Decision.** `core/headers.py` adds a Content-Security-Policy with `default-src 'self'`, scripts from `'self'` only, and `'unsafe-inline'` for styles, plus HSTS, nosniff, Referrer-Policy, X-Frame-Options and Permissions-Policy, to every response. The SPA shell is served `no-cache`; hashed assets `immutable`.
**Why.** Architecture section 10 promised these headers but none were sent (bug B-23). A same-origin app with a self-hosted font needs nothing from other origins.
**Changed 11 Nov 2026.** The first version also refused inline styles. A later run that opened dialogs showed violations: Radix dialogs lock page scroll through `react-remove-scroll`, which injects a `<style>` element at runtime, so scroll locking was silently broken (bug B-28). Nonces need per-request templating of index.html and hashes cannot cover content that changes with the scrollbar width, so styles allow `'unsafe-inline'`. Scripts stay `'self'` only, which is what stops injected code. Every e2e page now fails on any CSP violation.
**Consequences.** No third-party scripts, fonts or analytics can be added without changing the policy on purpose. `no-cache` on the shell means a deploy is picked up on the next load.

## ADR-040 Race lab: show the guarantees with real concurrent writes {#adr-040}

**Decision.** A signed-in page (`/lab`) asks the server to run experiments in a hidden lab hackathon: N people joining the last seat at the same instant, one person clicking join many times (same key and new keys), N join requests then two accepts, and three traced joins that list every SQL statement with its time. The server starts all attempts behind one asyncio event and calls the real `join_by_code`, `create_request` and `accept` services, so every attempt goes through `run_write`, the idempotency claim, the conditional UPDATE and the constraints. Results include facts read back from the database.
**Why.** Judges look at correctness under concurrency first. The pytest race test proves it but nobody sees it. A browser cannot start 100,000 or even 50 truly simultaneous requests (about 6 connections per host), so a browser-driven demo would be a slow queue, not a race.
**Rejected.** Animating recorded results (not real), firing requests from the browser (not simultaneous), running experiments on a real hackathon (would fill its board with test teams).
**Consequences.** The lab module calls other modules' services, which the module rules forbid elsewhere; it is the one exception, because its purpose is to run those exact paths. Each run creates synthetic users that cannot log in; runs are capped (200 per run, 6 per user per minute, 120 per hour, one at a time per worker). Attempts above the write in-flight cap get 503 busy and retry with the same key, which the race shows as retries. On Windows, asyncpg's per-statement timer has 15.6 ms resolution, so the walkthrough reports the perf_counter gap between statements instead.
