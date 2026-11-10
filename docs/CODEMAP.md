# Code map

Every file and every function in the project, with a one-line purpose. Update in the same commit as the code.
Status: `planned` (designed, not written) or `done` (written and tested). The purpose line matches the docstring.

Format per file:

```
### path/to/file.py
File purpose.
| Name | Purpose | Status |
```

---

## Database

### db/migrations/0001_init.sql
Initial schema: tables, constraints, indexes, `team_snapshot()`, audit triggers.
| Name | Purpose | Status |
|---|---|---|
| `team_snapshot(uuid)` | Return a team summary as jsonb, including aggregated member skills | done |
| `audit_events_block_change()` | Trigger function that rejects UPDATE and DELETE on audit_events | done |
| `audit_events_publish()` | Trigger function that sends pg_notify for each new audit event | done |

## API core

### api/app/main.py
App factory: lifespan, middleware, routers, static web files. Run with `uvicorn --factory app.main:create_app`.
| Name | Purpose | Status |
|---|---|---|
| `create_app(settings)` | Build the FastAPI app with middleware, routers and the SPA mount | done |
| `lifespan(app)` | Open pools and start background tasks; close them on shutdown | done |
| `mount_web(app, dist_dir)` | Serve the built SPA at / with index.html as the fallback for client routes | done |

### api/app/config.py
Settings loaded from environment variables.
| Name | Purpose | Status |
|---|---|---|
| `Settings` | Typed settings with defaults from architecture.md section 14 | done |
| `Settings.listen_url` | Return the connection string used for LISTEN | done |
| `get_settings()` | Return the cached Settings instance | done |

### api/app/core/errors.py
Domain error types and the HTTP error envelope.
| Name | Purpose | Status |
|---|---|---|
| `DomainError` | Base error with `status`, `code`, `message`, optional `retry_after` | done |
| `ValidationFailed`, `IdempotencyKeyRequired`, `Unauthenticated`, `InvalidCredentials`, `NotLeader`, `MembersOnly`, `NotFound`, `InviteInvalid`, `EmailTaken`, `NotRegistered`, `AlreadyInTeam`, `TeamFull`, `TeamFinalized`, `NotFinalized`, `BelowMinSize`, `RequestNotPending`, `NotAMember`, `CannotRemoveSelf`, `TooManyPendingRequests`, `IdempotencyKeyMismatch`, `RateLimited`, `Busy` | One subclass per error code in api.md | done |
| `error_response(request, status, code, message, retry_after)` | Build the error envelope response with the request id | done |
| `install_error_handlers(app)` | Register handlers that render DomainError as the envelope and validation errors as 400 `validation_error` | done |

### api/app/core/security.py
Password hashing and JWT session tokens.
| Name | Purpose | Status |
|---|---|---|
| `hash_password(plain)` | Hash a password with argon2id in a threadpool | planned |
| `verify_password(hash, plain)` | Check a password against its argon2id hash in a threadpool | planned |
| `issue_token(user_id)` | Create a signed JWT with `sub`, `iat`, `exp` | planned |
| `decode_token(token)` | Verify a JWT and return the user id, or raise | planned |
| `set_session_cookie(response, token)` | Set the httpOnly session cookie | planned |
| `clear_session_cookie(response)` | Remove the session cookie | planned |

### api/app/core/deps.py
FastAPI dependencies shared by routers.
| Name | Purpose | Status |
|---|---|---|
| `current_user_id(request)` | Return the user id from the session cookie or raise 401 | planned |
| `idempotency_key(header)` | Validate and return the Idempotency-Key header or raise 400 | planned |
| `client_ip(request)` | Return the client IP used for rate limits | planned |

### api/app/core/idempotency.py
Idempotency key hashing, lookup, claim and store.
| Name | Purpose | Status |
|---|---|---|
| `request_hash(method, route, params, body)` | Return sha256 of the canonical request | done |
| `lookup(conn, user_id, key)` | Return the stored row for a key, or None | done |
| `claim(conn, user_id, key, req_hash)` | Insert the key row; return False if it already exists (waits for an in-flight owner) | done |
| `store(conn, user_id, key, status, body)` | Save the success response on the claimed row | done |
| `purge_expired(pool, ttl_hours)` | Delete keys older than the TTL; return the number deleted | done |
| `purge_loop(pool, ttl_hours)` | Run purge_expired every hour | done |

