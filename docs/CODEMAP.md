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

### database/migrations/0001_init.sql
Initial schema: tables, constraints, indexes, `team_snapshot()`, audit triggers.
| Name | Purpose | Status |
|---|---|---|
| `team_snapshot(uuid)` | Return a team summary as jsonb, including aggregated member skills | done |
| `audit_events_block_change()` | Trigger function that rejects UPDATE and DELETE on audit_events | done |
| `audit_events_publish()` | Trigger function that sends pg_notify for each new audit event | done |

### database/migrations/0003_lab_hackathon.sql
`hackathons.is_lab` and the partial unique index `hackathons_one_lab` (at most one hidden Race lab hackathon).
| Name | Purpose | Status |
|---|---|---|

## API core

### backend/app/main.py
App factory: lifespan (pools, listener, purge task), middleware, routers, health, metrics, static web files. Run with `uvicorn --factory app.main:create_app`.
| Name | Purpose | Status |
|---|---|---|
| `lifespan(app)` | Open pools, start the LISTEN listener and the idempotency purge task; stop them on shutdown | done |
| `mount_web(app, dist_dir)` | Serve the built SPA at / with index.html as the fallback for client routes (GET and HEAD, B-32) | done |
| `spa(path)` | Return a built file, or index.html so the client router decides; API paths stay 404 | done |
| `healthz()` | Liveness: the process answers; no database call (GET and HEAD) | done |
| `readyz()` | Readiness: one SELECT 1 on the read pool; 503 busy if the database is unreachable (GET and HEAD) | done |
| `create_app(settings)` | Build the app: rate limits, cache, event hub, middleware (security headers, request id), routers, /healthz, /readyz, /metrics, SPA | done |

### backend/app/config.py
Settings loaded from environment variables.
| Name | Purpose | Status |
|---|---|---|
| `Settings` | Typed settings with defaults from architecture.md section 14 | done |
| `Settings.listen_url` | Return the connection string used for LISTEN | done |
| `get_settings()` | Return the cached Settings instance | done |

### backend/app/core/errors.py
Domain error types and the HTTP error envelope.
| Name | Purpose | Status |
|---|---|---|
| `DomainError` | Base error with `status`, `code`, `message`, optional `retry_after` | done |
| `ValidationFailed`, `BotCheckFailed`, `IdempotencyKeyRequired`, `Unauthenticated`, `InvalidCredentials`, `NotLeader`, `MembersOnly`, `NotFound`, `InviteInvalid`, `EmailTaken`, `NotRegistered`, `AlreadyInTeam`, `TeamFull`, `TeamFinalized`, `NotFinalized`, `BelowMinSize`, `RequestNotPending`, `NotAMember`, `CannotRemoveSelf`, `TooManyPendingRequests`, `IdempotencyKeyMismatch`, `RateLimited`, `Busy` | One subclass per error code in api.md | done |
| `error_response(request, status, code, message, retry_after)` | Build the error envelope response with the request id | done |
| `install_error_handlers(app)` | Register handlers that render DomainError as the envelope and validation errors as 400 `validation_error` | done |

### backend/app/core/security.py
Password hashing and JWT session tokens (cookie `crewline_session`).
| Name | Purpose | Status |
|---|---|---|
| `hash_password(plain)` | Hash a password with argon2id in a threadpool | done |
| `verify_password(hashed, plain)` | Check a password in a threadpool; a missing hash still costs one verify | done |
| `issue_token(user_id)` | Create a signed JWT with sub, iat and exp | done |
| `decode_token(token)` | Verify a JWT and return the user id, or None if invalid or expired | done |
| `set_session_cookie(response, token)` | Set the httpOnly session cookie | done |
| `clear_session_cookie(response)` | Remove the session cookie | done |

### backend/app/core/formguard.py
Bot checks for signup and login: a signed form token with a minimum fill time, plus a honeypot field (ADR-037).
| Name | Purpose | Status |
|---|---|---|
| `AUDIENCE`, `MIN_FILL_MS`, `TOKEN_TTL_S` | Token audience `crewline-form`, 2000 ms minimum fill time, 2 h lifetime | done |
| `issue_form_token()` | Return a signed token that records when the form was rendered | done |
| `check_form(token, honeypot)` | Raise BotCheckFailed for a filled honeypot, a bad or expired token, or a submit under 2 s after render | done |

### backend/app/core/headers.py
Security headers on every response and cache rules for the built web app (pure ASGI, safe for streaming).
| Name | Purpose | Status |
|---|---|---|
| `CSP`, `SECURITY_HEADERS` | Content-Security-Policy (self only, scripts never inline, inline styles allowed for dialog scroll locking), HSTS, nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy | done |
| `cache_control(path, headers)` | Return `no-cache` for HTML, `immutable` for hashed `/assets/`, nothing for `/api/` | done |
| `SecurityHeadersMiddleware` | Add the security headers to every HTTP response and cache rules to web app files | done |

### backend/app/core/deps.py
FastAPI dependencies shared by routers.
| Name | Purpose | Status |
|---|---|---|
| `current_user_id(request)` | Return the user id from the session cookie or raise 401 | done |
| `idempotency_key(key)` | Validate and return the Idempotency-Key header or raise 400 | done |
| `client_ip(request)` | Client IP for per-IP rate limits: the `CLIENT_IP_HEADER` edge header if present, else the socket peer; never `X-Forwarded-For` (B-33) | done |
| `write_context(request, user_id, key, route, params, body)` | Apply the per-user mutation limit and build the WriteContext for one write | done |

### backend/app/core/idempotency.py
Idempotency key hashing, lookup, claim and store.
| Name | Purpose | Status |
|---|---|---|
| `request_hash(method, route, params, body)` | Return sha256 of the canonical request | done |
| `lookup(conn, user_id, key)` | Return the stored row for a key, or None | done |
| `claim(conn, user_id, key, req_hash)` | Insert the key row; return False if it already exists (waits for an in-flight owner) | done |
| `store(conn, user_id, key, status, body)` | Save the success response on the claimed row | done |
| `purge_expired(pool, ttl_hours)` | Delete keys older than the TTL; return the number deleted | done |
| `purge_loop(pool, ttl_hours)` | Run purge_expired every hour | done |

### backend/app/core/invite_codes.py
Invite code generation and normalization (10 Crockford base32 characters, about 50 bits).
| Name | Purpose | Status |
|---|---|---|
| `ALPHABET`, `LENGTH` | Crockford base32 alphabet and code length | done |
| `generate_code()` | Return 10 random Crockford base32 characters | done |
| `normalize_code(raw)` | Uppercase, strip dashes and spaces, map O/I/L; return None if malformed | done |
| `format_code(code)` | Return the code as XXXXX-XXXXX for display | done |

### backend/app/core/timezones.py
IANA time zone validation and current offsets (zones and offsets cached, bug B-21).
| Name | Purpose | Status |
|---|---|---|
| `_known()` | Return the set of known IANA zone names | done |
| `validate_timezone(name)` | Return the name if it is a known IANA zone, else raise ValueError (rendered as 400) | done |
| `_zone(name)` | Return a ZoneInfo kept for the process lifetime | done |
| `current_offset_hours(name, at)` | Return the UTC offset in hours of a zone at an instant (cached per zone and instant) | done |

### backend/app/core/ratelimit.py
In-process sliding-window rate limiter (per worker; abuse protection, not correctness).
| Name | Purpose | Status |
|---|---|---|
| `SlidingWindowLimiter(limit, window_s)` | Count events per key within a time window | done |
| `SlidingWindowLimiter._trim(key, now)` | Drop events older than the window and return the remaining ones | done |
| `SlidingWindowLimiter.check(key)` | Return seconds to wait without recording, 0 if under the limit | done |
| `SlidingWindowLimiter.hit(key)` | Record an event; return seconds to wait if over the limit, else 0 | done |
| `Limiters` | Configured limiter instances (code per user, code per IP, login, signup, mutations) | done |
| `configure(settings)` | Create the limiters from settings | done |
| `get()` | Return the configured limiters | done |

### backend/app/core/cache.py
Micro-cache with single-flight loading for board pages (per worker; never a source of truth).
| Name | Purpose | Status |
|---|---|---|
| `MicroCache(ttl_ms)` | Hold (etag, bytes) per key for a short TTL; concurrent misses for one key share one load | done |
| `MicroCache.get_or_load(key, loader)` | Return a cached entry or run one loader for all concurrent callers of the same key | done |
| `MicroCache.invalidate_hackathon(hackathon_id)` | Drop every entry for one hackathon | done |
| `board_cache` | The process-wide board cache instance | done |
| `configure(ttl_ms)` | Replace the board cache with one using the configured TTL | done |

