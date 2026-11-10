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

## API core

### backend/app/main.py
App factory: lifespan, middleware, routers, static web files. Run with `uvicorn --factory app.main:create_app`.
| Name | Purpose | Status |
|---|---|---|
| `create_app(settings)` | Build the FastAPI app with middleware, routers and the SPA mount | done |
| `lifespan(app)` | Open pools and start background tasks; close them on shutdown | done |
| `mount_web(app, dist_dir)` | Serve the built SPA at / with index.html as the fallback for client routes | done |

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
| `ValidationFailed`, `IdempotencyKeyRequired`, `Unauthenticated`, `InvalidCredentials`, `NotLeader`, `MembersOnly`, `NotFound`, `InviteInvalid`, `EmailTaken`, `NotRegistered`, `AlreadyInTeam`, `TeamFull`, `TeamFinalized`, `NotFinalized`, `BelowMinSize`, `RequestNotPending`, `NotAMember`, `CannotRemoveSelf`, `TooManyPendingRequests`, `IdempotencyKeyMismatch`, `RateLimited`, `Busy` | One subclass per error code in api.md | done |
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

### backend/app/core/deps.py
FastAPI dependencies shared by routers.
| Name | Purpose | Status |
|---|---|---|
| `current_user_id(request)` | Return the user id from the session cookie or raise 401 | done |
| `idempotency_key(key)` | Validate and return the Idempotency-Key header or raise 400 | done |
| `client_ip(request)` | Return the client IP used for rate limits (first X-Forwarded-For hop behind a proxy) | done |
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
IANA time zone validation and current offsets.
| Name | Purpose | Status |
|---|---|---|
| `_known()` | Return the set of known IANA zone names | done |
| `validate_timezone(name)` | Return the name if it is a known IANA zone, else raise ValueError (rendered as 400) | done |
| `current_offset_hours(name, at)` | Return the UTC offset in hours of a zone at an instant | done |

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
Micro-cache with single-flight loading for board pages.
| Name | Purpose | Status |
|---|---|---|
| `MicroCache(ttl_ms)` | Hold `(etag, bytes)` per key for a short TTL | planned |
| `MicroCache.get_or_load(key, loader)` | Return a cached value or run one loader for all concurrent callers | planned |
| `MicroCache.invalidate_hackathon(hackathon_id)` | Drop every entry for one hackathon | planned |

### backend/app/core/events.py
SSE hub: subscriptions per hackathon and event fan-out.
| Name | Purpose | Status |
|---|---|---|
| `EventHub` | Map hackathon id to subscriber queues | planned |
| `EventHub.subscribe(hackathon_id, user_id)` | Register a queue; raise RateLimited past 3 streams per user | planned |
| `EventHub.unsubscribe(sub)` | Remove a subscriber | planned |
| `EventHub.publish(raw_notification)` | Project the notification and push it to the hackathon's subscribers, or only to its audience for request events; drop full queues | planned |
| `EventHub.broadcast_resync()` | Send a resync event to every subscriber | planned |
| `public_projection(raw)` | Return `(kind, data, audience)`: kind `team`, `people` or `request`, data without secrets, audience for request events | planned |

### backend/app/core/metrics.py
Prometheus metrics definitions and helpers.
| Name | Purpose | Status |
|---|---|---|
| `REQUEST_DURATION`, `TX_DURATION`, `POOL_ACQUIRE_WAIT`, `BUSY_TOTAL`, `CAP_BACKSTOP_HITS`, `DEADLOCK_RETRIES`, `SSE_CONNECTIONS`, `CACHE_HITS`, `CACHE_MISSES` | Metric objects | planned |
| `collect_pool_stats(pools)` | Update pool size, idle and waiting gauges | planned |
| `metrics_endpoint()` | Return the Prometheus text exposition | planned |

### backend/app/core/logging.py
JSON logging setup.
| Name | Purpose | Status |
|---|---|---|
| `JsonFormatter` | Format log records as one JSON line | done |
| `JsonFormatter.format(record)` | Return the record as a JSON string with extra fields included | done |
| `configure_logging(level)` | Install the JSON formatter on the root logger | done |

### backend/app/core/middleware.py
Request id and access log middleware (pure ASGI, safe for streaming responses). The write in-flight cap lives in `db/tx.py`.
| Name | Purpose | Status |
|---|---|---|
| `RequestIdMiddleware` | Accept or create X-Request-ID, attach it to the request and response, log one line per request | done |

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

### backend/app/db/listener.py
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

### backend/app/modules/auth/router.py
Auth and profile endpoints.
| Name | Purpose | Status |
|---|---|---|
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
| `SignupIn`, `LoginIn`, `UpdateMeIn`, `UserOut` | Validated models with limits from api.md (extra fields rejected) | done |