### api/app/core/invite_codes.py
Invite code generation and normalization.
| Name | Purpose | Status |
|---|---|---|
| `generate_code()` | Return 10 random Crockford base32 characters | planned |
| `normalize_code(raw)` | Uppercase, strip dashes and spaces, map O/I/L; return None if malformed | planned |
| `format_code(code)` | Return the code as `XXXXX-XXXXX` for display | planned |

### api/app/core/timezones.py
IANA time zone validation and current offsets.
| Name | Purpose | Status |
|---|---|---|
| `validate_timezone(name)` | Return the name if it is a known IANA zone, else raise validation_error | planned |
| `current_offset_hours(name, at)` | Return the UTC offset in hours of a zone at an instant | planned |

### api/app/core/ratelimit.py
In-process sliding-window rate limiter.
| Name | Purpose | Status |
|---|---|---|
| `SlidingWindowLimiter(limit, window_s)` | Count events per key within a time window | planned |
| `SlidingWindowLimiter.hit(key)` | Record an event; return seconds to wait if over the limit, else 0 | planned |
| `SlidingWindowLimiter.check(key)` | Return seconds to wait without recording | planned |
| `limiters` | Configured limiter instances (code per user, code per IP, login, signup, mutations) | planned |

### api/app/core/cache.py
Micro-cache with single-flight loading for board pages.
| Name | Purpose | Status |
|---|---|---|
| `MicroCache(ttl_ms)` | Hold `(etag, bytes)` per key for a short TTL | planned |
| `MicroCache.get_or_load(key, loader)` | Return a cached value or run one loader for all concurrent callers | planned |
| `MicroCache.invalidate_hackathon(hackathon_id)` | Drop every entry for one hackathon | planned |

### api/app/core/events.py
SSE hub: subscriptions per hackathon and event fan-out.
| Name | Purpose | Status |
|---|---|---|
| `EventHub` | Map hackathon id to subscriber queues | planned |
| `EventHub.subscribe(hackathon_id, user_id)` | Register a queue; raise RateLimited past 3 streams per user | planned |
| `EventHub.unsubscribe(sub)` | Remove a subscriber | planned |
| `EventHub.publish(raw_notification)` | Project the notification and push it to the hackathon's subscribers, or only to its audience for request events; drop full queues | planned |
| `EventHub.broadcast_resync()` | Send a resync event to every subscriber | planned |
| `public_projection(raw)` | Return `(kind, data, audience)`: kind `team`, `people` or `request`, data without secrets, audience for request events | planned |

### api/app/core/metrics.py
Prometheus metrics definitions and helpers.
| Name | Purpose | Status |
|---|---|---|
| `REQUEST_DURATION`, `TX_DURATION`, `POOL_ACQUIRE_WAIT`, `BUSY_TOTAL`, `CAP_BACKSTOP_HITS`, `DEADLOCK_RETRIES`, `SSE_CONNECTIONS`, `CACHE_HITS`, `CACHE_MISSES` | Metric objects | planned |
| `collect_pool_stats(pools)` | Update pool size, idle and waiting gauges | planned |
| `metrics_endpoint()` | Return the Prometheus text exposition | planned |

### api/app/core/logging.py
JSON logging setup.
| Name | Purpose | Status |
|---|---|---|
| `JsonFormatter` | Format log records as one JSON line | done |
| `JsonFormatter.format(record)` | Return the record as a JSON string with extra fields included | done |
| `configure_logging(level)` | Install the JSON formatter on the root logger | done |

### api/app/core/middleware.py
Request id and access log middleware (pure ASGI, safe for streaming responses). The write in-flight cap lives in `db/tx.py`.
| Name | Purpose | Status |
|---|---|---|
| `RequestIdMiddleware` | Accept or create X-Request-ID, attach it to the request and response, log one line per request | done |

### api/app/core/skills.py
Fixed skill taxonomy and core roles.
| Name | Purpose | Status |
|---|---|---|
| `SKILLS` | Tuple of the 12 allowed skills | planned |
| `CORE_ROLES` | Tuple of roles a balanced team wants | planned |
| `Skill` | Enum type used in pydantic models | planned |

## API database layer

### api/app/db/pools.py
Read and write asyncpg pools.
| Name | Purpose | Status |
|---|---|---|
| `init_connection(conn)` | Register json and jsonb codecs that use orjson | done |
| `Pools` | Holds the read and write pools and the acquire timeout | done |
| `create_pools(settings)` | Open both pools with their server settings and application names (`crewline-read`, `crewline-write`) | done |
| `close_pools()` | Close both pools | done |
| `pools()` | Return the open pools | done |
| `read_conn()` | Acquire a read connection with the acquire timeout; 503 busy on timeout | done |
| `write_conn()` | Acquire a write connection with the acquire timeout; 503 busy on timeout | done |