### backend/app/core/events.py
SSE hub: subscriptions per hackathon, public projection of audit notifications, fan-out.
| Name | Purpose | Status |
|---|---|---|
| `TEAM_ACTIONS`, `PEOPLE_ACTIONS`, `REQUEST_ACTIONS` | Audit actions per event kind | done |
| `public_projection(raw)` | Return (kind, data, audience) for a notification; no codes or emails; None if unknown | done |
| `Subscriber` | One SSE stream: hackathon, user and bounded queue | done |
| `EventHub` | Map hackathon id to subscriber queues and fan events out | done |
| `EventHub.connections` | Number of open streams in this worker | done |
| `EventHub.subscribe(hackathon_id, user_id)` | Register a queue; raise RateLimited past the per-user stream cap | done |
| `EventHub.unsubscribe(sub)` | Remove a subscriber (idempotent) | done |
| `EventHub._offer(sub, event)` | Queue an event; a full queue closes the slow client so it reconnects and refetches | done |
| `EventHub.publish(raw)` | Push to the hackathon's subscribers, or only to the audience for request events | done |
| `EventHub.broadcast_resync()` | Send a resync event to every subscriber | done |
| `hub`, `configure(max_streams_per_user)` | Process-wide hub and its setup | done |

### backend/app/core/metrics.py
Prometheus metrics: request durations per route plus pool, transaction, cache and SSE gauges read at scrape.
| Name | Purpose | Status |
|---|---|---|
| `registry`, `REQUEST_DURATION`, `POOL_SIZE`, `POOL_IDLE`, `TX_EVENTS`, `CACHE`, `SSE_CONNECTIONS`, `SSE_DROPPED`, `LISTENER_RECONNECTS`, `CLIENT_IP_SOURCE` | Metric objects (`CLIENT_IP_SOURCE` counts header vs peer client IPs, B-33) | done |
| `observe_request(method, route, status, seconds)` | Record one request duration (status grouped as 2xx, 4xx, 5xx) and keep it for percentiles | done |
| `RECENT_LIMIT` | Durations kept per route for exact percentiles (1,000) | done |
| `percentile(sorted_ms, fraction)` | Return the nearest-rank percentile of sorted values | done |
| `latency_summary()` | Return count, p50, p95, p99 and max in ms per route over its last requests, busiest first | done |
| `collect(pools, tx_stats, cache, hub, listener)` | Update the gauges from live objects right before a scrape | done |
| `render()` | Return the Prometheus text exposition and its content type | done |

### backend/app/core/logging.py
JSON logging setup.
| Name | Purpose | Status |
|---|---|---|
| `JsonFormatter` | Format log records as one JSON line | done |
| `JsonFormatter.format(record)` | Return the record as a JSON string with extra fields included | done |
| `configure_logging(level)` | Install the JSON formatter on the root logger | done |

### backend/app/core/middleware.py
Request id, access log and request-duration metrics middleware (pure ASGI, safe for streaming). The write in-flight cap lives in `db/tx.py`.
| Name | Purpose | Status |
|---|---|---|
| `RequestIdMiddleware` | Accept or create X-Request-ID, log one line per request, observe the route duration histogram | done |

### backend/app/core/responses.py
JSON response rendered with orjson (FastAPI deprecated its ORJSONResponse).
| Name | Purpose | Status |
|---|---|---|
| `JsonResponse` | Render content with orjson; default response class of the app | done |
| `JsonResponse.render(content)` | Return the JSON bytes for content | done |

### backend/app/core/skills.py
Fixed skill taxonomy and core roles.
| Name | Purpose | Status |
|---|---|---|
| `Skill` | Literal type of the 12 skills, used in pydantic models | done |
| `SKILLS` | Tuple of the 12 allowed skills | done |
| `CORE_ROLES` | Tuple of roles a balanced team wants | done |

## API database layer

### backend/app/db/pools.py
Read and write asyncpg pools (opened fully at startup, idle connections never reaped).
| Name | Purpose | Status |
|---|---|---|
| `init_connection(conn)` | Register orjson codecs for json/jsonb and decode uuid to the standard uuid.UUID | done |
| `Pools` | Holds the read and write pools and the acquire timeout | done |
| `create_pools(settings)` | Open both pools fully at startup with their server settings and application names (`crewline-read`, `crewline-write`) | done |
| `close_pools()` | Close both pools | done |
| `pools()` | Return the open pools | done |
| `read_conn()` | Acquire a read connection with the acquire timeout; 503 busy on timeout | done |
| `write_conn()` | Acquire a write connection with the acquire timeout; 503 busy on timeout | done |

### backend/app/db/tx.py
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

### backend/app/db/errors.py
Map PostgreSQL errors to domain errors by constraint name and SQLSTATE.
| Name | Purpose | Status |
|---|---|---|
| `CONSTRAINT_ERRORS` | Constraint name to DomainError class | done |
| `constraint_of(exc)` | Return the constraint name carried by an integrity error, if any | done |
| `to_domain_error(exc)` | Convert an asyncpg integrity error to a DomainError, or return None | done |
| `is_retryable(exc)` | True for 40P01 and 40001 | done |
| `is_busy(exc)` | True for lock timeouts, statement timeouts and connection exhaustion | done |

### backend/app/db/trace.py
Statement tracing for the Race lab: records each SQL statement a traced call runs, in order, with its time.
| Name | Purpose | Status |
|---|---|---|
| `Step`, `Trace` | One executed statement (end time, pool, SQL, duration, error); the statements of one traced call | done |
| `tracing()` | Record every statement run by connections acquired inside this block (same asyncio task only) | done |
| `attach(conn, pool)` | Add a query logger to a connection when a trace is active; return it | done |
| `detach(conn, logger)` | Remove a query logger added by attach | done |

### backend/app/db/listener.py
Dedicated LISTEN connection with reconnect; clears the board cache and feeds the event hub.
| Name | Purpose | Status |
|---|---|---|
| `EventListener(url)` | Owns the LISTEN connection and a supervisor task | done |
| `EventListener.start()` | Connect, LISTEN, and start the supervisor | done |
| `EventListener.stop()` | Stop the supervisor and close the connection | done |
| `EventListener._connect()` | Open the connection (`crewline-listen`) and LISTEN on team_events | done |
| `EventListener._on_notify(conn, pid, channel, payload)` | Clear the hackathon's board cache, then publish to the hub | done |
| `EventListener._supervise()` | Detect a closed connection every 0.5 s, reconnect with backoff, broadcast resync; keepalive every 30 s | done |

## API modules

### backend/app/modules/auth/router.py
Auth and profile endpoints.
| Name | Purpose | Status |
|---|---|---|
| `form_token()` | GET /api/auth/form-token (no-store) | done |
| `signup(body, response, ip)` | POST /api/auth/signup | done |
| `login(body, response, ip)` | POST /api/auth/login | done |
| `logout(response)` | POST /api/auth/logout | done |
| `me(user_id)` | GET /api/auth/me | done |
| `update_me(body, request, user_id, key)` | PATCH /api/users/me | done |

### backend/app/modules/auth/schemas.py
Auth request and response models.
| Name | Purpose | Status |
|---|---|---|
| `_unique_skills(skills)` | Return the skills without duplicates, keeping order | done |
| `SignupIn`, `LoginIn`, `UpdateMeIn`, `UserOut` | Validated models with limits from api.md (extra fields rejected); signup and login carry `form_token` and the honeypot `company` | done |

### backend/app/modules/auth/service.py
Signup, login and profile rules.
| Name | Purpose | Status |
|---|---|---|
| `_user(row)` | Return the public user fields of a row | done |
| `signup(data, ip)` | Check the form, rate-limit, hash the password, create the user | done |
| `login(data, ip)` | Check the form, rate-limit, verify the password, return the user | done |
| `me(user_id)` | Return the signed-in user, or 401 if the account no longer exists | done |
| `update_profile(ctx, data)` | Update name, skills and time zone; bump the user's team versions; audit and publish | done |

### backend/app/modules/auth/repo.py
User SQL.
| Name | Purpose | Status |
|---|---|---|
| `insert_user(conn, email, password_hash, display_name, skills, timezone)` | Insert a user; 23505 on users_email_unique means the email is taken | done |
| `get_by_email(conn, email)` | Return the user and password hash for an email | done |
| `get_by_id(conn, user_id)` | Return a user | done |
| `bump_member_teams(conn, user_id)` | Lock the user's teams in id order, increment their version, return team and hackathon ids | done |
| `update_profile(conn, user_id, fields)` | Update profile columns and return the user | done |
| `participations(conn, user_id)` | Return the hackathon ids the user is registered in | done |