### backend/app/modules/auth/service.py
Signup, login and profile rules.
| Name | Purpose | Status |
|---|---|---|
| `_user(row)` | Return the public user fields of a row | done |
| `signup(data, ip)` | Rate-limit, hash the password, create the user | done |
| `login(data, ip)` | Rate-limit, verify the password, return the user | done |
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
| `list_all(conn)` | Return all hackathons, newest first | done |
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
| `create_request(tid, body, ...)` | POST /api/teams/{tid}/requests | planned |
| `list_for_team(tid, user_id)` | GET /api/teams/{tid}/requests | planned |
| `list_mine(hid, user_id)` | GET /api/hackathons/{hid}/my-requests | planned |
| `accept(rid, ...)` | POST /api/requests/{rid}/accept | planned |
| `decline(rid, ...)` | POST /api/requests/{rid}/decline | planned |
| `withdraw(rid, ...)` | POST /api/requests/{rid}/withdraw | planned |

### backend/app/modules/requests/schemas.py
Join request models.
| Name | Purpose | Status |
|---|---|---|
| `CreateRequestIn`, `JoinRequestOut` | Validated models | planned |

### backend/app/modules/requests/service.py
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

### backend/app/modules/requests/repo.py
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

### backend/app/modules/board/router.py
Board endpoints.
| Name | Purpose | Status |
|---|---|---|
| `teams_board(hid, limit, cursor, if_none_match)` | GET /api/hackathons/{hid}/board/teams | planned |
| `people_board(hid, limit, cursor, if_none_match)` | GET /api/hackathons/{hid}/board/people | planned |

### backend/app/modules/board/service.py
Board pages through the micro-cache.
| Name | Purpose | Status |
|---|---|---|
| `teams_page(hid, limit, cursor)` | Return `(etag, bytes)` for a teams page | planned |
| `people_page(hid, limit, cursor)` | Return `(etag, bytes)` for a people page | planned |

### backend/app/modules/board/repo.py
Board SQL.
| Name | Purpose | Status |
|---|---|---|
| `teams_page(conn, hid, after, limit)` | Keyset page of open teams as snapshots | planned |
| `people_page(conn, hid, after, limit)` | Keyset page of looking participants without a team | planned |

### backend/app/modules/board/cursor.py
Opaque keyset cursors.
| Name | Purpose | Status |
|---|---|---|
| `encode_cursor(ts, id)` | Return a base64url cursor | planned |
| `decode_cursor(cursor)` | Return `(ts, id)` or raise validation_error | planned |

### backend/app/modules/suggestions/router.py
Suggestions endpoint.
| Name | Purpose | Status |
|---|---|---|
| `suggestions(hid, limit, user_id)` | GET /api/hackathons/{hid}/suggestions | planned |

### backend/app/modules/suggestions/service.py
Build the team context, fetch candidates, rank.
| Name | Purpose | Status |
|---|---|---|
| `suggest(hid, user_id, limit)` | Return context and ranked candidates | planned |

### backend/app/modules/suggestions/repo.py
Suggestions SQL.
| Name | Purpose | Status |
|---|---|---|
| `group_context(conn, hid, user_id)` | Return the caller's team id (or None) and the group's skills and time zones; the caller alone when teamless | planned |
| `candidates(conn, hid, exclude_ids, missing)` | Looking participants without a team, ordered by missing-skill overlap then recency (max 500) | planned |

### backend/app/modules/suggestions/scoring.py
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
SSE endpoint.
| Name | Purpose | Status |
|---|---|---|
| `stream(hackathon_id, user_id)` | GET /api/events: subscribe and yield events with heartbeats | planned |

## Tests

### backend/tests/conftest.py
Fixtures for the test database, a real API server and per-test cleanup.
| Name | Purpose | Status |
|---|---|---|
| `admin_url()` | Return a server URL from TEST_DATABASE_URL, or start the local test instance | done |
| `server_url` | The PostgreSQL server URL used by the test session | done |
| `db_url` | Create a fresh test database with all migrations applied | done |
| `server` | Run one real API server for the whole session and return its base URL | done |
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
| `TEST_JWT_SECRET`, `SERVER_ENV` | Settings for the test server (large pools, relaxed signup/login/mutation/per-IP code limits) | done |
| `SHARED_TLS` | One TLS context for every test client (bug B-19) | done |
| `key()` | Return a fresh idempotency key | done |
| `User` | A signed-up user with an authenticated client; `get`, `send`, `post`, `patch`, `delete` | done |
| `Users` | Factory: `new` signs up (optionally registers), `bulk` inserts registered users with minted cookies, `close` | done |
| `session_token(user_id)` | Mint a session JWT for a user with the test secret | done |
| `create_team(user, hid, name)` | Create a team as the user and return (team id, invite code) | done |
| `join(user, code)` | Join a team by invite code | done |
| `make_hackathon(db_url, min_size, max_size, ttl, name)` | Insert a hackathon and return its id | done |
| `query(db_url, sql, *args)` | Run a raw query (json and jsonb decoded like the app) and return its rows | done |

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
Bulk seed data and k6 tokens.
| Name | Purpose | Status |
|---|---|---|
| `seed(url, users, teams, hackathons)` | Insert users, participants, teams, memberships and audit rows with COPY | planned |
| `write_tokens(path, user_ids)` | Write pre-minted JWTs for k6 | planned |
| `main()` | CLI entry point | planned |