### api/app/db/tx.py
Write-transaction wrapper: idempotency claim, timeouts, retries, rollback on any error, in-flight cap.
| Name | Purpose | Status |
|---|---|---|
| `WriteContext` | User id, idempotency key, request hash, request id and route name for one write | done |
| `Outcome` | Status and JSON body of a write; `store=False` means nothing changed and nothing is stored | done |
| `GuardFailed` | A guarded statement matched 0 rows; the transaction rolls back and the explanation runs | done |
| `StateChanged` | The explanation found no reason for a failed guard; run_write retries the transaction | done |
| `_Rollback` | Carries an outcome (replay or nothing-changed) out of a transaction that must not commit | done |
| `configure(inflight_max)` | Set the per-worker in-flight write cap | done |
| `replay_fast_path(ctx)` | Return a committed stored response for the key, or None; never decides business outcomes | done |
| `run_write(ctx, body, explain)` | Run body in one transaction after claiming the key; store the response; retry deadlocks and StateChanged | done |
| `run_plain_write(body)` | Run a small transaction without an idempotency claim (stale marking) | done |
| `stats` | Counters for deadlock retries, state retries and busy responses | done |

### api/app/db/errors.py
Map PostgreSQL errors to domain errors by constraint name and SQLSTATE.
| Name | Purpose | Status |
|---|---|---|
| `CONSTRAINT_ERRORS` | Constraint name to DomainError class | done |
| `constraint_of(exc)` | Return the constraint name carried by an integrity error, if any | done |
| `to_domain_error(exc)` | Convert an asyncpg integrity error to a DomainError, or return None | done |
| `is_retryable(exc)` | True for 40P01 and 40001 | done |
| `is_busy(exc)` | True for lock timeouts, statement timeouts and connection exhaustion | done |

### api/app/db/listener.py
Dedicated LISTEN connection with reconnect.
| Name | Purpose | Status |
|---|---|---|
| `EventListener(settings, hub, cache)` | Owns the LISTEN connection | planned |
| `EventListener.start()` | Connect and LISTEN on team_events | planned |
| `EventListener.stop()` | Close the connection | planned |
| `EventListener._on_notify(conn, pid, channel, payload)` | Clear the hackathon cache and publish to the hub | planned |
| `EventListener._on_terminate(conn)` | Schedule a reconnect | planned |
| `EventListener._reconnect()` | Reconnect with backoff, then broadcast resync | planned |

## API modules

### api/app/modules/auth/router.py
Auth and profile endpoints.
| Name | Purpose | Status |
|---|---|---|
| `signup(body)` | POST /api/auth/signup | planned |
| `login(body)` | POST /api/auth/login | planned |
| `logout()` | POST /api/auth/logout | planned |
| `me(user_id)` | GET /api/auth/me | planned |
| `update_me(body, user_id)` | PATCH /api/users/me | planned |

### api/app/modules/auth/schemas.py
Auth request and response models.
| Name | Purpose | Status |
|---|---|---|
| `SignupIn`, `LoginIn`, `UpdateMeIn`, `UserOut` | Validated models with limits from api.md | planned |

### api/app/modules/auth/service.py
Signup, login and profile rules.
| Name | Purpose | Status |
|---|---|---|
| `signup(data, ip)` | Rate-limit, hash the password, create the user | planned |
| `login(data, ip)` | Rate-limit, verify the password, return the user | planned |
| `update_profile(ctx, data)` | Update name, skills and time zone; bump the user's team versions; audit and publish | planned |

### api/app/modules/auth/repo.py
User SQL.
| Name | Purpose | Status |
|---|---|---|
| `insert_user(conn, ...)` | Insert a user; 23505 maps to email_taken | planned |
| `get_by_email(conn, email)` | Return id and password hash for an email | planned |
| `get_by_id(conn, user_id)` | Return a user | planned |
| `update_profile(conn, user_id, fields)` | Update profile columns | planned |
| `bump_member_teams(conn, user_id)` | Lock the user's teams in id order, increment their version, return team and hackathon ids | planned |
| `participations(conn, user_id)` | Return the hackathon ids the user is registered in | planned |