### backend/app/modules/hackathons/router.py
Hackathon endpoints and the meta endpoint.
| Name | Purpose | Status |
|---|---|---|
| `meta()` | GET /api/meta: skill taxonomy and core roles | done |
| `list_hackathons(user_id)` | GET /api/hackathons | done |
| `get_hackathon(hid, user_id)` | GET /api/hackathons/{hid} | done |
| `register(hid, request, user_id, key)` | POST /api/hackathons/{hid}/register | done |
| `my_status(hid, user_id)` | GET /api/hackathons/{hid}/me | done |
| `set_looking(hid, body, request, user_id, key)` | PATCH /api/hackathons/{hid}/me | done |

### backend/app/modules/hackathons/schemas.py
Hackathon request and response models.
| Name | Purpose | Status |
|---|---|---|
| `SetLookingIn` | Body for PATCH /api/hackathons/{hid}/me | done |

### backend/app/modules/hackathons/service.py
Participant registration and status.
| Name | Purpose | Status |
|---|---|---|
| `list_hackathons()` | Return all hackathons | done |
| `get_hackathon(hid)` | Return one hackathon or raise 404 | done |
| `my_status(hid, user_id)` | Return registration, looking flag, team and pending requests | done |
| `register(ctx, hid)` | Insert the participant row if missing; audit participant_registered when inserted | done |
| `set_looking(ctx, hid, looking)` | Update the looking flag; audit participant_updated when it changed | done |

### backend/app/modules/hackathons/repo.py
Hackathon and participant SQL.
| Name | Purpose | Status |
|---|---|---|
| `list_all(conn)` | Return all real hackathons (the hidden Race lab one excluded), newest first | done |
| `get(conn, hid)` | Return one hackathon | done |
| `insert_participant(conn, hid, user_id)` | Insert participant ON CONFLICT DO NOTHING; return the row if inserted | done |
| `get_participant(conn, hid, user_id)` | Return the participant row | done |
| `set_looking(conn, hid, user_id, looking)` | Update the looking flag if it differs; return the row or None | done |
| `my_team(conn, hid, user_id)` | Return the snapshot of the caller's team in a hackathon, or None | done |
| `my_requests(conn, hid, user_id)` | Return the caller's join requests in a hackathon, newest first | done |

### backend/app/modules/teams/router.py
Team endpoints, including the team audit log.
| Name | Purpose | Status |
|---|---|---|
| `_respond(outcome)` | Render a write outcome | done |
| `create_team(hid, body, ...)` | POST /api/hackathons/{hid}/teams | done |
| `join_by_code(body, ...)` | POST /api/teams/join | done |
| `get_team(tid)` | GET /api/teams/{tid} | done |
| `update_team(tid, body, ...)` | PATCH /api/teams/{tid} | done |
| `leave(tid, ...)` | POST /api/teams/{tid}/leave | done |
| `remove_member(tid, uid, ...)` | DELETE /api/teams/{tid}/members/{uid} | done |
| `finalize(tid, ...)` | POST /api/teams/{tid}/finalize | done |
| `reopen(tid, ...)` | POST /api/teams/{tid}/reopen | done |
| `get_invite(tid, user_id)` | GET /api/teams/{tid}/invite | done |
| `regenerate_invite(tid, ...)` | POST /api/teams/{tid}/invite/regenerate | done |
| `team_audit(tid, user_id, limit, cursor)` | GET /api/teams/{tid}/audit for members | done |

### backend/app/modules/teams/schemas.py
Team request models (responses are the `team_snapshot` shape plus `members`).
| Name | Purpose | Status |
|---|---|---|
| `CreateTeamIn` | Body for POST /api/hackathons/{hid}/teams | done |
| `UpdateTeamIn` | Body for PATCH /api/teams/{tid}; at least one field | done |
| `JoinIn` | Body for POST /api/teams/join | done |

### backend/app/modules/teams/service.py
Team rules and transactions (architecture.md 6.1, 6.2, 6.7 to 6.10).
| Name | Purpose | Status |
|---|---|---|
| `_reraise_constraint(exc)` | Raise StateChanged for an invite code collision, the mapped DomainError, or the original error | done |
| `_explain_leader_failure(tid, user_id)` | Raise 404 or 403 after a 0-row leader update; return the team state for further checks | done |
| `get_team(tid)` | Return team detail or raise 404 | done |
| `get_invite(tid, user_id)` | Return the invite code to a member | done |
| `create_team(ctx, hid, name)` | Create a team with the caller as leader | done |
| `_record_failed_code(user_id, ip)` | Count a failed invite code attempt against the user and IP limits | done |
| `join_by_code(ctx, raw_code, ip)` | Normalize the code, check rate limits, then in one transaction take a seat and add the membership | done |
| `_explain_join(code, user_id, ip)` | After a rolled-back join: 200 already member, 404, 409 finalized / full / already_in_team / not_registered, or StateChanged | done |
| `_shrink(conn, ctx, team, leaver_id, action)` | Decrement a team after a member left or was removed; audit leader promotion and reopening | done |
| `leave(ctx, tid)` | Remove the caller; promote a new leader or delete the team (tombstone version) | done |
| `remove_member(ctx, tid, target)` | Leader removes a member | done |
| `finalize(ctx, tid)` | Leader finalizes a team that meets min size | done |
| `reopen(ctx, tid)` | Leader reopens a finalized team | done |
| `regenerate_invite(ctx, tid)` | Leader replaces the invite code; the old code stops working immediately | done |
| `update_team(ctx, tid, name, looking)` | Leader changes name or looking flag | done |
| `team_audit(tid, user_id, before_seq, limit)` | Return a page of the team's audit events to a member | done |

### backend/app/modules/teams/repo.py
Team and membership SQL.
| Name | Purpose | Status |
|---|---|---|
| `insert_team(conn, hid, name, leader_id, code)` | Insert a team copying sizes and invite TTL from the hackathon; None if the hackathon does not exist | done |
| `insert_membership(conn, tid, hid, user_id)` | Insert a membership row (unique per hackathon and user) | done |
| `take_seat_by_code(conn, code)` | Conditional seat UPDATE by invite code; return id, hackathon, count, version or None | done |
| `take_seat_as_leader(conn, tid, leader_id)` | Conditional seat UPDATE for an accept by the leader | done |
| `lock_team(conn, tid)` | SELECT ... FOR UPDATE on the team row (paths that may delete the team) | done |
| `lock_team_shared(conn, tid)` | SELECT ... FOR SHARE on the team row | done |
| `delete_membership(conn, tid, user_id)` | Delete one membership; return True if a row was deleted | done |
| `shrink_team(conn, tid, leaver_id)` | Decrement count, reopen, promote the earliest member if the leader left; return the new state | done |
| `delete_team(conn, tid)` | Delete the team row (requests cascade) and return its last version | done |
| `set_status(conn, tid, leader_id, from_status, to_status)` | Conditional status change by the leader (finalizing needs member_count >= min_size); return the new state | done |
| `set_invite(conn, tid, leader_id, code)` | Replace the invite code and expiry by the leader | done |
| `update_fields(conn, tid, leader_id, name, looking)` | Update name or looking by the leader | done |
| `find_by_code(conn, code)` | Return the team for an invite code with an `active` flag for expiry | done |
| `get_state(conn, tid)` | Return id, hackathon, leader, counts, sizes and status for error explanation | done |
| `get_membership(conn, hid, user_id)` | Return the caller's team id in a hackathon, or None | done |
| `is_member(conn, tid, user_id)` | True if the user is a member of the team | done |
| `is_registered(conn, hid, user_id)` | True if the user is a participant of the hackathon | done |
| `get_invite(conn, tid)` | Return the invite code and expiry of a team | done |
| `get_detail(conn, tid)` | Return the team snapshot with its members in join order, or None | done |

### backend/app/modules/requests/router.py
Join request endpoints.
| Name | Purpose | Status |
|---|---|---|
| `_respond(outcome)` | Render a write outcome | done |
| `create_request(tid, body, ...)` | POST /api/teams/{tid}/requests | done |
| `list_for_team(tid, user_id)` | GET /api/teams/{tid}/requests (leader only) | done |
| `list_mine(hid, user_id)` | GET /api/hackathons/{hid}/my-requests | done |
| `accept(rid, ...)` | POST /api/requests/{rid}/accept | done |
| `decline(rid, ...)` | POST /api/requests/{rid}/decline | done |
| `withdraw(rid, ...)` | POST /api/requests/{rid}/withdraw | done |

