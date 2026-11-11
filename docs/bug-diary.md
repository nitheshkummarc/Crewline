# Bug diary

Real bugs found while building, with how they were found, reproduced and fixed. Only real entries; nothing invented.
The best entries go into the design doc and the interview.

## Format

| ID | Date | Area | Symptom | How found | Root cause | Fix | Regression test |
|---|---|---|---|---|---|---|---|

## Found in design review (before code)

These were found by reviewing the plan, not by running code. They have regression tests planned in verification.md section 10.

| ID | Date | Area | Symptom | How found | Root cause | Fix | Regression test |
|---|---|---|---|---|---|---|---|
| B-1 | 2026-11-10 | idempotency | Retry of a winning last-seat join returns 409 | Plan review | "Team full" pre-check ran before the idempotency lookup | First fix (reorder pre-checks) was incomplete; superseded by B-7: all business decisions after the claim | T-RACE-11 |
| B-2 | 2026-11-10 | board cache | Client refetches after an event and gets the old page | Plan review | 1 s micro-cache served the pre-change page | Clear the hackathon's cache on every notification before fan-out; events carry the snapshot | T-API-35 |
| B-3 | 2026-11-10 | realtime | Live updates stop silently | Plan review | LISTEN connection drop not handled | Reconnect with backoff and send `resync` | Listener reconnect test |
| B-4 | 2026-11-10 | requests | Possible deadlock between a join and another leader's accept | Plan review | Cancelling other pending requests inside the join transaction | Lazy stale handling (ADR-014) | T-RACE-06 |
| B-5 | 2026-11-10 | schema | A membership could carry a different hackathon than its team | External review | No composite FK | Composite FK `(team_id, hackathon_id)` (ADR-009) | I6 |
| B-6 | 2026-11-10 | accept | Count incremented while the request was already decided | External review | Commit after a 0-row request update | Any rejection raises and rolls back (run_write) | T-RACE-07 |
| B-7 | 2026-11-10 | idempotency | A retry racing its original gets 409 although the original took the seat | Second external review | State-dependent pre-checks ran before the key claim | All business decisions after the claim; only a committed replay may answer early (ADR-013) | T-RACE-16 |
| B-8 | 2026-11-10 | requests | Pending request created for a team that just filled or finalized | Second external review | FK `KEY SHARE` does not conflict with seat updates | `FOR SHARE` on the team row before the insert | T-API-43, T-RACE-17 |
| B-9 | 2026-11-10 | realtime | People board and team skills stale after registration, `looking` or profile change | Second external review | Only team actions were audited and published; profile change did not bump team versions | Participant and profile events, version bump (ADR-034) | T-API-40, T-API-41 |
| B-10 | 2026-11-10 | privacy | Request events broadcast to the whole hackathon | Second external review | No audience on request events | Audience filter (ADR-035) | T-API-42 |
| B-11 | 2026-11-10 | web | Deleted team reappears from an in-flight fetch | Second external review | Deletion event had no version | Tombstone version | T-API-45, T-WEB-04 |
| B-12 | 2026-11-10 | suggestions | Time zone score undefined without a team | Second external review | Formula took a min over an empty set | Caller is a one-person group | T-API-44 |
| B-13 | 2026-11-10 | api contract | Validation errors would return 422, which the contract reserves for key mismatch | Second external review | FastAPI default handler | Custom handler returns 400 | T-API-29 |

## Found while building

Rule: no fix without a confirmed root cause. Each row says how the cause was proven.