### api/app/modules/hackathons/router.py
Hackathon endpoints.
| Name | Purpose | Status |
|---|---|---|
| `list_hackathons()` | GET /api/hackathons | planned |
| `get_hackathon(hid)` | GET /api/hackathons/{hid} | planned |
| `register(hid, user_id)` | POST /api/hackathons/{hid}/register | planned |
| `my_status(hid, user_id)` | GET /api/hackathons/{hid}/me | planned |
| `set_looking(hid, body, user_id)` | PATCH /api/hackathons/{hid}/me | planned |
| `meta()` | GET /api/meta | planned |

### api/app/modules/hackathons/service.py
Participant registration and status.
| Name | Purpose | Status |
|---|---|---|
| `register(ctx, hid)` | Insert the participant row if missing; audit participant_registered when inserted | planned |
| `my_status(hid, user_id)` | Return registration, looking flag, team and pending requests | planned |
| `set_looking(ctx, hid, looking)` | Update the looking flag; audit participant_updated when it changed | planned |

### api/app/modules/hackathons/repo.py
Hackathon and participant SQL.
| Name | Purpose | Status |
|---|---|---|
| `list_all(conn)` | Return all hackathons | planned |
| `get(conn, hid)` | Return one hackathon | planned |
| `insert_participant(conn, hid, user_id)` | Insert participant ON CONFLICT DO NOTHING; return the row if inserted | planned |
| `get_participant(conn, hid, user_id)` | Return the participant row | planned |
| `set_looking(conn, hid, user_id, looking)` | Update the looking flag if it differs; return the row or None | planned |

### api/app/modules/teams/router.py
Team endpoints.
| Name | Purpose | Status |
|---|---|---|
| `create_team(hid, body, ...)` | POST /api/hackathons/{hid}/teams | planned |
| `get_team(tid)` | GET /api/teams/{tid} | planned |
| `update_team(tid, body, ...)` | PATCH /api/teams/{tid} | planned |
| `join_by_code(body, ...)` | POST /api/teams/join | planned |
| `leave(tid, ...)` | POST /api/teams/{tid}/leave | planned |
| `remove_member(tid, uid, ...)` | DELETE /api/teams/{tid}/members/{uid} | planned |
| `finalize(tid, ...)` | POST /api/teams/{tid}/finalize | planned |
| `reopen(tid, ...)` | POST /api/teams/{tid}/reopen | planned |
| `get_invite(tid, user_id)` | GET /api/teams/{tid}/invite | planned |
| `regenerate_invite(tid, ...)` | POST /api/teams/{tid}/invite/regenerate | planned |

### api/app/modules/teams/schemas.py
Team request and response models.
| Name | Purpose | Status |
|---|---|---|
| `CreateTeamIn`, `UpdateTeamIn`, `JoinIn`, `TeamSummaryOut`, `MemberOut`, `TeamDetailOut`, `InviteOut`, `LeaveOut` | Validated models | planned |

### api/app/modules/teams/service.py
Team rules and transactions (architecture.md 6.1, 6.2, 6.7 to 6.10).
| Name | Purpose | Status |
|---|---|---|
| `create_team(ctx, hid, name)` | Create a team with the caller as leader | planned |
| `join_by_code(ctx, raw_code, ip)` | Normalize the code, check rate limits, then in one transaction take a seat and add the membership | planned |
| `leave(ctx, tid)` | Remove the caller; promote a new leader or delete the team | planned |
| `remove_member(ctx, tid, target)` | Leader removes a member | planned |
| `finalize(ctx, tid)` | Leader finalizes a team that meets min size | planned |
| `reopen(ctx, tid)` | Leader reopens a finalized team | planned |
| `regenerate_invite(ctx, tid)` | Leader replaces the invite code | planned |
| `update_team(ctx, tid, fields)` | Leader changes name or looking flag | planned |
| `get_team(tid)` | Return team detail | planned |
| `get_invite(tid, user_id)` | Return the invite code to a member | planned |
| `_explain_join(code, user_id)` | After a rolled-back join: 200 already member, 404, 409 finalized / full / already_in_team / not_registered, or StateChanged | planned |
| `_explain_leader_failure(conn, tid, user_id)` | Choose 404, 403 or 409 after a 0-row leader update | planned |