### backend/app/modules/requests/schemas.py
Join request models (responses use the `REQUEST_SELECT` shape from repo.py).
| Name | Purpose | Status |
|---|---|---|
| `CreateRequestIn` | Body for POST /api/teams/{tid}/requests | done |

### backend/app/modules/requests/service.py
Join request rules and transactions (architecture.md 6.3 to 6.6).
| Name | Purpose | Status |
|---|---|---|
| `MAX_PENDING` | Pending requests allowed per user per hackathon (5) | done |
| `_request_body(conn, rid)` | Return a request in the API shape; StateChanged (retry) if it vanished inside the transaction | done |
| `create_request(ctx, tid, message)` | Lock the team (forming, not full) and the participant row (cap 5), then create a pending request | done |
| `accept(ctx, rid)` | Leader accepts: seat, request transition, membership; a requester already in a team makes it stale | done |
| `_explain_accept(tid, user_id)` | After a 0-row seat update on accept: 404, 403, 409 finalized or full, or StateChanged | done |
| `_mark_stale(rid, actor_id, request_tag)` | Follow-up transaction that marks a request stale and audits it (no idempotency claim) | done |
| `decline(ctx, rid)` | Leader declines a pending request | done |
| `withdraw(ctx, rid)` | Requester withdraws a pending request | done |
| `list_for_team(tid, user_id)` | Pending requests for the leader, hiding users already in a team | done |
| `list_mine(hid, user_id)` | The caller's requests in a hackathon, newest first (uses hackathons.repo.my_requests) | done |

### backend/app/modules/requests/repo.py
Join request SQL.
| Name | Purpose | Status |
|---|---|---|
| `REQUEST_SELECT` | Shared SELECT for the request API shape (with team name and display name) | done |
| `lock_participant(conn, hid, user_id)` | SELECT ... FOR NO KEY UPDATE on the participant row; False if not registered | done |
| `count_pending_for_user(conn, hid, user_id)` | Count the caller's pending requests in a hackathon | done |
| `insert_request(conn, tid, hid, user_id, message)` | Insert a pending request; return its id, or None if one is already pending for this team | done |
| `get_pending(conn, tid, user_id)` | Return the caller's pending request for a team, or None | done |
| `get_request(conn, rid)` | Return one request in the API shape, or None | done |
| `get_ids(conn, rid)` | Return the team, hackathon and requester ids of a request | done |
| `transition(conn, rid, tid, from_status, to_status, actor_id)` | Conditional status change; return the requester id or None | done |
| `withdraw(conn, rid, user_id)` | Conditional withdraw by the requester; return the team and hackathon ids, or None | done |
| `mark_stale(conn, rid, actor_id)` | Mark a pending request stale; return its team, hackathon and requester ids, or None | done |
| `list_pending_for_team(conn, tid)` | Pending requests for a team, oldest first, hiding users already in a team | done |

### backend/app/modules/board/router.py
Board endpoints with ETag and 304 support.
| Name | Purpose | Status |
|---|---|---|
| `_cached(etag, body, if_none_match)` | Return 304 when the client already has this ETag, else the cached bytes | done |
| `teams_board(hid, user_id, limit, cursor, if_none_match)` | GET /api/hackathons/{hid}/board/teams | done |
| `people_board(hid, user_id, limit, cursor, if_none_match)` | GET /api/hackathons/{hid}/board/people | done |

### backend/app/modules/board/service.py
Board pages through the micro-cache, rendered once to bytes.
| Name | Purpose | Status |
|---|---|---|
| `_page(items, limit, next_key)` | Serialize a board page with its next cursor | done |
| `teams_page(hid, limit, cursor)` | Return (etag, bytes) for a teams board page | done |
| `people_page(hid, limit, cursor)` | Return (etag, bytes) for a people board page | done |

### backend/app/modules/board/repo.py
Board SQL: keyset pages served by the teams_board and participants_board partial indexes.
| Name | Purpose | Status |
|---|---|---|
| `teams_page(conn, hid, after, limit)` | Keyset page of open teams as snapshots, newest first; fetches limit + 1 rows | done |
| `people_page(conn, hid, after, limit)` | Keyset page of looking participants without a team, newest first; fetches limit + 1 rows | done |
| `hackathon_exists(conn, hid)` | True if the hackathon exists | done |

### backend/app/modules/board/cursor.py
Opaque keyset cursors: base64url of '<iso timestamp>|<uuid>'.
| Name | Purpose | Status |
|---|---|---|
| `encode_cursor(ts, row_id)` | Return a base64url cursor for a (timestamp, id) position | done |
| `decode_cursor(cursor)` | Return (timestamp, id) from a cursor or raise validation_error | done |

### backend/app/modules/suggestions/router.py
Suggestions endpoint.
| Name | Purpose | Status |
|---|---|---|
| `suggestions(hid, user_id, limit)` | GET /api/hackathons/{hid}/suggestions | done |

### backend/app/modules/suggestions/service.py
Build the caller's group, fetch candidates, rank them.
| Name | Purpose | Status |
|---|---|---|
| `suggest(hid, user_id, limit)` | Return the context (team id, missing roles) and ranked candidates for the caller | done |

### backend/app/modules/suggestions/repo.py
Suggestions SQL.
| Name | Purpose | Status |
|---|---|---|
| `MAX_CANDIDATES` | Candidate rows fetched before scoring (500) | done |
| `is_registered(conn, hid, user_id)` | True if the user is a participant of the hackathon | done |
| `group_members(conn, hid, user_id)` | Return the caller's team id and its members' (id, skills, timezone); the caller alone when teamless | done |
| `candidates(conn, hid, exclude_ids, missing)` | Looking participants without a team, ordered by missing-skill overlap then recency (max 500) | done |

### backend/app/modules/suggestions/scoring.py
Pure scoring functions for teammate suggestions (formula in architecture.md section 11).
| Name | Purpose | Status |
|---|---|---|
| `WORK_HOURS`, `WEIGHTS` | Working window (9 h) and score weights | done |
| `Group` | The caller's team, or the caller alone: union of skills and each member's time zone | done |
| `circular_hours(a_hours, b_hours)` | Hour distance between two UTC offsets on a 24 h circle | done |
| `overlap_hours(group_zones, cand_zone, at)` | Worst-case shared working hours with any group member at an instant | done |
| `tz_overlap(group_zones, cand_zone, at)` | Worst-case working-window overlap with the group at an instant, 0 to 1 | done |
| `missing_roles(team_skills)` | Core roles the group does not cover yet, in taxonomy order | done |
| `complement(team_skills, cand_skills)` | Share of missing core roles the candidate covers; half credit for new skills when none are missing | done |
| `redundancy(team_skills, cand_skills)` | Share of candidate skills the group already has | done |
| `completeness(cand_skills)` | Profile completeness, 0 to 1 | done |
| `score_candidate(group, cand, at)` | Weighted score, breakdown and plain-language reasons for one candidate | done |
| `rank(group, cands, at, limit)` | Sort by score, time zone overlap, user id and cut to limit | done |

### backend/app/modules/audit/repo.py
Audit SQL.
| Name | Purpose | Status |
|---|---|---|
| `REQUEST_ACTIONS` | Actions whose events go only to their audience | done |
| `record(conn, hid, tid, actor_id, action, payload, request_id)` | Insert an audit event; add the team snapshot, and the audience for request actions, in the same statement | done |
| `list_for_team(conn, tid, before_seq, limit)` | Keyset page of a team's audit events, newest first | done |

### backend/app/modules/audit/router.py
Removed: the team audit endpoint lives in `teams/router.py` (`team_audit`) because it needs the team membership check.
| Name | Purpose | Status |
|---|---|---|

### backend/app/modules/events/router.py
SSE endpoint: one stream per browser tab, events for one hackathon.
| Name | Purpose | Status |
|---|---|---|
| `stream(hackathon_id, user_id)` | GET /api/events: check the hackathon, subscribe, yield events with heartbeats; no database connection held | done |

### backend/app/modules/lab/repo.py
Race lab SQL: the hidden lab hackathon, synthetic participants, and the facts read back after an experiment.
| Name | Purpose | Status |
|---|---|---|
| `ensure_lab_hackathon(conn)` | Return the lab hackathon id, creating it once | done |
| `create_participants(conn, hackathon_id, count, label)` | Insert synthetic users that cannot log in and register them | done |
| `team_facts(conn, team_id)` | Read member_count, max_size, membership rows and join audit events of a team | done |
| `user_facts(conn, hackathon_id, team_id, user_id)` | Read one user's memberships, join events and stored keys | done |