### database/invariants.py and database/invariants.sql
Invariant checker.
| Name | Purpose | Status |
|---|---|---|
| `load_checks()` | Return (id, description, query) for each invariant block | done |
| `run_checks(url)` | Run every invariant query and return violations keyed by invariant id | done |
| `main()` | Print violations and exit non-zero if any | done |

### backend/scripts/chaos.py
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

### frontend/src/api/client.ts
Fetch wrapper.
| Name | Purpose | Status |
|---|---|---|
| `request(method, path, body?, opts?)` | Same-origin fetch with credentials, error envelope parsing, 503 retry with the same key | planned |
| `ApiError` | Error with status and code | planned |
| `newIdempotencyKey()` | Return a random key for one user action | planned |

### frontend/src/api/endpoints.ts
One function per endpoint in api.md.
| Name | Purpose | Status |
|---|---|---|
| `signup`, `login`, `logout`, `me`, `updateMe`, `listHackathons`, `getHackathon`, `register`, `myStatus`, `setLooking`, `teamsBoard`, `peopleBoard`, `createTeam`, `getTeam`, `updateTeam`, `joinByCode`, `leaveTeam`, `removeMember`, `finalizeTeam`, `reopenTeam`, `getInvite`, `regenerateInvite`, `teamAudit`, `createRequest`, `teamRequests`, `myRequests`, `acceptRequest`, `declineRequest`, `withdrawRequest`, `suggestions`, `meta` | Typed endpoint calls | planned |

### frontend/src/api/types.ts
API payload types matching api.md.
| Name | Purpose | Status |
|---|---|---|
| `Skill`, `User`, `PublicUser`, `TeamSummary`, `TeamDetail`, `Member`, `JoinRequest`, `Hackathon`, `Suggestion`, `AuditEvent`, `Page<T>`, `ErrorCode` | Types | planned |

### frontend/src/hooks/useEventStream.ts
SSE subscription that patches the query cache.
| Name | Purpose | Status |
|---|---|---|
| `useEventStream(hackathonId)` | Open the stream, refetch on open, merge team events and tombstones, refetch people and request lists, handle resync | planned |

### frontend/src/hooks/queries.ts
Query hooks.
| Name | Purpose | Status |
|---|---|---|
| `useMe()`, `useHackathons()`, `useMyStatus(hid)`, `useTeamsBoard(hid)`, `usePeopleBoard(hid)`, `useTeam(tid)`, `useTeamRequests(tid)`, `useSuggestions(hid)`, `useTeamAudit(tid)` | Data hooks with query keys from `lib/keys.ts` | planned |

### frontend/src/hooks/mutations.ts
Mutation hooks with optimistic updates.
| Name | Purpose | Status |
|---|---|---|
| `useJoinByCode()`, `useCreateTeam()`, `useLeaveTeam()`, `useAcceptRequest()`, `useDeclineRequest()`, `useWithdrawRequest()`, `useRemoveMember()`, `useFinalizeTeam()`, `useReopenTeam()`, `useRegenerateInvite()`, `useCreateRequest()` | One idempotency key per action, optimistic patch, rollback on error | planned |

### frontend/src/lib/merge.ts
Version-based merging of events and snapshots.
| Name | Purpose | Status |
|---|---|---|
| `mergeTeam(cached, incoming)` | Keep the higher version | planned |
| `mergeBoardPage(page, incoming)` | Patch, insert or remove one team in a board page | planned |
| `tombstones` | Map of deleted team id to deletion version | planned |
| `isTombstoned(teamId, version)` | True if a snapshot is older than the team's deletion | planned |

### frontend/src/lib/keys.ts
Query key factory.
| Name | Purpose | Status |
|---|---|---|
| `keys` | Query keys for every resource | planned |

### frontend/src/lib/time.ts
Time zone helpers.
| Name | Purpose | Status |
|---|---|---|
| `formatZone(timezone)` | Return `Asia/Kolkata (UTC+05:30)` using the current offset | planned |
| `browserTimeZone()` | Return the browser's IANA time zone | planned |

### frontend/src/pages/*
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

### frontend/src/components/*
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