### api/app/modules/teams/repo.py
Team and membership SQL.
| Name | Purpose | Status |
|---|---|---|
| `insert_team(conn, hid, name, leader_id, code)` | Insert a team copying sizes and TTL from the hackathon | planned |
| `insert_membership(conn, tid, hid, user_id)` | Insert a membership row | planned |
| `take_seat_by_code(conn, code)` | Conditional seat UPDATE by invite code; return id, hackathon, count, version or None | planned |
| `take_seat_as_leader(conn, tid, leader_id)` | Conditional seat UPDATE for an accept; return row or None | planned |
| `lock_team(conn, tid)` | SELECT ... FOR UPDATE on the team row | planned |
| `lock_team_shared(conn, tid)` | SELECT ... FOR SHARE on the team row | planned |
| `delete_membership(conn, tid, user_id)` | Delete one membership; return True if a row was deleted | planned |
| `shrink_team(conn, tid, leaver_id)` | Decrement count, reopen, promote earliest member if the leader left | planned |
| `delete_team(conn, tid)` | Delete the team row (requests cascade) | planned |
| `set_status(conn, tid, leader_id, from_status, to_status)` | Conditional status change by the leader | planned |
| `set_invite(conn, tid, leader_id, code)` | Replace the invite code and expiry | planned |
| `update_fields(conn, tid, leader_id, fields)` | Update name or looking by the leader | planned |
| `find_by_code(conn, code)` | Return the team for an invite code | planned |
| `get_membership(conn, hid, user_id)` | Return the caller's team id in a hackathon | planned |
| `get_detail(conn, tid)` | Return the team snapshot and members | planned |
| `get_state(conn, tid)` | Return id, leader, status, counts and expiry for error explanation | planned |

### api/app/modules/requests/router.py
Join request endpoints.
| Name | Purpose | Status |
|---|---|---|
| `create_request(tid, body, ...)` | POST /api/teams/{tid}/requests | planned |
| `list_for_team(tid, user_id)` | GET /api/teams/{tid}/requests | planned |
| `list_mine(hid, user_id)` | GET /api/hackathons/{hid}/my-requests | planned |
| `accept(rid, ...)` | POST /api/requests/{rid}/accept | planned |
| `decline(rid, ...)` | POST /api/requests/{rid}/decline | planned |
| `withdraw(rid, ...)` | POST /api/requests/{rid}/withdraw | planned |

### api/app/modules/requests/schemas.py
Join request models.
| Name | Purpose | Status |
|---|---|---|
| `CreateRequestIn`, `JoinRequestOut` | Validated models | planned |

### api/app/modules/requests/service.py
Join request rules and transactions (architecture.md 6.3 to 6.6).
| Name | Purpose | Status |
|---|---|---|
| `create_request(ctx, tid, message)` | Lock the team (forming, not full) and the participant row (cap 5), then create a pending request or return the existing one | planned |
| `accept(ctx, rid)` | Leader accepts: seat, request transition, membership; mark stale on 23505 | planned |
| `decline(ctx, rid)` | Leader declines a pending request | planned |
| `withdraw(ctx, rid)` | Requester withdraws a pending request | planned |
| `list_for_team(tid, user_id)` | Pending requests for the leader, hiding users already in a team | planned |
| `list_mine(hid, user_id)` | The caller's requests in a hackathon | planned |
| `_mark_stale(rid, actor_id)` | Follow-up transaction that marks a request stale and audits it | planned |

### api/app/modules/requests/repo.py
Join request SQL.
| Name | Purpose | Status |
|---|---|---|
| `insert_request(conn, tid, hid, user_id, message)` | Insert pending; return id or None if one exists | planned |
| `get_pending(conn, tid, user_id)` | Return the existing pending request | planned |
| `get_ids(conn, rid)` | Return the team and hackathon ids of a request | planned |
| `lock_participant(conn, hid, user_id)` | SELECT ... FOR NO KEY UPDATE on the participant row; return False if missing | planned |
| `transition(conn, rid, tid, from_status, to_status, actor_id)` | Conditional status change; return user_id or None | planned |
| `withdraw(conn, rid, user_id)` | Conditional withdraw by the requester; return team and hackathon or None | planned |
| `count_pending_for_user(conn, hid, user_id)` | Count the caller's pending requests in a hackathon | planned |
| `list_pending_for_team(conn, tid)` | Pending requests excluding users already in a team | planned |
| `list_for_user(conn, hid, user_id)` | The caller's requests | planned |