### backend/app/modules/lab/schemas.py
Race lab request models.
| Name | Purpose | Status |
|---|---|---|
| `RaceIn`, `SpamIn`, `QueueIn` | Attempts, clicks or requests to fire (cap checked against settings) | done |

### backend/app/modules/lab/service.py
Race lab experiments: real concurrent writes through run_write in the hidden lab hackathon, and their results.
| Name | Purpose | Status |
|---|---|---|
| `context(user_id, route, body, key)` | Build the WriteContext a real request would carry | done |
| `since(t0)` | Milliseconds since t0 | done |
| `call(run, t0)` | Run one write like the web client (retry 503 with the same key); report status, code, timing | done |
| `guarded(user_id, size, experiment)` | Check the lab is on, the size cap and the rate limits; one experiment at a time per worker | done |
| `lab_hackathon()`, `new_people(hid, count, label)`, `make_team(hid, filled)`, `facts(team_id)` | Lab setup through the real services and read-back | done |
| `join_call`, `request_call`, `accept_call` | Calls that join by code, request to join, or accept, for `fire_together` | done |
| `fire_together(calls)` | Start every call at the same moment behind one asyncio event | done |
| `run_race(attempts)`, `run_spam(clicks)`, `run_queue(requests)` | The three experiments | done |

### backend/app/modules/lab/explain.py
Race lab walkthrough: trace the SQL of one real join (success, retry, full team) and report measured latency.
| Name | Purpose | Status |
|---|---|---|
| `STEP_NOTES`, `describe(sql)` | Label and guarantee for each statement on the join path | done |
| `traced_join(user_id, code, key)` | Run one real join with statement tracing | done |
| `run_walkthrough()` | Trace a free seat, the same click retried, and a full team | done |
| `latency()` | Latency per route, pool state and transaction counters | done |

### backend/app/modules/lab/router.py
Race lab endpoints.
| Name | Purpose | Status |
|---|---|---|
| `info`, `race`, `spam`, `queue`, `walkthrough`, `latency` | GET /api/lab, POST race, spam, queue, walkthrough, GET latency | done |

## Tests

### backend/tests/conftest.py
Fixtures for the test database, a real API server and per-test cleanup.
| Name | Purpose | Status |
|---|---|---|
| `admin_url()` | Return a server URL from TEST_DATABASE_URL, or start the local test instance | done |
| `server_url` | The PostgreSQL server URL used by the test session | done |
| `db_url` | Create a fresh test database with all migrations applied | done |
| `fake_web_build(root)` | Write a minimal built web app (index.html and one hashed asset) so SPA serving is tested without npm | done |
| `server` | Run one real API server for the whole session (serving a small fake web build) and return its base URL | done |
| `users` | Factory for signed-up users; closes their clients after the test | done |
| `truncate(db_url)` | Remove all rows from every application table | done |
| `clean_db` | Empty the database before a test and assert the invariants after it | done |

### backend/tests/serverctl.py
Start and stop real API servers and create databases for tests.
| Name | Purpose | Status |
|---|---|---|
| `database_url(server_url, name)` | Return a server URL pointed at another database | done |
| `create_database(server_url, name)` | Drop and recreate a database, apply all migrations, and return its URL | done |
| `free_port()` | Return a free local TCP port | done |
| `start_server(db_url, log_path, extra_env)` | Start uvicorn as a subprocess and wait until /readyz answers | done |
| `stop_server(proc)` | Stop a server subprocess | done |

### backend/tests/api/conftest.py
| Name | Purpose | Status |
|---|---|---|
| `_clean` | Apply clean_db to every API test | done |

### backend/tests/helpers.py
Test helpers: users with their own HTTP client, hackathons, teams, keys and raw queries.
| Name | Purpose | Status |
|---|---|---|
| `TEST_JWT_SECRET`, `SERVER_ENV` | Settings for the test server (large pools, relaxed signup/login/mutation/per-IP code and lab limits) | done |
| `SHARED_TLS` | One TLS context for every test client (bug B-19) | done |
| `key()` | Return a fresh idempotency key | done |
| `User` | A signed-up user with an authenticated client; `get`, `send`, `post`, `patch`, `delete` | done |
| `Users` | Factory: `new` signs up (optionally registers), `bulk` inserts registered users with minted cookies, `close` | done |
| `form_fields(age_s)` | Return signup/login bot-check fields: a form token rendered age_s ago and an empty honeypot | done |
| `session_token(user_id)` | Mint a session JWT for a user with the test secret | done |
| `create_team(user, hid, name)` | Create a team as the user and return (team id, invite code) | done |
| `join(user, code)` | Join a team by invite code | done |
| `make_hackathon(db_url, min_size, max_size, ttl, name)` | Insert a hackathon and return its id | done |
| `query(db_url, sql, *args)` | Run a raw query (json and jsonb decoded like the app) and return its rows | done |

### backend/tests/sse.py
Test helper: read a server-sent event stream in the background and wait for events by kind.
| Name | Purpose | Status |
|---|---|---|
| `SseReader(client, url)` | Collect (event, data) pairs from one SSE stream; use `async with` | done |
| `SseReader.next(kind, within)` | Return the next event of a kind, skipping others; TimeoutError if none | done |
| `SseReader.nothing(kind, seconds)` | True if no event of this kind arrives in time | done |

### frontend/README.md
How to run, test and build the web app.
| Name | Purpose | Status |
|---|---|---|

### backend/tests/concurrency/barrier.py
Helpers to release many requests at the same instant and retry 503s with the same key.
| Name | Purpose | Status |
|---|---|---|
| `fire_together(calls)` | Await all calls behind one asyncio.Event barrier so they start together | done |
| `retry_busy(send, attempts)` | Repeat a call until it is not 503 (the caller keeps the same idempotency key) | done |
| `keyed(user, method, path, body, idem)` | Return a call that sends one logical request, retrying 503 with one fixed key | done |
| `warm(users)` | Open each user's HTTP connection before a race | done |
| `close(users)` | Close the clients of users that are no longer needed | done |

### backend/tests/concurrency/naive.py
Test-only check-then-insert join used as the negative control. Never imported by the app.
| Name | Purpose | Status |
|---|---|---|
| `weaken_schema(conn)` | Drop the capacity CHECK so only the application logic can prevent over-filling | done |
| `seed_team(conn, hid, members, max_size, racers)` | Insert a team with members and registered outsiders; return (team, code, racer ids) | done |
| `naive_join(pool, tid, hid, user_id, sleep_s)` | Read count, sleep, insert membership, increment without a predicate | done |

### backend/tests/concurrency/conftest.py
Concurrency test fixtures.
| Name | Purpose | Status |
|---|---|---|
| `_deadlocks(db_url)` | Return the deadlock counter of the test database | done |
| `_clean` | Apply clean_db to every concurrency test | done |
| `no_deadlocks` | T-RACE-15: the deadlock counter must not increase during the concurrency suite | done |

### backend/tests/concurrency/test_guarantees.py
Guarantee tests through dedicated servers (T-GUAR-01 to 04).
| Name | Purpose | Status |
|---|---|---|
| `FAULT_SQL` | Fault table and audit trigger that fails inserts for listed users | done |
| `tight_server` | Server with a 2-connection write pool, 0.2 s acquire timeout and in-flight cap 4 | done |
| `limited_server` | Server with small mutation, login and signup limits | done |
| `fault_db`, `fault_server` | Database with the fault trigger and a server on it | done |

## Scripts

### database/migrate.py
Apply SQL migrations in order (creates `schema_migrations`, holds an advisory lock).
| Name | Purpose | Status |
|---|---|---|
| `apply_migrations(url)` | Apply files not yet in schema_migrations; return the versions applied | done |
| `main()` | CLI entry point | done |

### database/dev_db.py
Local PostgreSQL 16 without Docker, using the pgserver package.
| Name | Purpose | Status |
|---|---|---|
| `data_dir(name)` | Return the data directory for a named dev database | done |
| `start(name)` | Start or reuse the server and return its connection URL | done |
| `stop(name)` | Stop the server with pg_ctl | done |
| `main()` | CLI entry point | done |

### database/seed.py
Bulk seed data with COPY and a k6 tokens file; every invariant holds on the result.
| Name | Purpose | Status |
|---|---|---|
| `ZONE` | Time zone of every seeded user (`Asia/Kolkata`) | done |
| `build(users, teams, max_size, min_size, rng)` | Build all rows in memory; team members are at most half the users | done |
| `seed(url, users, teams, max_size, min_size, password_hash, rng_seed)` | Insert one hackathon and all rows with COPY in a single transaction | done |
| `write_tokens(path, user_ids, hackathon_id, secret, count, team_codes)` | Write pre-minted session JWTs, the hackathon id and open team codes for k6 | done |
| `main()` | CLI entry point | done |