| ID | Date | Area | Symptom | How found | Root cause (and proof) | Fix | Regression test |
|---|---|---|---|---|---|---|---|
| B-14 | 2026-11-10 | idempotency | Replayed join response differed from the original at byte 106 | T-API-26 failed (`first.content != replay.content`) | `response_body` was `jsonb`, which stores object keys sorted by length, so the replay re-serialized keys in another order. Proven by the diff offset falling on the first key after `id` | Migration 0002 stores the response as exact JSON text; replay parses and re-dumps it with orjson, giving identical bytes | T-API-26, T-RACE-10, T-RACE-11 |
| B-15 | 2026-11-10 | serialization | Leader leaving returned 500 | T-API-20 failed; server log showed `DataError: Type is not JSON serializable: asyncpg.pgproto.pgproto.UUID` | asyncpg decodes `uuid` to its own UUID subclass, which orjson refuses; the audit payload carried a leader id read from a row | Connection init registers a `uuid` codec that decodes to standard `uuid.UUID` (orjson-native) | T-API-20 |
| B-16 | 2026-11-10 | schema | Migration 0001 failed on the dev database | First test run: `extension "citext" is not available` | The bundled PostgreSQL build ships without contrib extensions | Emails stored lowercased with `CHECK (email = lower(email))` plus UNIQUE: same guarantee, no extension | T-API-02 |
| B-17 | 2026-11-10 | dev tooling | Test run hung for 10 minutes | Run never finished; `pg_ctl status` and the server log showed a completed restart | `subprocess.run(..., capture_output=True)` around `pg_ctl restart`: the restarted postmaster inherited the pipes and kept them open, so `run` waited forever for EOF | Run PostgreSQL tools with stdin/stdout/stderr on DEVNULL | dev_db start, twice in a row |
| B-18 | 2026-11-10 | dev tooling | `ConnectionResetError` connecting to the dev database | After B-17, `pgserver.get_server` returned a URL while `pg_ctl status` said no server was running | pgserver keeps its own state about running servers and returned a stale URL after the external restart | `database/dev_db.py` uses only the bundled `initdb` and `pg_ctl`, with a fixed port per instance | dev_db start, twice in a row |
| B-19 | 2026-11-10 | tests | One 50-way race round took about 41 s | Phase timing: `bulk50` took 36 s although its SQL is one statement | Each `httpx.AsyncClient()` builds a new TLS context and loads the CA bundle: measured 235 ms per client vs 0.77 ms with a shared context | One shared TLS context for all test clients (test-only; the app is not affected) | Round time 41 s to 2.6 s |
| B-20 | 2026-11-10 | performance | `create_team` took 60 to 130 ms right after a stampede, then about 20 ms | Server request log, in order | Cold PostgreSQL backends: the stampede grew the pool to about 50 new connections (a new process each on Windows), LIFO reuse then hands a request a connection that has never planned its statements; asyncpg also closes idle connections after 300 s, which would make the site cold again after every quiet 5 minutes. Proven by latency falling to steady state after the first uses and by an A/B run (below) | Pools open fully at startup and never reap idle connections (ADR-020). Stampede 409 p95 went from 826 ms to 470 ms in the same session | Load scenario L-B |
| B-21 | 2026-11-11 | performance | Suggestions p50 32 ms server-side, 10x other reads | Latency probe on seeded data | Profiled: Python scoring took 17.7 ms of it. `current_offset_hours` ran 4,000 times for 500 candidates (each group member and candidate, twice per candidate), and 93 `io.open` calls showed `ZoneInfo` re-reading tzdata files because its own cache keeps only a few zones while the seed uses 10. SQL (top-N sort of about 6,000 rows) took the other 9.5 ms | Cache ZoneInfo objects for the process and offsets per (zone, instant); compute the overlap once per candidate. Scoring 17.7 ms to 3.8 ms, endpoint p50 32.0 to 16.5 ms; results unchanged | T-UNIT-01, T-API-33, T-API-44 |

### Measurement notes

- An apparent 3x slowdown after B-20's fix was investigated before acting: an interleaved A/B (lazy vs pre-opened pools, three rounds) showed the same latency within each round (11.6 vs 12.2, 10.7 vs 10.5, 4.5 vs 4.2 ms) and large swings between rounds. Cause: about 44 % background CPU load on the dev machine. Load numbers must come from a quiet machine or CI, with the load noted.
- Board under 100 concurrent users (11 Nov): the single-process Python load client used 100 % of a core while the server used about 35 % and PostgreSQL almost nothing; a second server worker did not raise throughput. The client was the bottleneck; 4 client processes doubled throughput and cut p95 from 185 to 114 ms. Official numbers come from k6 (load-report.md).
- Ruled out with data: event-loop round trip inside uvicorn (0.25 ms), per-request logging (INFO vs WARNING identical), Nagle/delayed ACK (`TCP_NODELAY` made no difference).