### api/app/modules/board/router.py
Board endpoints.
| Name | Purpose | Status |
|---|---|---|
| `teams_board(hid, limit, cursor, if_none_match)` | GET /api/hackathons/{hid}/board/teams | planned |
| `people_board(hid, limit, cursor, if_none_match)` | GET /api/hackathons/{hid}/board/people | planned |

### api/app/modules/board/service.py
Board pages through the micro-cache.
| Name | Purpose | Status |
|---|---|---|
| `teams_page(hid, limit, cursor)` | Return `(etag, bytes)` for a teams page | planned |
| `people_page(hid, limit, cursor)` | Return `(etag, bytes)` for a people page | planned |

### api/app/modules/board/repo.py
Board SQL.
| Name | Purpose | Status |
|---|---|---|
| `teams_page(conn, hid, after, limit)` | Keyset page of open teams as snapshots | planned |
| `people_page(conn, hid, after, limit)` | Keyset page of looking participants without a team | planned |

### api/app/modules/board/cursor.py
Opaque keyset cursors.
| Name | Purpose | Status |
|---|---|---|
| `encode_cursor(ts, id)` | Return a base64url cursor | planned |
| `decode_cursor(cursor)` | Return `(ts, id)` or raise validation_error | planned |

### api/app/modules/suggestions/router.py
Suggestions endpoint.
| Name | Purpose | Status |
|---|---|---|
| `suggestions(hid, limit, user_id)` | GET /api/hackathons/{hid}/suggestions | planned |

### api/app/modules/suggestions/service.py
Build the team context, fetch candidates, rank.
| Name | Purpose | Status |
|---|---|---|
| `suggest(hid, user_id, limit)` | Return context and ranked candidates | planned |

### api/app/modules/suggestions/repo.py
Suggestions SQL.
| Name | Purpose | Status |
|---|---|---|
| `group_context(conn, hid, user_id)` | Return the caller's team id (or None) and the group's skills and time zones; the caller alone when teamless | planned |
| `candidates(conn, hid, exclude_ids, missing)` | Looking participants without a team, ordered by missing-skill overlap then recency (max 500) | planned |

### api/app/modules/suggestions/scoring.py
Pure scoring functions.
| Name | Purpose | Status |
|---|---|---|
| `circular_hours(a_hours, b_hours)` | Hour distance between two UTC offsets on a 24 h circle | planned |
| `tz_overlap(group_zones, cand_zone, at)` | Worst-case working-window overlap with the group at an instant, 0 to 1 | planned |
| `complement(team_skills, cand_skills)` | Share of missing core roles the candidate covers | planned |
| `redundancy(team_skills, cand_skills)` | Share of candidate skills the team already has | planned |
| `completeness(cand_skills)` | Profile completeness, 0 to 1 | planned |
| `score_candidate(team, cand)` | Weighted score, breakdown and reasons | planned |
| `rank(team, cands, limit)` | Sort by score, timezone, user id and cut to limit | planned |

### api/app/modules/audit/repo.py
Audit SQL.
| Name | Purpose | Status |
|---|---|---|
| `record(conn, hid, tid, actor_id, action, payload, request_id)` | Insert an audit event; add the team snapshot, and the audience for request actions, in the same statement | planned |
| `list_for_team(conn, tid, before_seq, limit)` | Keyset page of a team's audit events | planned |

### api/app/modules/audit/router.py
Team audit endpoint.
| Name | Purpose | Status |
|---|---|---|
| `team_audit(tid, limit, cursor, user_id)` | GET /api/teams/{tid}/audit for members | planned |

### api/app/modules/events/router.py
SSE endpoint.
| Name | Purpose | Status |
|---|---|---|
| `stream(hackathon_id, user_id)` | GET /api/events: subscribe and yield events with heartbeats | planned |

## Tests

### api/tests/conftest.py
Fixtures for the test database, a real API server and per-test cleanup.
| Name | Purpose | Status |
|---|---|---|
| `_admin_url()` | Return a server URL from TEST_DATABASE_URL, or start the local pgserver test instance | done |
| `_database_url(admin_url, name)` | Return the admin URL pointed at another database | done |
| `_free_port()` | Return a free local TCP port | done |
| `db_url` | Create a fresh test database with all migrations applied | done |
| `start_server(db_url, log_path, extra_env)` | Start uvicorn as a subprocess and wait until /readyz answers | done |
| `stop_server(proc)` | Stop a server subprocess | done |
| `server` | Run one real API server for the whole session and return its base URL | done |
| `truncate(db_url)` | Remove all rows from every application table | done |
| `clean_db` | Empty the database before a test and assert the invariants after it | done |