### backend/scripts/latency_probe.py
Latency probe: every endpoint uncontended plus the board under concurrent users; server-side numbers from the access log.
| Name | Purpose | Status |
|---|---|---|
| `percentiles(values)` | Format n, p50, p95, p99 and max of a list of milliseconds | done |
| `Probe` | Clients for seeded users and a per-route latency record | done |
| `Probe.client(token)` | Return a client authenticated with a seeded user's token | done |
| `Probe.call(client, label, method, path, body, mutate)` | Send one request and record its client latency | done |
| `Probe.every_endpoint(rounds)` | Exercise each endpoint sequentially with fresh users | done |
| `Probe.board_load(users, seconds)` | Concurrent clients loop on the teams board | done |
| `server_side(log_path, since)` | Read per-route server durations from the JSON access log | done |
| `run(args)`, `main()` | Run both phases and print the report; CLI entry point | done |

### database/invariants.py and database/invariants.sql
Invariant checker.
| Name | Purpose | Status |
|---|---|---|
| `load_checks()` | Return (id, description, query) for each invariant block | done |
| `run_checks(url)` | Run every invariant query and return violations keyed by invariant id | done |
| `main()` | Print violations and exit non-zero if any | done |

### backend/scripts/sse_listeners.py
Hold N event streams open during a load run (L-B) and report the events each one received.
| Name | Purpose | Status |
|---|---|---|
| `listen(base, token, hackathon_id, seconds)` | Read one stream; return its status, event counts by kind and whether it stayed open | done |
| `run(args, data)` | Open all streams at once, print a summary, exit 1 if any stream failed, dropped or got no team event | done |
| `main()` | CLI entry point; reads the tokens file | done |

### backend/scripts/chaos.py
Chaos test (T-CHAOS-01): hard-kill the API mid-workload, restart it, prove nothing is lost or duplicated.
| Name | Purpose | Status |
|---|---|---|
| `Action` | One logical client action with its fixed idempotency key and final response | done |
| `Api` | The API subprocess: `start` waits for /readyz, `kill` hard-kills with no shutdown hooks | done |
| `setup(server_url, users, teams)` | Create `crewline_chaos`: one hackathon, teams with 3 of 4 seats taken, free users | done |
| `perform(client, action, stats)` | Send an action until a final status, retrying network errors and 503 with the same key | done |
| `user_loop(base, user_id, codes, deadline, done, stats)` | Join a random team, leave again after a pause, repeat until the deadline | done |
| `replay_all(base, actions, user_of)` | Re-send every 200 action with its key; count responses that differ from the original bytes | done |
| `run_chaos(args)` | Run the workload with kills and restarts, then verify statuses, replays, capacity, keys and invariants | done |
| `main()` | CLI entry point; exit code 1 on any violation | done |

## Load tests

### loadtest/lib.js
Shared k6 helpers.
| Name | Purpose | Status |
|---|---|---|
| `loadData()` | Read the seeded tokens, hackathon id and open team codes | done |
| `BASE` | Base URL from `BASE_URL` | done |
| `params(token, route, mutate)` | Session cookie, route tag, and an Idempotency-Key for mutations | done |
| `busyRetries` | Counter of 503 busy answers retried with the same key | done |
| `postAction(url, body, token, route, attempts)` | POST one logical action; on 503 wait Retry-After plus jitter and resend with the same key | done |
| `idempotencyKey()` | A random 32-character hex key | done |

### loadtest/board.js
Scenario L-A1 and L-A2 (THINK=1).
| Name | Purpose | Status |
|---|---|---|
| `options` | Ramp to 100 VUs, thresholds p95 < 200 ms and errors < 0.1 % on route board_teams | done |
| `default()` | One board read: 70 % first page, 30 % follow the cursor | done |

### loadtest/mixed.js
Scenario L-B.
| Name | Purpose | Status |
|---|---|---|
| `options` | 100 board readers, a 50-user stampede every 5 s (12 rounds), churn at 2 creates per second; one `stampede_wins` threshold per stampede (`count==1`) | done |
| `setup()` | Create one team per stampede with 3 of 4 seats taken (leader plus two joins); return the invite codes | done |
| `boardReader()` | Board read, same mix as L-A without think time | done |
| `stampede(setupData)` | Iteration i: 50 fresh users join team i; after busy retries only 200 or 409, one 200 per team | done |
| `churn()` | Fresh users create teams at 2 per second (busy retries) | done |

### loadtest/soak.js
Scenario L-C.
| Name | Purpose | Status |
|---|---|---|
| `options`, `default()` | 10 minutes of 100 VUs with 1 s think time; p95 < 200 ms and p99 < 400 ms | done |

## Web

Tooling files: `frontend/package.json` (scripts: dev, build, typecheck, lint, test, e2e), `vite.config.ts` (build, `/api` dev proxy, Vitest settings, `publicUrlPlugin` that fills `%PUBLIC_URL%` in index.html from `CREWLINE_PUBLIC_URL`), `tsconfig*.json` (strict), `tailwind.config.ts` (theme from tokens; no `full` radius, so pill buttons cannot be built; `rounded-avatar` only for avatars and dots), `postcss.config.js`, `eslint.config.js` (typescript-eslint strict, react-hooks, jsx-a11y, no raw `fetch`, no em dash literals), `playwright.config.ts` (phone 360 px and laptop 1280 px projects), `index.html` (favicons, Open Graph and Twitter tags).

### frontend/public/
| File | Purpose | Status |
|---|---|---|
| `favicon.svg` | Two seat tabs in band colors and one open (dashed) seat, like the wordmark | done |
| `theme-init.js` | Apply the saved theme before first paint (external file, allowed by the CSP) | done |
| `favicon-32.png`, `apple-touch-icon.png`, `og-image.png` | Rendered by `scripts/make-images.mjs` (32 px, 180 px, 1200x630) | done |

### frontend/scripts/
| File | Purpose | Status |
|---|---|---|
| `contrast.mjs` | Print WCAG contrast ratios for every token pair; exit 1 if a pair is below its floor | done |
| `make-images.mjs` | Render the PNG favicons and the social preview image with Playwright (font embedded as a data URL) | done |

### frontend/src/main.tsx
Browser entry: mount the app.

### frontend/src/App.tsx
App root: query client with the session rule, live region, motion settings and the router.
| Name | Purpose | Status |
|---|---|---|
| `createQueryClient()` | Build the query client; any 401 refetches the session so the app shell sends the user to login | done |
| `App` | The whole app (query client, LazyMotion, MotionConfig reduced motion, live region, router, dev-only devtools) | done |

### frontend/src/routes.tsx
Route table: the single list of client routes, used by the app and by the link checker test.
| Name | Purpose | Status |
|---|---|---|
| `routes` | `/login`, `/signup`, `/privacy`, `/terms`, signed-in `/`, `/h/:hid`, `/h/:hid/teams/new`, `/h/:hid/join`, `/teams/:tid`, `/me`, `/lab`, and the `*` 404 | done |
| `isKnownRoute(path)` | True if a path is served by a real route (not the 404 catch-all) | done |

### frontend/src/api/client.ts
Fetch wrapper: same-origin credentials, Idempotency-Key on mutations, error envelope, retry of 503 and network errors.
| Name | Purpose | Status |
|---|---|---|
| `ApiError` | Error with the HTTP status, the API error code, request id and Retry-After | done |
| `newIdempotencyKey()` | Return a random key for one user action (32 hex characters) | done |
| `timing` | Waits used between retries; tests replace `sleep` | done |
| `retryDelay(attempt, retryAfter)` | Return the delay before a retry, honoring Retry-After in seconds, else 200, 400, 800 ms, plus jitter | done |
| `toApiError(response)` | Parse the error envelope into an ApiError | done |
| `request(method, path, body?, options?)` | Send one API request; retry network errors and 503 up to 3 times with the same Idempotency-Key | done |

### frontend/src/api/endpoints.ts
One typed function per endpoint in docs/api.md.
| Name | Purpose | Status |
|---|---|---|
| `meta`, `formToken`, `signup`, `login`, `logout`, `me`, `updateMe`, `listHackathons`, `getHackathon`, `register`, `myStatus`, `setLooking`, `teamsBoard`, `peopleBoard`, `createTeam`, `getTeam`, `updateTeam`, `joinByCode`, `leaveTeam`, `removeMember`, `finalizeTeam`, `reopenTeam`, `getInvite`, `regenerateInvite`, `teamAudit`, `createRequest`, `teamRequests`, `myRequests`, `acceptRequest`, `declineRequest`, `withdrawRequest`, `suggestions` | Typed endpoint calls (every `/api` route) | done |
| `eventsUrl(hid)` | URL of the event stream for one hackathon | done |

### frontend/src/api/types.ts
API payload types matching docs/api.md.
| Name | Purpose | Status |
|---|---|---|
| `Skill`, `User`, `PublicUser`, `TeamSummary`, `Member`, `TeamDetail`, `JoinRequest`, `Hackathon`, `Suggestion`, `SuggestionsResponse`, `AuditEvent`, `Page<T>`, `Meta`, `MyStatus`, `RegisterResult`, `Invite`, `LeaveResult`, `FormToken`, `BotFields`, `SignupBody`, `LoginBody`, `ProfilePatch`, `TeamPatch`, `ErrorCode`, `TeamEvent`, `RequestEvent` | Types | done |

### frontend/src/hooks/queries.ts
Query hooks: one per read endpoint, keyed by lib/keys.ts; board and team data merge by version.
| Name | Purpose | Status |
|---|---|---|
| `mergeBoardData(old, fresh)` | Merge a refetched teams board with the cached one so an older snapshot never overwrites a newer event | done |
| `mergeTeamDetail(old, fresh)` | Keep a cached team detail when it is newer than the refetched one | done |
| `useMe`, `useMeta`, `useFormToken`, `useHackathons`, `useHackathon`, `useMyStatus`, `useTeamsBoard`, `usePeopleBoard`, `useSuggestions`, `useMyRequests`, `useTeam`, `useTeamRequests`, `useInvite`, `useTeamAudit` | Data hooks; hackathon-scoped hooks stay idle while the id is empty (bug B-24) | done |

### frontend/src/hooks/mutations.ts
Mutation hooks: one Idempotency-Key per user action, optimistic accept and leave with rollback, one error path.
| Name | Purpose | Status |
|---|---|---|
| `useApiMutation(options)` | useMutation with no mutation retries, every error announced once, `refresh` keys invalidated after the server answers | done |
| `snapshot(client, keys)`, `restore(client, saved)` | Save and roll back query data around an optimistic patch | done |
| `useRegister`, `useSetLooking`, `useCreateTeam`, `useJoinByCode`, `useCreateRequest`, `useWithdrawRequest`, `useAcceptRequest`, `useDeclineRequest`, `useLeaveTeam`, `useRemoveMember`, `useFinalizeTeam`, `useReopenTeam`, `useUpdateTeam`, `useRegenerateInvite`, `useUpdateProfile`, `useLogout` | One hook per mutating endpoint; accept and leave are optimistic | done |

### frontend/src/hooks/useEventStream.ts
Event stream hook: patches cached board and team data from SSE events, refetches on every (re)connect.
| Name | Purpose | Status |
|---|---|---|
| `refetchAll(client, hid)` | Refetch everything that belongs to one hackathon and every open team page | done |
| `applyTeamEvent(client, hid, event)` | Apply one `team` event to the board pages, the team detail and the caller's status; return an announcement | done |
| `applyRequestEvent(client, hid, event)` | Refresh that team's request list and the caller's own requests | done |
| `knownTeamName(client, hid, teamId)` | Return the cached name of a team (for deletion events, which carry no snapshot) | done |
| `useEventStream(hid)` | Open one EventSource; refetch on open, merge team events and feed the activity store, handle people, request and resync; reconnect with backoff; return the stream status | done |

### frontend/src/hooks/useShell.ts
Shell context shared by signed-in pages.
| Name | Purpose | Status |
|---|---|---|
| `ShellContext`, `ShellState` | Current hackathon id and setter, live stream status, palette opener | done |
| `useShell()` | Return the shell state | done |
| `useCurrentHackathon(hid)` | Make a hackathon the current one (its stream opens in the shell) once its id is known | done |

### frontend/src/hooks/lab.ts
Race lab hooks.
| Name | Purpose | Status |
|---|---|---|
| `useLabInfo()`, `useLabLatency(enabled)` | Lab settings; latency refreshed every 5 s while shown | done |
| `useLabRun(run, done)` | Run one experiment; announce the result or the error | done |

### frontend/src/lib/theme.ts
Theme preference: light or dark, stored per browser; the device setting applies until a choice is saved.
| Name | Purpose | Status |
|---|---|---|
| `deviceTheme()` | The device's preferred theme (light when the browser cannot tell) | done |
| `savedTheme()`, `applyTheme(mode)`, `useTheme()` | Read (saved or device), apply and save, and track the theme | done |

### frontend/src/components/lab/
Race lab views (presentational).
| File | Exports | Status |
|---|---|---|
| `WalkthroughView.tsx` | `WalkthroughView`: three traced joins as numbered statement timelines with timing, purpose and SQL | done |
| `RaceView.tsx` | `RaceView` (stats, dots in finish order with replay, finish timeline, database proof), `Stat`, `Proof` | done |
| `SpamView.tsx` | `SpamView`: every click's answer for one key and for new keys, with database proof | done |
| `QueueView.tsx` | `QueueView`: the leader's queue oldest first and the two decisions | done |
| `LatencyView.tsx` | `LatencyView` (server percentiles, pools, transactions, browser measurement), `BrowserSample` | done |

### frontend/src/hooks/useActivity.ts
| Name | Purpose | Status |
|---|---|---|
| `useActivity()` | Return the newest activity items; re-render when one arrives | done |

### frontend/src/hooks/useBotCheckedSubmit.ts
Bot-checked form submit for login and signup: form token per render, honeypot, minimum fill time.
| Name | Purpose | Status |
|---|---|---|
| `useBotCheckedSubmit(form)` | Return the honeypot state and a `send` that waits out the 2 s minimum before calling the endpoint; a `bot_check_failed` fetches a new token | done |

### frontend/src/lib/merge.ts
Version-based merging of live events and refetched snapshots, with tombstones for deleted teams.
| Name | Purpose | Status |
|---|---|---|
| `tombstones`, `recordTombstone(id, version)`, `isTombstoned(id, version)`, `clearTombstones()` | Deletion versions of teams; a snapshot at or below one is never shown | done |
| `mergeTeam(cached, incoming)` | Keep the higher version | done |
| `onBoard(team)` | True if a team belongs on the teams board (forming, looking, not full) | done |
| `mergeBoardPage(items, teamId, incoming, isFirstPage, isLastPage)` | Patch in place, remove, or insert one team inside the page's range (bug B-26) | done |
| `mergeFetchedPage(fresh, cached)` | Merge a refetched page: higher version wins, tombstoned and off-board teams dropped | done |

### frontend/src/lib/teamColor.ts
Team band colors and initials.
| Name | Purpose | Status |
|---|---|---|
| `BAND_COUNT`, `bandIndex(teamId)` | Stable band index 0 to 7 from an id (FNV-1a) | done |
| `bandColor(teamId)`, `bandStyle(teamId)` | CSS value and style object that set `--band` | done |
| `initials(name)` | Up to two initials for a display name | done |

### frontend/src/lib/filter.ts
Board filters over loaded teams and people.
| Name | Purpose | Status |
|---|---|---|
| `TeamFilter`, `DEFAULT_FILTER` | Search text, skills, needs or has, sort | done |
| `filterFromParams(params)`, `filterToParams(filter, params)` | Read and write the filter in the URL (defaults dropped) | done |
| `isFiltering(filter)` | True if search text or skills narrow the list | done |
| `filterTeams(teams, filter)` | Search, filter by needs or has, sort by open seats; input unchanged | done |
| `filterPeople(people, q, skills)` | Search people by name and required skills | done |

### frontend/src/lib/activity.ts
Live activity feed items and store.
| Name | Purpose | Status |
|---|---|---|
| `activityFromEvent(event, previousName, at)` | Feed item for a team event, or null for events that are not news | done |
| `activityText(item)` | One line of text for an item | done |
| `activityStore`, `FEED_LIMIT` | External store (push, clear, subscribe, snapshot) of the last 30 items | done |

### frontend/src/lib/keys.ts
Query key factory.
| Name | Purpose | Status |
|---|---|---|
| `keys` | Query keys for every resource, scoped by hackathon or team | done |

### frontend/src/lib/time.ts
Time zone and time display helpers.
| Name | Purpose | Status |
|---|---|---|
| `browserTimeZone()` | Return the browser's IANA time zone, or UTC | done |
| `allTimeZones()` | Return every IANA zone the browser knows, UTC first | done |
| `zoneOffset(timezone, at)` | Return the current offset as `UTC+05:30`, or null for an unknown zone | done |
| `formatZone(timezone, at)` | Return `Asia/Kolkata (UTC+05:30)` using the current offset | done |
| `relativeTime(iso, now)` | Return "just now", "5 min ago", "3 h ago" or a date | done |
| `timeUntil(iso, now)` | Return how long until an instant ("47 h", "12 min") | done |