### api/tests/api/conftest.py
| Name | Purpose | Status |
|---|---|---|
| `_clean` | Apply clean_db to every API test | done |

### api/tests/concurrency/barrier.py
Helpers to release many requests at once.
| Name | Purpose | Status |
|---|---|---|
| `fire_together(calls)` | Await all calls behind one asyncio.Event barrier | planned |
| `retry_busy(call)` | Repeat a call with the same key until it is not 503 | planned |

### api/tests/concurrency/naive.py
Test-only check-then-insert join for the negative control.
| Name | Purpose | Status |
|---|---|---|
| `naive_join(conn, tid, user_id, sleep_s)` | Read count, sleep, insert membership, increment without a predicate | planned |
| `weaken_schema(conn)` | Drop `teams_cap` in the test schema | planned |

Test modules (`api/tests/api/test_*.py`, `api/tests/concurrency/test_*.py`, `api/tests/unit/test_*.py`): one test function per ID in verification.md.

## Scripts

### scripts/migrate.py
Apply SQL migrations in order (creates `schema_migrations`, holds an advisory lock).
| Name | Purpose | Status |
|---|---|---|
| `apply_migrations(url)` | Apply files not yet in schema_migrations; return the versions applied | done |
| `main()` | CLI entry point | done |

### scripts/dev_db.py
Local PostgreSQL 16 without Docker, using the pgserver package.
| Name | Purpose | Status |
|---|---|---|
| `data_dir(name)` | Return the data directory for a named dev database | done |
| `start(name)` | Start or reuse the server and return its connection URL | done |
| `stop(name)` | Stop the server with pg_ctl | done |
| `main()` | CLI entry point | done |

### scripts/seed.py
Bulk seed data and k6 tokens.
| Name | Purpose | Status |
|---|---|---|
| `seed(url, users, teams, hackathons)` | Insert users, participants, teams, memberships and audit rows with COPY | planned |
| `write_tokens(path, user_ids)` | Write pre-minted JWTs for k6 | planned |
| `main()` | CLI entry point | planned |

### scripts/invariants.py and scripts/invariants.sql
Invariant checker.
| Name | Purpose | Status |
|---|---|---|
| `load_checks()` | Return (id, description, query) for each invariant block | done |
| `run_checks(url)` | Run every invariant query and return violations keyed by invariant id | done |
| `main()` | Print violations and exit non-zero if any | done |

### scripts/chaos.py
Kill the API mid-join and verify.
| Name | Purpose | Status |
|---|---|---|
| `start_api()` | Start uvicorn as a subprocess | planned |
| `workload(...)` | Clients joining teams with retries and fixed keys | planned |
| `run_chaos(kills, interval_s)` | Kill and restart the API during the workload, then check invariants | planned |
| `main()` | CLI entry point | planned |

## Load tests

### loadtest/lib.js
Shared k6 helpers.
| Name | Purpose | Status |
|---|---|---|
| `loadTokens()` | Read tokens.json in the init stage | planned |
| `authParams(token, route)` | Cookie header and route tag | planned |

### loadtest/board.js
Scenario L-A1 and L-A2.
| Name | Purpose | Status |
|---|---|---|
| `options` | Stages and thresholds | planned |
| `default()` | Fetch board pages, follow cursors | planned |

### loadtest/mixed.js
Scenario L-B.
| Name | Purpose | Status |
|---|---|---|
| `options` | Board, stampede and churn scenarios | planned |
| `boardReader()`, `stampede()`, `churn()` | Scenario functions | planned |

### loadtest/soak.js
Scenario L-C.
| Name | Purpose | Status |
|---|---|---|
| `options`, `default()` | 10-minute steady board load | planned |

## Web

### web/src/api/client.ts
Fetch wrapper.
| Name | Purpose | Status |
|---|---|---|
| `request(method, path, body?, opts?)` | Same-origin fetch with credentials, error envelope parsing, 503 retry with the same key | planned |
| `ApiError` | Error with status and code | planned |
| `newIdempotencyKey()` | Return a random key for one user action | planned |