### frontend/src/lib/validation.ts
Form schemas (zod) with the same limits as the API models.
| Name | Purpose | Status |
|---|---|---|
| `LIMITS` | Password 8 to 128, names 1 to 60, 12 skills, zone 64, message 280, code 10 | done |
| `normalizeCode(raw)` | Normalize an invite code like the server; null if malformed | done |
| `isTimeZone(value)` | True for an IANA name the browser knows; offsets refused | done |
| `signupSchema`, `loginSchema`, `profileSchema`, `teamNameSchema`, `joinCodeSchema`, `requestMessageSchema` | Form schemas | done |
| `validate(schema, values)` | Return the parsed data or the first error per field | done |
| `apiFieldError(message)` | Map an API `validation_error` message to the field it names | done |

### frontend/src/lib/errors.ts
UI messages for API error codes.
| Name | Purpose | Status |
|---|---|---|
| `MESSAGES` | One plain line per error code in docs/api.md, plus `network_error` | done |
| `errorCode(error)` | Return the error code of any thrown value | done |
| `messageFor(error)` | Return the message to show; validation errors keep the server's text | done |

### frontend/src/lib/skills.ts
Skill taxonomy, short codes and color families.
| Name | Purpose | Status |
|---|---|---|
| `SKILLS`, `CORE_ROLES` | The 12 skills and 6 core roles (same as backend/app/core/skills.py) | done |
| `skillFamily(skill)`, `skillCode(skill)`, `isSkill(value)` | Family color, short board code, type guard | done |
| `missingRoles(skills)` | Return the core roles not covered | done |

### frontend/src/styles/
| File | Purpose | Status |
|---|---|---|
| `tokens.css` | Color tokens (light default, dark from the system or the switch), shadows, the 8 team band colors, dot and glow colors | done |
| `index.css` | Font, dot-grid canvas, browser surfaces, type roles (`display`, sentence-case `label`), cards and lift, `band`, `band-soft`, `hero-surface`, live ping, seat fill and dialog keyframes, reduced motion | done |

### frontend/src/components/
Presentational components (no data fetching).
| File | Exports | Status |
|---|---|---|
| `ActivityFeed.tsx` | `ActivityFeed` (live feed, entries slide in, times refresh every 20 s), `ago(at, now)` | done |
| `AuthShell.tsx` | `AuthShell` (lit navy panel with the headline and three how-it-works steps beside the form), `HEADLINE` | done |
| `Avatar.tsx` | `Avatar`: initials in the person's band color | done |
| `BoardToolbar.tsx` | `BoardToolbar` (search, skill filter popover with needs or has, sort, removable filter chips), `SearchBox` | done |
| `Button.tsx` | `Button` (primary, secondary, ghost, danger; md and sm; busy spinner; `data-variant`), `ButtonLink`, `buttonClass` | done |
| `HeroBanner.tsx` | `HeroBanner` (page header on the lit navy surface, optional facts row), `HeroFact` (one real fact) | done |
| `ThemeToggle.tsx` | `ThemeToggle`: Light or Dark radio group (T-WEB-12 in `ThemeToggle.test.tsx`) | done |
| `CommandPalette.tsx` | `CommandPalette` (cmdk list in a dialog: groups of items, arrow keys, Enter, Escape) | done |
| `ConfirmDialog.tsx` | `ConfirmDialog`, `DIALOG_CLASS` | done |
| `ErrorNotice.tsx` | `ErrorNotice`: the one error display (code tag, one-line message, request id for 5xx) | done |
| `Field.tsx` | `FieldShell`, `TextField`, `TextAreaField`, `SelectField`, `FieldError`, `Honeypot` | done |
| `Layout.tsx` | `Layout` (sidebar on laptops; top bar and bottom tabs on phones), `Wordmark`, `FooterLinks`, `ActionBar`, `CONTACT_URL`, `SOURCE_URL` | done |
| `LiveRegion.tsx` | `LiveRegionProvider` (the page's single polite live region), `useAnnounce` | done |
| `LoadState.tsx` | `SkeletonCards`, `LoadError`, `EmptyState` | done |
| `People.tsx` | `PersonCard`, `PeopleGrid`, `SuggestionList`, `ScoreBar` (stacked bar of the weighted score parts), `localTime(timezone)` | done |
| `RequestDialog.tsx` | `RequestDialog` to ask to join with an optional message and a live character count | done |
| `Seats.tsx` | `SeatTabs` (tabs in the band color; `onBand` for band surfaces), `StateTag`, `teamState`, `LiveDot` | done |
| `Sheet.tsx` | `Sheet`: side sheet on wide screens, bottom sheet on phones | done |
| `Skills.tsx` | `SkillChip`, `SkillList`, `SkillPicker` (aria-pressed toggles) | done |
| `TeamCard.tsx` | `TeamCard` (band header, seat tabs, has and needs), `TeamGrid` (cards animate in and out) | done |
| `TeamParts.tsx` | `MemberList`, `RequestList`, `InviteCard` (copy code or link, QR code), `AuditTimeline` | done |
| `TimeZoneField.tsx` | `TimeZoneField` (IANA select with current offsets, labels built once) | done |

### frontend/src/pages/
One file per route; files without a route hold sections or helpers of one page.
| File | Exports | Status |
|---|---|---|
| `LoginPage.tsx` | Login form; `safeNext(next)` keeps redirects in the app | done |
| `SignupPage.tsx` | Signup with skills, time zone and agreement to terms and privacy | done |
| `AppShell.tsx` | Session gate, layout, the one event stream for the current hackathon, command palette; `isPaletteKey(event)` | done |
| `HackathonsPage.tsx` | Hackathon cards in their band colors | done |
| `BoardPage.tsx` | Board: title with live dot, status panel, Teams, People and Live tabs, toolbar, card grid, activity rail, peek | done |
| `BoardStatus.tsx` | `StatusPanel` (register, your team, or create and join with the looking switch), `MyRequests` | done |
| `BoardPeek.tsx` | `BoardPeek`: sheet with a team's members, has and needs, and actions | done |
| `CreateTeamPage.tsx` | Create a team, with what happens next | done |
| `JoinPage.tsx` | Join with a code (also from `?code=` and QR links) | done |
| `TeamPage.tsx` | Team hero in the band color, members, leader tools, invite and actions | done |
| `TeamSections.tsx` | `Section`, `RequestsSection`, `InviteSection`, `SettingsSection`, `SuggestionsSection`, `AuditSection` | done |
| `teamConfirm.ts` | `teamConfirmCopy(args)`: text and action for leave, finalize, reopen and remove dialogs; `Confirm` | done |
| `ProfilePage.tsx` | Edit name, skills, time zone with a live preview card; `profileChanges(user, values)` | done |
| `LegalPages.tsx` | `PrivacyPage`, `TermsPage`, `NotFoundPage`, `LEGAL_UPDATED` | done |
| `LabPage.tsx` | Race lab: five tabs, size slider, one Run button per tab; `percentile(sorted, fraction)` | done |

### frontend/src/test/ and tests
| File | Purpose | Status |
|---|---|---|
| `test/setup.ts` | DOM matchers, `FakeEventSource`, cleanup, fresh tombstones | done |
| `test/fixtures.ts` | API payload fixtures and `stubFetch(routes)` | done |
| `api/client.test.ts` | T-WEB-02 | done |
| `lib/merge.test.ts` | T-WEB-03, T-WEB-04 | done |
| `hooks/mutations.test.tsx` | T-WEB-01 | done |
| `lib/validation.test.ts` | T-WEB-06 | done |
| `routes.test.tsx` | T-WEB-05 (every page incl. /lab, B-24 and B-25 regressions, one primary action per page) | done |
| `lib/filter.test.ts` | T-WEB-09 | done |
| `lib/activity.test.ts` | T-WEB-10, T-WEB-11 | done |
| `hooks/useEventStream.test.tsx` | T-WEB-07 | done |
| `content.test.ts` | T-WEB-08 | done |

### frontend/e2e/
| File | Purpose | Status |
|---|---|---|
| `helpers.ts` | `unique`, `hackathonId`, `people` (real signups with the bot check, registered, one signed-in page each), `inviteCode`, `watch` and `assertClean` (CSP violations, page errors, horizontal overflow) | done |
| `crewline.spec.ts` | E2E-01 to E2E-10 | done |