### web/src/api/endpoints.ts
One function per endpoint in api.md.
| Name | Purpose | Status |
|---|---|---|
| `signup`, `login`, `logout`, `me`, `updateMe`, `listHackathons`, `getHackathon`, `register`, `myStatus`, `setLooking`, `teamsBoard`, `peopleBoard`, `createTeam`, `getTeam`, `updateTeam`, `joinByCode`, `leaveTeam`, `removeMember`, `finalizeTeam`, `reopenTeam`, `getInvite`, `regenerateInvite`, `teamAudit`, `createRequest`, `teamRequests`, `myRequests`, `acceptRequest`, `declineRequest`, `withdrawRequest`, `suggestions`, `meta` | Typed endpoint calls | planned |

### web/src/api/types.ts
API payload types matching api.md.
| Name | Purpose | Status |
|---|---|---|
| `Skill`, `User`, `PublicUser`, `TeamSummary`, `TeamDetail`, `Member`, `JoinRequest`, `Hackathon`, `Suggestion`, `AuditEvent`, `Page<T>`, `ErrorCode` | Types | planned |

### web/src/hooks/useEventStream.ts
SSE subscription that patches the query cache.
| Name | Purpose | Status |
|---|---|---|
| `useEventStream(hackathonId)` | Open the stream, refetch on open, merge team events and tombstones, refetch people and request lists, handle resync | planned |

### web/src/hooks/queries.ts
Query hooks.
| Name | Purpose | Status |
|---|---|---|
| `useMe()`, `useHackathons()`, `useMyStatus(hid)`, `useTeamsBoard(hid)`, `usePeopleBoard(hid)`, `useTeam(tid)`, `useTeamRequests(tid)`, `useSuggestions(hid)`, `useTeamAudit(tid)` | Data hooks with query keys from `lib/keys.ts` | planned |

### web/src/hooks/mutations.ts
Mutation hooks with optimistic updates.
| Name | Purpose | Status |
|---|---|---|
| `useJoinByCode()`, `useCreateTeam()`, `useLeaveTeam()`, `useAcceptRequest()`, `useDeclineRequest()`, `useWithdrawRequest()`, `useRemoveMember()`, `useFinalizeTeam()`, `useReopenTeam()`, `useRegenerateInvite()`, `useCreateRequest()` | One idempotency key per action, optimistic patch, rollback on error | planned |

### web/src/lib/merge.ts
Version-based merging of events and snapshots.
| Name | Purpose | Status |
|---|---|---|
| `mergeTeam(cached, incoming)` | Keep the higher version | planned |
| `mergeBoardPage(page, incoming)` | Patch, insert or remove one team in a board page | planned |
| `tombstones` | Map of deleted team id to deletion version | planned |
| `isTombstoned(teamId, version)` | True if a snapshot is older than the team's deletion | planned |

### web/src/lib/keys.ts
Query key factory.
| Name | Purpose | Status |
|---|---|---|
| `keys` | Query keys for every resource | planned |

### web/src/lib/time.ts
Time zone helpers.
| Name | Purpose | Status |
|---|---|---|
| `formatZone(timezone)` | Return `Asia/Kolkata (UTC+05:30)` using the current offset | planned |
| `browserTimeZone()` | Return the browser's IANA time zone | planned |

### web/src/pages/*
| File | Purpose | Status |
|---|---|---|
| `LoginPage.tsx` | Login form | planned |
| `SignupPage.tsx` | Signup form with skills and time zone | planned |
| `HackathonsPage.tsx` | List hackathons and register | planned |
| `BoardPage.tsx` | Teams and People tabs with live updates | planned |
| `CreateTeamPage.tsx` | Create team form | planned |
| `JoinPage.tsx` | Enter or paste an invite code | planned |
| `TeamPage.tsx` | Members, requests, invite, leave, finalize, audit | planned |
| `ProfilePage.tsx` | Edit name, skills, time zone | planned |

### web/src/components/*
| File | Purpose | Status |
|---|---|---|
| `TeamCard.tsx` | One team on the board | planned |
| `PersonCard.tsx` | One person on the board or in suggestions | planned |
| `MemberList.tsx` | Team members with leader badge and remove buttons | planned |
| `RequestList.tsx` | Pending requests with accept and decline | planned |
| `InviteCodeBox.tsx` | Show, copy and regenerate the invite code | planned |
| `SkillPicker.tsx` | Accessible multi-select for skills | planned |
| `LiveRegion.tsx` | aria-live region and a hook to announce messages | planned |
| `Layout.tsx` | Header, skip link, main landmark | planned |
| `SuggestionList.tsx` | Ranked suggestions with score breakdown | planned |
| `AuditList.tsx` | Team audit events | planned |
