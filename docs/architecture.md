# Architecture

Race-proof team formation service. This document is the implementation spec: every table, transaction, lock, pool and event path.
Reasons for each choice are in [decisions.md](decisions.md); endpoint contracts are in [api.md](api.md); proofs are in [verification.md](verification.md).

## 1. System overview

```
                 Browser (React + TS)
   pages ── TanStack Query cache ── useEventStream (EventSource)
        │  HTTPS, same origin, httpOnly JWT cookie       ▲ SSE (text/event-stream)
        ▼                                                │
 ┌──────────────────────── FastAPI process (uvicorn worker) ───────────────────────┐
 │ middleware: request id → gzip → write in-flight cap                             │
 │ routers (HTTP) → services (rules, run_write) → repos (SQL)                      │
 │                                                                                 │
 │ read pool (≤10) ──┐   write pool (≤10) ──┐   listener conn (1) ──► EventHub ────┘
 │ micro-cache 1 s   │   run_write: claim key│   LISTEN team_events    fan-out to SSE clients
 │ rate limiter      │   → team row → ...    │   on notify: invalidate cache, publish
 └───────────────────┼───────────────────────┼─────────────────────────────────────┘
                     ▼                       ▼
            ┌──────────────── PostgreSQL 16 ────────────────┐
            │ constraints · unique indexes · row locks       │
            │ audit_events INSERT trigger → pg_notify        │
            └────────────────────────────────────────────────┘
```

- One system of record: PostgreSQL. No Redis, no queue, no second store.
- Each uvicorn worker is self-contained: its own pools, listener connection, micro-cache, rate limiter and SSE hub. Workers share nothing in memory. Correctness never depends on process memory.
- The API serves the built React app from the same origin, so cookies and SSE need no CORS.

## 2. Repository layout

```
Crewline/
  README.md                       quick start, reviewer accounts, links
  Makefile                        task shortcuts (raw commands in README)
  docker-compose.yml              postgres:16 + api service (backend serving the frontend build)
  Dockerfile                      multi-stage: build frontend, install backend, run uvicorn
  .github/workflows/ci.yml        lint, tests, race tests, invariants, compose smoke, k6 smoke
  database/                       everything that owns the schema and data
    migrations/0001_init.sql      full schema below
    migrate.py                    apply migrations
    dev_db.py                     local PostgreSQL 16 without Docker (pgserver)
    invariants.py, invariants.sql invariant checker
    seed.py                       10k users, 2k teams, tokens file for k6
  backend/                        FastAPI service
    pyproject.toml                dependencies (uv)
    app/
      main.py                     app factory, lifespan, middleware, routers, static web
      config.py                   settings from environment
      core/                       cross-cutting: errors, security, deps, idempotency, invite codes,
                                  rate limit, cache, events hub, metrics, logging, middleware, skills
      db/                         pools, tx (run_write), errors (constraint mapping), listener
      modules/
        auth/                     signup, login, logout, me, profile
        hackathons/               list, get, register participant, my status, looking flag
        teams/                    create, get, update, join by code, leave, remove, finalize, reopen, invite
        requests/                 create, list, accept, decline, withdraw
        board/                    teams board, people board, cursor encoding
        suggestions/              candidate query, scoring
        audit/                    record event, list team audit
        events/                   SSE endpoint
    tests/
      conftest.py                 database, server and client fixtures
      api/                        endpoint behavior tests
      concurrency/                race tests, negative control (naive.py), barrier helper
      unit/                       scoring, invite codes, cursor, request hash
    scripts/
      chaos.py                    kill the API mid-join and verify
  loadtest/
    lib.js                        shared helpers (tokens, tags)
    board.js                      scenario A (spec)
    mixed.js                      scenario B (board + stampedes + churn)
    soak.js                       scenario C (10 minutes)
  frontend/                       React + TypeScript app (Vite)
    src/api, hooks, pages, components, lib
  docs/                           this folder
```

The full file and function list is in [CODEMAP.md](CODEMAP.md).

## 3. Domain model and rules

| Concept | Rule |
|---|---|
| Hackathon | Has `min_team_size`, `max_team_size` (at most 10) and `invite_ttl` (default 48 h). Created by seed or CLI. No organizer UI. |
| Participant | A user registered for a hackathon. Has a per-hackathon `looking` flag. Must be registered before creating, joining or requesting. Registration, `looking` changes and profile changes (name, skills, time zone) are audited and published so the People board and team skills stay live. |
| Time zone | IANA name (for example `Asia/Kolkata`), validated against `zoneinfo`. Offsets are computed at the current instant, so daylight saving is handled. |
| Team | Belongs to one hackathon. Copies `min_size` and `max_size` from the hackathon at creation. Has a leader, an invite code, a status and a version. |
| Membership | One row per member. A user has at most one membership per hackathon. |
| Team size | `1 <= member_count <= max_size` always. A team with 0 members does not exist (deleted in the same transaction). |
| Min size | Status `forming` may be below min. Leader can `finalize` only when `member_count >= min_size`. `finalized` teams accept no joins. Any leave or removal from a finalized team sets it back to `forming`. |
| Invite code | 10 Crockford base32 chars (50 bits). Expires after `invite_ttl`. Leader can regenerate (old code dies immediately). Unknown and expired codes look identical (404). |
| Join request | `pending` to `accepted`, `declined`, `withdrawn` or `stale`. One pending request per user per team. Exact cap: 5 pending per user per hackathon (serialized on the participant row). Only created for a `forming` team with a free seat (serialized on the team row). A pending request may later point at a full team; accepting it then returns 409 `team_full`. |
| Leader handover | When the leader leaves, the member with the earliest `joined_at` (tie: smallest `user_id`) becomes leader. |
| Last member leaves | Team row is deleted, its join requests cascade, audit events remain. |
| Audit | Every team change writes one event per action in the same transaction. Append-only. |

## 4. Database schema (database/migrations/0001_init.sql)

```sql
-- Initial schema: hackathons, users, participants, teams, memberships, requests, idempotency, audit.
-- schema_migrations is created by database/migrate.py before any migration runs.

CREATE TABLE hackathons (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  min_team_size  int  NOT NULL CHECK (min_team_size >= 1),
  max_team_size  int  NOT NULL CHECK (max_team_size BETWEEN 1 AND 10),
  invite_ttl     interval NOT NULL DEFAULT interval '48 hours',
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hackathons_sizes CHECK (max_team_size >= min_team_size)
);

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL CHECK (char_length(email) <= 254),   -- stored lowercased by the API
  password_hash   text NOT NULL,
  display_name    text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  skills          text[] NOT NULL DEFAULT '{}' CHECK (cardinality(skills) <= 12),
  timezone        text NOT NULL DEFAULT 'UTC' CHECK (char_length(timezone) BETWEEN 1 AND 64),  -- IANA name, validated by the API
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lower CHECK (email = lower(email)),       -- case-insensitive uniqueness without citext
  CONSTRAINT users_email_unique UNIQUE (email)
);
CREATE INDEX users_skills_gin ON users USING gin (skills);

CREATE TABLE participants (
  hackathon_id   uuid NOT NULL REFERENCES hackathons (id),
  user_id        uuid NOT NULL REFERENCES users (id),
  looking        boolean NOT NULL DEFAULT true,
  registered_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hackathon_id, user_id)
);
CREATE INDEX participants_board ON participants (hackathon_id, registered_at DESC, user_id DESC)
  WHERE looking;

CREATE TABLE teams (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id       uuid NOT NULL REFERENCES hackathons (id),
  name               text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  leader_id          uuid NOT NULL REFERENCES users (id),
  member_count       int  NOT NULL DEFAULT 1,
  min_size           int  NOT NULL,
  max_size           int  NOT NULL,
  status             text NOT NULL DEFAULT 'forming',
  looking            boolean NOT NULL DEFAULT true,
  invite_code        text NOT NULL,
  invite_expires_at  timestamptz NOT NULL,
  version            bigint NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_id_hackathon UNIQUE (id, hackathon_id),
  CONSTRAINT teams_invite_code_unique UNIQUE (invite_code),
  CONSTRAINT teams_invite_code_format CHECK (invite_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  CONSTRAINT teams_status CHECK (status IN ('forming', 'finalized')),
  CONSTRAINT teams_sizes CHECK (min_size >= 1 AND max_size >= min_size),
  CONSTRAINT teams_cap CHECK (member_count BETWEEN 1 AND max_size),
  CONSTRAINT teams_min_when_finalized CHECK (status = 'forming' OR member_count >= min_size)
);
CREATE INDEX teams_board ON teams (hackathon_id, created_at DESC, id DESC)
  WHERE looking AND status = 'forming' AND member_count < max_size;

CREATE TABLE memberships (
  team_id       uuid NOT NULL,
  hackathon_id  uuid NOT NULL,
  user_id       uuid NOT NULL,
  joined_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (team_id, user_id),
  CONSTRAINT memberships_one_team_per_hackathon UNIQUE (hackathon_id, user_id),
  CONSTRAINT memberships_team_fk FOREIGN KEY (team_id, hackathon_id)
    REFERENCES teams (id, hackathon_id),
  CONSTRAINT memberships_participant_fk FOREIGN KEY (hackathon_id, user_id)
    REFERENCES participants (hackathon_id, user_id)
);

CREATE TABLE join_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL,
  hackathon_id  uuid NOT NULL,
  user_id       uuid NOT NULL,
  message       text CHECK (char_length(message) <= 280),
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  decided_by    uuid,
  CONSTRAINT join_requests_status CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'stale')),
  CONSTRAINT join_requests_decided CHECK ((status = 'pending') = (decided_at IS NULL)),
  CONSTRAINT join_requests_team_fk FOREIGN KEY (team_id, hackathon_id)
    REFERENCES teams (id, hackathon_id) ON DELETE CASCADE,
  CONSTRAINT join_requests_participant_fk FOREIGN KEY (hackathon_id, user_id)
    REFERENCES participants (hackathon_id, user_id)
);
CREATE UNIQUE INDEX join_requests_one_pending ON join_requests (team_id, user_id) WHERE status = 'pending';
CREATE INDEX join_requests_user_pending ON join_requests (user_id, hackathon_id) WHERE status = 'pending';

CREATE TABLE idempotency_keys (
  user_id          uuid NOT NULL,
  key              text NOT NULL CHECK (char_length(key) BETWEEN 16 AND 64),
  request_hash     text NOT NULL,
  response_status  int,
  response_body    jsonb,   -- changed to text by 0002: exact JSON so replays are byte-identical (B-14)
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX idempotency_keys_created ON idempotency_keys (created_at);

-- database/migrations/0002_idempotency_text_body.sql
ALTER TABLE idempotency_keys ALTER COLUMN response_body TYPE text USING response_body::text;

CREATE TABLE audit_events (
  seq           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hackathon_id  uuid NOT NULL,
  team_id       uuid,
  actor_id      uuid,                       -- NULL means the system acted
  action        text NOT NULL,
  request_id    text,
  payload       jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_events_action CHECK (action IN (
    'team_created', 'team_updated', 'member_joined_via_code',
    'request_created', 'request_accepted', 'request_declined', 'request_withdrawn', 'request_stale',
    'member_removed', 'member_left', 'leader_promoted',
    'team_finalized', 'team_reopened', 'team_deleted', 'invite_regenerated',
    'member_profile_updated', 'participant_registered', 'participant_updated'))
);
CREATE INDEX audit_events_team ON audit_events (team_id, seq);
CREATE INDEX audit_events_hackathon ON audit_events (hackathon_id, seq);

-- Team summary used by the board, audit payloads and realtime events.
CREATE FUNCTION team_snapshot(p_team uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'id', t.id, 'hackathon_id', t.hackathon_id, 'name', t.name,
    'member_count', t.member_count, 'min_size', t.min_size, 'max_size', t.max_size,
    'status', t.status, 'looking', t.looking, 'leader_id', t.leader_id,
    'version', t.version, 'created_at', t.created_at,
    'skills', COALESCE((
      SELECT jsonb_agg(DISTINCT s ORDER BY s)
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      CROSS JOIN LATERAL unnest(u.skills) AS s
      WHERE m.team_id = t.id), '[]'::jsonb))
  FROM teams t
  WHERE t.id = p_team
$$;

-- Audit log is append-only.
CREATE FUNCTION audit_events_block_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END $$;
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_block_change();

-- Every audit insert publishes a realtime event; delivered only if the transaction commits.
CREATE FUNCTION audit_events_publish() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('team_events', json_build_object(
    'seq', NEW.seq, 'hackathon_id', NEW.hackathon_id, 'team_id', NEW.team_id,
    'action', NEW.action, 'payload', NEW.payload)::text);
  RETURN NULL;
END $$;
CREATE TRIGGER audit_events_notify AFTER INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_publish();
```

### What each constraint guarantees

| Constraint | Guarantee | Invariant |
|---|---|---|
| `teams_cap` | No team is ever over capacity or empty, even if app code is wrong | I2 |
| `memberships_one_team_per_hackathon` | One team per person per hackathon | I4 |
| `memberships_team_fk` (composite) | A membership's hackathon equals its team's hackathon | I6 |
| `memberships_participant_fk` | Only registered participants can be members | — |
| `teams_min_when_finalized` | A finalized team meets the minimum size | I5 |
| `join_requests_one_pending` | At most one pending request per user per team | — |
| `join_requests_decided` | Decided requests always have `decided_at` | — |
| `teams_invite_code_unique` + format | Codes are unique and well-formed | — |
| `audit_events_append_only` trigger | Audit history cannot be edited | — |

Member count equals actual membership rows (I1) and the leader is a member (I3) are kept by transactions and checked by the invariant checker. They are not constraints: a leader-is-member FK would need a circular deferrable FK (rejected in ADR-030).

## 5. Request lifecycle for a write

```
HTTP request
 → RequestIdMiddleware (X-Request-ID or new uuid4)
 → WriteInflightLimiter (≤30 in-flight writes per worker, else 503 busy)
 → router: validate body (pydantic), current_user from JWT cookie, Idempotency-Key header
 → before the transaction (never decides a business outcome):
     a. state-free checks only: input format (e.g. malformed invite code), rate-limit check
     b. replay fast path (read pool): if the key is already committed → stored response, or 422 if the hash differs
        (safe: it only ever returns a response that was really committed for this key)
 → run_write(write pool):
     BEGIN
       1. claim idempotency key        (INSERT ... ON CONFLICT DO NOTHING RETURNING)
          conflict → read the committed row → replay or 422 (ReplayResponse, rollback)
       2. resolve ids                  (request → team, code → team; plain reads, these ids never change)
       3. team row(s)                  (conditional UPDATE or SELECT ... FOR UPDATE / FOR SHARE; several in id order)
       4. participant row              (create request only: exact pending cap)
       5. join request rows            (status transition with predicate)
       6. membership rows              (INSERT/DELETE; unique/FK errors → DomainError)
       7. audit insert                 (trigger queues pg_notify)
       8. store response               (UPDATE idempotency_keys)
     COMMIT  → notification delivered to every listener
     any DomainError, AlreadyMember or DB error → ROLLBACK (seat increment, claim, audit all undone)
 → after a 0-row guard or a constraint error: one explanation read (read pool) maps the outcome to
   200 (already a member, not stored), 404, 403 or 409; if no reason is found the state moved, so the
   whole transaction is retried (max 3)
 → response
```

### Why no business pre-checks before the claim

Every state-dependent decision (team full, finalized, unknown code, already in a team) is made after the key is claimed.
A pre-check outside the transaction breaks the retry contract: request A and its retry B (same key) arrive together; B finds no committed key, A takes the last seat and commits, then B's "team full" pre-check returns 409 even though B must replay A's 200. After the claim, B waits on A's uncommitted key row and then replays. The same applies to create team, accept and every other mutation (review finding P0, bug B-7).

Cost: requests that will be rejected still open a short write transaction. In a 50-way stampede the 49 losers wait a few milliseconds on the team row, match 0 rows and roll back; the write pool and in-flight cap bound this.

### Request hash

`sha256(method + "\n" + route_template + "\n" + canonical_path_params + "\n" + canonical_json_body)` where canonical JSON has sorted keys and no whitespace. Same key with a different hash returns `422 idempotency_key_mismatch`.

### Idempotency semantics

| Case | Behavior |
|---|---|
| Key unseen | Claim inside the transaction; on success store status and body in the same transaction |
| Key in flight in another transaction | The claim INSERT waits on the unique index. If the other commits: conflict, replay stored response. If it rolls back: this request claims and executes |
| Key committed | Replay fast path returns it without opening a write transaction |
| Outcome changed nothing (already a member, existing pending request) | 200 with current state, rolled back, not stored |
| Previous attempt was rejected (409 etc.) | Nothing stored (rolled back); the retry re-executes, which is safe because the rejection changed nothing |
| Previous attempt got 503 or the process died | Nothing stored; the retry re-executes |
| Key older than 24 h | Purged by a background task every hour (`DELETE ... WHERE created_at < now() - interval '24 hours'`) |

A committed idempotency row always has a response (I9), because the row is claimed and filled in the same transaction.

## 6. Transactions per operation

Notation: `$me` is the caller, `$t` the team, `$h` the hackathon, `$r` the join request. Every transaction starts with the idempotency claim (step 0) and ends with the response store and commit; they are omitted below. No operation has business pre-checks outside the transaction (section 5).

### 6.1 Create team

All outcomes come from constraints after the claim: not registered → 23503, already in a team → 23505.

```sql
/* route:create_team */
INSERT INTO teams (hackathon_id, name, leader_id, min_size, max_size, invite_code, invite_expires_at)
SELECT $h, $name, $me, h.min_team_size, h.max_team_size, $code, now() + h.invite_ttl
FROM hackathons h WHERE h.id = $h
RETURNING id;
INSERT INTO memberships (team_id, hackathon_id, user_id) VALUES ($t, $h, $me);
  -- 23505 memberships_one_team_per_hackathon → 409 already_in_team (team insert rolls back)
  -- 23503 memberships_participant_fk → 409 not_registered
-- audit team_created {user_id}
```

Invite code collision (23505 on `teams_invite_code_unique`, probability about 2e-12) raises a retryable error and the whole transaction reruns with a new code.

### 6.2 Join by invite code (the hot path)

Before the transaction (state-free only):
1. Normalize the code (uppercase, strip `-` and spaces, map `O`→`0`, `I`/`L`→`1`). Malformed: count a failed attempt, 404 `invite_invalid`.
2. Rate-limit check for failed attempts (per user, per IP): 429 if over.
3. Replay fast path.

Transaction (after the claim):

```sql
/* route:join_by_code */
UPDATE teams
SET member_count = member_count + 1, version = version + 1
WHERE invite_code = $code AND invite_expires_at > now()
  AND status = 'forming' AND member_count < max_size
RETURNING id, hackathon_id, member_count, version;
INSERT INTO memberships (team_id, hackathon_id, user_id) VALUES ($t, $h, $me);
-- audit member_joined_via_code {user_id, before_count, after_count}
```

On 0 rows from the UPDATE or 23505 / 23503 from the INSERT: roll back (the increment is undone), then `_explain_join` reads once and returns the first that holds:
1. Caller is a member of the team with this code → 200 with the team (not stored; nothing changed).
2. No team has this code, or it has expired → 404 `invite_invalid` (records a failed attempt).
3. Team is finalized → 409 `team_finalized`.
4. Team is full → 409 `team_full`.
5. Caller is in another team in this hackathon → 409 `already_in_team`.
6. Caller is not registered → 409 `not_registered`.
7. None of the above → state changed since the attempt; retry the transaction (max 3, then 503 `busy`).

Why exactly one of 50 wins: all 50 UPDATEs target the same row. PostgreSQL lets one hold the row lock; the others wait. When the holder commits, each waiter re-evaluates its WHERE against the new committed row version (READ COMMITTED). With `member_count = max_size` the predicate is false, the UPDATE affects 0 rows, and the request gets 409 without ever touching memberships.

### 6.3 Create join request

```sql
/* route:create_request */
SELECT hackathon_id, status, member_count, max_size FROM teams WHERE id = $t FOR SHARE;
  -- missing → 404 not_found; finalized → 409 team_finalized; member_count >= max_size → 409 team_full
SELECT 1 FROM memberships WHERE hackathon_id = $h AND user_id = $me;
  -- found → 409 already_in_team
SELECT 1 FROM participants WHERE hackathon_id = $h AND user_id = $me FOR NO KEY UPDATE;
  -- missing → 409 not_registered; the lock serializes this user's request creations
SELECT ... FROM join_requests WHERE team_id = $t AND user_id = $me AND status = 'pending';
  -- found → the existing pending request, 200 (rolled back, not stored); checked before the cap
  --   so repeating a request never turns into a 409
SELECT count(*) FROM join_requests WHERE user_id = $me AND hackathon_id = $h AND status = 'pending';
  -- >= 5 → 409 too_many_pending_requests (exact, because of the participant lock)
INSERT INTO join_requests (team_id, hackathon_id, user_id, message)
VALUES ($t, $h, $me, $msg)
ON CONFLICT (team_id, user_id) WHERE status = 'pending' DO NOTHING
RETURNING id;
  -- 0 rows cannot happen under the participant lock; if it does, StateChanged retries
-- audit request_created {request_id, user_id}
```

`FOR SHARE` conflicts with the seat UPDATE and with status changes, so a request cannot be created against a team that is filling or being finalized at that moment (review finding P0, bug B-8). `FOR NO KEY UPDATE` on the participant row does not conflict with the `KEY SHARE` that membership inserts take through the FK, so it never blocks joins.

### 6.4 Accept join request (leader)

```sql
/* route:accept_request */
SELECT team_id, hackathon_id FROM join_requests WHERE id = $r;   -- resolve ids (never change); missing → 404
UPDATE teams
SET member_count = member_count + 1, version = version + 1
WHERE id = $t AND leader_id = $me AND status = 'forming' AND member_count < max_size
RETURNING hackathon_id, member_count, version;
  -- 0 rows → follow-up read: gone 404, not leader 403 not_leader, finalized 409, full 409 team_full
UPDATE join_requests
SET status = 'accepted', decided_at = now(), decided_by = $me
WHERE id = $r AND team_id = $t AND status = 'pending'
RETURNING user_id;
  -- 0 rows → 409 request_not_pending (rolls back the increment)
INSERT INTO memberships (team_id, hackathon_id, user_id) VALUES ($t, $h, $requester);
  -- 23505 → requester is already in a team: roll back, then mark the request stale (below), return 409 already_in_team
-- audit request_accepted {request_id, user_id, before_count, after_count}
```

Stale follow-up (separate small transaction, no idempotency claim, because the accept itself returned 409):

```sql
UPDATE join_requests SET status = 'stale', decided_at = now(), decided_by = $me
WHERE id = $r AND status = 'pending' RETURNING id;
-- audit request_stale {request_id, user_id} if a row was updated
```

Pending requests from users who joined elsewhere stay `pending` until a leader acts on them (lazy, ADR-014). The leader's request list hides them with `NOT EXISTS (membership in $h)`.

### 6.5 Decline join request (leader)

```sql
/* route:decline_request */
SELECT team_id FROM join_requests WHERE id = $r;       -- resolve the team (never changes); missing → 404
SELECT leader_id FROM teams WHERE id = $t FOR SHARE;   -- missing → 404; leader_id <> $me → 403 not_leader
UPDATE join_requests SET status = 'declined', decided_at = now(), decided_by = $me
WHERE id = $r AND team_id = $t AND status = 'pending' RETURNING user_id;   -- 0 rows → 409 request_not_pending
-- audit request_declined {request_id, user_id}
```

`FOR SHARE` blocks a concurrent leader change (a non-key UPDATE), so a leader who just left cannot decline.

### 6.6 Withdraw join request (requester)

```sql
/* route:withdraw_request */
UPDATE join_requests SET status = 'withdrawn', decided_at = now(), decided_by = $me
WHERE id = $r AND user_id = $me AND status = 'pending'
RETURNING team_id, hackathon_id;
  -- 0 rows → follow-up: missing or not owner → 404; not pending → 409 request_not_pending
-- audit request_withdrawn {request_id, user_id}
```

Touches only the request row. A concurrent accept also locks this row after the team row, so the two serialize on the request row and no cycle is possible.

### 6.7 Leave team

```sql
/* route:leave_team */
SELECT leader_id, member_count, status FROM teams WHERE id = $t FOR UPDATE;   -- missing → 404
DELETE FROM memberships WHERE team_id = $t AND user_id = $me RETURNING 1;     -- 0 rows → 409 not_a_member

-- if member_count = 1:
DELETE FROM teams WHERE id = $t RETURNING version;   -- join_requests cascade
-- audit member_left {user_id, version: v + 1}, team_deleted {version: v + 1} (actor NULL)
-- version v + 1 is the tombstone: clients drop any later-arriving snapshot of this team with a lower version

-- else:
UPDATE teams
SET member_count = member_count - 1,
    version = version + 1,
    status = 'forming',
    leader_id = CASE WHEN leader_id = $me
      THEN (SELECT user_id FROM memberships WHERE team_id = $t ORDER BY joined_at, user_id LIMIT 1)
      ELSE leader_id END
WHERE id = $t
RETURNING leader_id, member_count, version;
-- audit member_left {user_id, before_count, after_count}
-- audit leader_promoted {from_user_id, to_user_id} (actor NULL) if the leader changed
-- audit team_reopened {} (actor NULL) if status was finalized
```

`FOR UPDATE` (not `FOR NO KEY UPDATE`) because this path may delete the team. While it is held, no membership can be inserted for this team (the FK needs `KEY SHARE`), so the leader subquery sees a stable member set. The subquery is in SET, not in a guarding WHERE, so the READ COMMITTED re-check rule does not apply.

### 6.8 Remove member (leader)

Same shape as leave: lock the team `FOR UPDATE`, require `leader_id = $me` (403 `not_leader`), require target `<> $me` (409 `cannot_remove_self`), delete the target membership (0 rows: 409 `not_a_member`), decrement, set `status = 'forming'`. No promotion and no deletion can happen because the leader stays. Audit `member_removed {user_id, before_count, after_count}` and `team_reopened` if it was finalized.

### 6.9 Finalize and reopen (leader)

```sql
/* route:finalize_team */
UPDATE teams SET status = 'finalized', version = version + 1
WHERE id = $t AND leader_id = $me AND status = 'forming' AND member_count >= min_size
RETURNING version;
  -- 0 rows → follow-up: 404 / 403 not_leader / 409 already finalized (team_finalized) / 409 below_min_size
-- audit team_finalized {member_count}
```

Reopen is the inverse (`status = 'finalized'` to `'forming'`, 409 `not_finalized`), audit `team_reopened`.

### 6.10 Regenerate invite, update team (leader)

```sql
/* route:regenerate_invite */
UPDATE teams
SET invite_code = $new_code,
    invite_expires_at = now() + (SELECT invite_ttl FROM hackathons WHERE id = teams.hackathon_id),
    version = version + 1
WHERE id = $t AND leader_id = $me
RETURNING invite_expires_at, version;
-- audit invite_regenerated {expires_at} (never the code)
```

Update team (`name`, `looking`) uses the same leader predicate, audit `team_updated {fields}`.

### 6.11 Participant and profile changes

These keep the People board and team skills live (review finding P0, bug B-9).

```sql
/* route:register */
INSERT INTO participants (hackathon_id, user_id) VALUES ($h, $me)
ON CONFLICT DO NOTHING RETURNING looking;
-- inserted → audit participant_registered {user_id, looking} (team_id NULL); not inserted → 200, nothing stored

/* route:set_looking */
UPDATE participants SET looking = $v
WHERE hackathon_id = $h AND user_id = $me AND looking IS DISTINCT FROM $v
RETURNING looking;
-- 0 rows → read: missing → 409 not_registered; unchanged → 200, nothing stored
-- audit participant_updated {user_id, looking}

/* route:update_profile */
WITH mine AS (
  SELECT t.id FROM teams t JOIN memberships m ON m.team_id = t.id
  WHERE m.user_id = $me ORDER BY t.id FOR NO KEY UPDATE OF t)
UPDATE teams SET version = version + 1 FROM mine WHERE teams.id = mine.id
RETURNING teams.id, teams.hackathon_id;                 -- team rows first, ascending id
UPDATE users SET display_name = ..., skills = ..., timezone = ... WHERE id = $me;
-- audit member_profile_updated {user_id, fields} per team (snapshot now carries the new skills and version)
-- audit participant_updated {user_id, fields} per hackathon the user is registered in
```

The version bump makes the board and every client treat the new team snapshot as newer. The users row is locked only here (other paths take only the FK `KEY SHARE` on it), so taking it after the team rows cannot form a cycle.

### 6.12 Lock order summary

| Operation | Idempotency | Team row(s) | Participant row | Request row | Membership | Audit |
|---|---|---|---|---|---|---|
| Create team | 1 | 2 (new row) | FK KEY SHARE | — | 3 insert | 4 |
| Join by code | 1 | 2 UPDATE | FK KEY SHARE | — | 3 insert | 4 |
| Create request | 1 | 2 FOR SHARE | 3 FOR NO KEY UPDATE | 4 insert | — | 5 |
| Accept | 1 | 2 UPDATE | FK KEY SHARE | 3 UPDATE | 4 insert | 5 |
| Decline | 1 | 2 FOR SHARE | — | 3 UPDATE | — | 4 |
| Withdraw | 1 | — | — | 2 UPDATE | — | 3 |
| Leave / remove | 1 | 2 FOR UPDATE | — | (cascade on delete) | 3 delete | 4 |
| Finalize / reopen / regenerate / update | 1 | 2 UPDATE | — | — | — | 3 |
| Register / set looking | 1 | — | 2 INSERT / UPDATE | — | — | 3 |
| Update profile | 1 | 2 FOR NO KEY UPDATE, ascending id (then users row) | — | — | — | 3 |

Withdraw is the only path that takes a request row without the team row first. It holds no other lock, so it cannot complete a cycle.

### 6.13 Concurrency scenarios and outcomes

| Scenario | What serializes it | Outcome |
|---|---|---|
| 50 joins for the last seat | Team row lock + predicate re-check | 1 × 200, 49 × 409 `team_full` |
| Same user joins two teams at once | Unique `(hackathon_id, user_id)` index | 1 succeeds, the other gets 23505 → 409, its increment rolls back |
| Code join vs leader accept for the last seat | Team row lock | First wins, second 409 `team_full` |
| Two leaders accept the same user | Unique index on membership | One commits; the other rolls back and marks its request stale |
| Same request accepted twice | Team row lock, then request status predicate | Second gets 409 `request_not_pending`, count unchanged |
| Leader leaves during joins | Team row lock | Leaver and joiners serialize; leader is always a member |
| Last member leaves while someone joins | Team row lock (leave takes it first) | Team deleted and join gets 404, or join first and leave decrements; no deadlock |
| Accept vs withdraw | Request row lock | Exactly one transition wins |
| Same idempotency key ×20 | Unique index on `idempotency_keys` | One execution, 20 identical responses |
| Request and its retry (same key) arrive while the last seat is taken | Claim waits on the uncommitted key row | Retry replays the 200; never a 409 (B-7) |
| Join request created while the team fills or is finalized | `FOR SHARE` on the team row | Request created before the change, or 409 `team_full` / `team_finalized` after |
| One user creates 6 requests at once | `FOR NO KEY UPDATE` on the participant row | Exactly 5 pending, 1 × 409 `too_many_pending_requests` |
| Profile update while joins run on the user's team | Team row lock | Both apply; the later event carries the higher version |
| Process killed mid-transaction | PostgreSQL aborts the open transaction | Nothing partial; client retry with the same key re-executes or replays |

## 7. Connection management

| Pool | Max per worker | Server settings | Used by |
|---|---|---|---|
| write | 10 | `lock_timeout=1000`, `statement_timeout=3000`, `idle_in_transaction_session_timeout=5000`, `application_name=crewline-write` | `run_write` |
| read | 10 | `statement_timeout=2000`, `application_name=crewline-read` | replay fast path, explanation reads, board, suggestions, gets |
| listen | 1 dedicated connection | `application_name=crewline-listen` | `LISTEN team_events` |

- Connection budget: `workers × (read + write + 1) + reserve`. Local: 2 workers × 21 + 5 = 47. Render free: 1 worker × 21 + 5 = 26. Must stay below the provider limit (check the Neon compute's `max_connections` and record it in the load report).
- Direct connections everywhere (no PgBouncer). LISTEN does not work through a transaction pooler, and the budget fits without one. If it ever does not fit: point the pools at the pooled endpoint with `statement_cache_size=0` and keep the listener on the direct URL.
- Pools open every connection at startup and never close idle ones (`min_size = max_size`, `max_inactive_connection_lifetime = 0`): a cold backend costs 60 to 130 ms on first use (bug B-20, ADR-020).
- Every connection decodes `uuid` to the standard `uuid.UUID` and `json`/`jsonb` with orjson (bug B-15).
- Acquire timeout 1 s: `asyncpg` `TimeoutError` → 503 `busy` with `Retry-After: 1`.
- Write in-flight cap: 30 per worker (an `asyncio.Semaphore` checked without waiting). Excess returns 503 immediately, so a stampede queues in clients, not on connections.
- Race-test configuration overrides `WRITE_POOL_MAX=60` and `WRITE_INFLIGHT_MAX=100` so that 50 requests truly overlap in PostgreSQL.
- Because rejections are decided inside the transaction (section 5), stampede losers also use a write connection for a few milliseconds. This is the price of a correct retry contract; L-B measures it.
- Rule: acquire late, release early, one transaction per request, never await non-database I/O while holding a connection.

Round trips per join transaction: BEGIN, claim, UPDATE team, INSERT membership, INSERT audit, UPDATE idempotency, COMMIT = 7. At about 1 ms per round trip in the same region, the transaction holds the team row lock for under 10 ms. Moving the body into a SQL function would cut it to 1 round trip; deferred (plan.md, one more week).

## 8. Board and read paths

### Teams board

```sql
/* route:board_teams */
SELECT team_snapshot(id) AS team
FROM teams
WHERE hackathon_id = $1 AND looking AND status = 'forming' AND member_count < max_size
  AND (created_at, id) < ($2, $3)          -- omitted on the first page
ORDER BY created_at DESC, id DESC
LIMIT $4;                                   -- default 20, max 50
```

- Served by the partial index `teams_board` (the WHERE repeats the index predicate exactly). Verify with `EXPLAIN (ANALYZE, BUFFERS)` on the seeded data; save the output in `docs/explain/`.
- `team_snapshot` gives the same shape as realtime events, so the client merges both with one function.
- Cursor: base64url of `created_at_iso|id`, opaque to the client.

### People board

```sql
/* route:board_people */
SELECT p.user_id, u.display_name, u.skills, u.timezone, p.registered_at
FROM participants p
JOIN users u ON u.id = p.user_id
WHERE p.hackathon_id = $1 AND p.looking
  AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.hackathon_id = p.hackathon_id AND m.user_id = p.user_id)
  AND (p.registered_at, p.user_id) < ($2, $3)
ORDER BY p.registered_at DESC, p.user_id DESC
LIMIT $4;
```

Served by `participants_board`; the anti-join uses the `memberships_one_team_per_hackathon` index.

### Micro-cache

- Key: `(kind, hackathon_id, cursor, limit)`. Value: `(etag, serialized JSON bytes)`. TTL 1 s.
- Single-flight: concurrent misses for the same key await one `asyncio.Future`, so a stampede runs one query.
- On every notification for a hackathon, the listener clears that hackathon's cache entries before fanning the event out (prevents the stale-after-event bug, B-2 in verification.md).
- `ETag` on every board response; `If-None-Match` returns 304 with no body.
- Cached as bytes so a hit costs no JSON serialization (Python CPU is the bottleneck on a small host).

### Other reads

- Team detail: team row + members joined with users (PK index `memberships (team_id, user_id)`).
- Invite code: members only.
- Audit list: members only, `audit_events_team` index, keyset by `seq`.

## 9. Realtime (SSE)

```
write transaction ── INSERT audit_events ── trigger pg_notify('team_events', {...})
        │ COMMIT (rollback discards the notification)
        ▼
listener connection (one per worker): on notify
        1. parse payload
        2. clear micro-cache for payload.hackathon_id
        3. EventHub.publish(public projection)
        ▼
EventHub: hackathon_id → set of subscriber queues (asyncio.Queue, maxsize 100)
        ▼
GET /api/events?hackathon_id=...  (sse-starlette)  → browser EventSource
```

Three event kinds, built by `public_projection` (no emails, no invite codes):

| Kind | Actions | Payload | Delivered to |
|---|---|---|---|
| `team` | team_created, team_updated, member_joined_via_code, request_accepted, member_left, member_removed, leader_promoted, team_finalized, team_reopened, team_deleted, invite_regenerated, member_profile_updated | `{seq, action, team_id, version, team: snapshot \| null}` | Every subscriber of the hackathon |
| `people` | participant_registered, participant_updated | `{seq, action}` | Every subscriber of the hackathon |
| `request` | request_created, request_declined, request_withdrawn, request_stale | `{seq, action, team_id, request_id}` | Only the users in the event's `audience`: team members at commit time plus the requester (review finding, bug B-10) |

- `audit.repo.record` adds `audience` (member ids plus requester) to request event payloads in the same statement, so the hub filters without a database read.
- Clients merge by `version`. `team: null` with `version` is a tombstone: the client remembers it and ignores any snapshot of that team with a lower version, so an in-flight fetch cannot bring a deleted team back (bug B-11).
- `people` events make clients refetch the People board and suggestions.
- On every (re)connect the client refetches; there is no `Last-Event-ID` replay (ADR-018). The database is the truth, events are hints.
- Heartbeat comment every 15 s. Header `X-Accel-Buffering: no`. Max 3 streams per user (4th gets 429).
- Slow client: if its queue is full, the hub drops the subscriber and closes the stream; the browser reconnects and refetches.
- Listener failure: a supervisor checks the LISTEN connection every 0.5 s (and runs `SELECT 1` every 30 s as a keepalive); on loss it reconnects with backoff (0.5 s doubling to 10 s), clears the board cache, then publishes `event: resync` to every subscriber so they refetch. Proven by killing the backend with `pg_terminate_backend` (B-3 test).
- SSE streams never hold a database connection.

## 10. Security

| Area | Design |
|---|---|
| Passwords | argon2id (`argon2-cffi` defaults), hashed in a threadpool, only at signup and login |
| Session | JWT HS256, claims `sub`, `iat`, `exp` (2 h), in an httpOnly, Secure, SameSite=Lax cookie named `crewline_session`. Verified locally |
| CSRF | SameSite=Lax blocks cross-site POST with the cookie; every mutation also requires the custom `Idempotency-Key` header, which a cross-site form cannot send without a CORS preflight that the API does not allow |
| Authorization | Leader checks inside the SQL predicate or under the team row lock |
| Invite codes | 50 bits from `secrets.choice`; expiry in SQL with the database clock; same 404 for unknown and expired |
| Brute force | Failed code attempts limited per user (5/min) and per IP (20/min); login limited per IP+email (5/min); signup per IP (10/hour); all mutations per user (60/min). In-process sliding windows (per worker; documented) |
| Brute-force math | 2,000 live codes in 2^50 ≈ 1.13e15 space. At 20,000 guesses per minute (1,000 IPs at the cap), expected time to the first hit is about 2.8e7 minutes ≈ 53 years, while each code lives 48 h |
| Abuse caps | 5 pending requests per user, page size ≤ 50, request message ≤ 280 chars, 3 SSE streams per user |
| Input validation | pydantic models with explicit limits; skills from a fixed taxonomy; IANA time zones checked against `zoneinfo`; UUID path params. A custom `RequestValidationError` handler returns 400 `validation_error` (FastAPI's default is 422, which the contract reserves for idempotency key mismatch) |
| Headers | `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, a strict `Content-Security-Policy` for the SPA |
| Data exposure | Board and events never include emails or invite codes; request events go only to the team's members and the requester |

Known gaps (stated in the design doc): no CAPTCHA at signup, logout does not revoke a token before expiry, rate limits are per worker.

## 11. Teammate suggestions

`GET /api/hackathons/{hid}/suggestions` ranks people for the caller's team.

**The group.** If the caller is in a team, the group is that team's members. If not, the group is the caller alone (a one-person team): `T` is the caller's skills and the time zone term compares against the caller only (review finding P1). The response `context.team_id` is null in that case.

Skill taxonomy (12, in `backend/app/core/skills.py`, also served by `GET /api/meta`):
`frontend, backend, mobile, ml, data, devops, cloud, design, product, security, blockchain, pitch`.
Core roles a balanced team wants: `frontend, backend, design, ml, devops, pitch`.

Definitions, with `G` = the group, `T` = union of skills in `G`, `C` = candidate skills, `M` = core roles minus `T`:

| Term | Formula |
|---|---|
| complement | `|C ∩ M| / |M|` if `M` is not empty, else `0.5 × |C − T| / |C|` (0 if `C` is empty) |
| timezone | min over members of `G` of `max(0, 9 − d) / 9`, where `d` is the circular hour distance between the two people's current UTC offsets (`min(|a − b|, 24 − |a − b|)`), assuming 9-hour working windows. Offsets come from each IANA time zone at the current instant (`zoneinfo`), so daylight saving is respected |
| completeness | `min(1, |C| / 3)` |
| redundancy | `|C ∩ T| / |C|` (0 if `C` is empty) |
| **score** | `clamp(0.6 × complement + 0.3 × timezone + 0.1 × completeness − 0.1 × redundancy, 0, 1)`, rounded to 3 decimals |

- Candidates: participants of `$h` with `looking = true`, not in any team, not in `G`. SQL: `ORDER BY (u.skills && $missing) DESC, p.registered_at DESC LIMIT 500`; time zones are scored in Python because offsets depend on the current instant.
- Scored in Python (pure functions in `suggestions/scoring.py`), top 20 returned. Ties: higher timezone, then smaller `user_id`.
- Each result returns the score, the four components and reasons, for example: "Covers backend, devops (missing in team)", "7 h working-hours overlap with every member", "Shares frontend with the team".
- Why not similarity matching: cosine similarity finds people with the same skills, which is the opposite of what a team needs (ADR-023).

## 12. Observability

- Logs: one JSON line per request (`ts, level, request_id, method, route, status, duration_ms, user_id`), plus ERROR lines for backstop hits and listener reconnects.
- `/metrics` (Prometheus text): request duration histogram per route, pool size/idle/waiting per pool, pool acquire wait histogram, transaction duration per route, counters for 503 by cause (`lock_timeout`, `pool_timeout`, `inflight_cap`, `deadlock_exhausted`), `cap_backstop_hits_total`, `deadlock_retries_total`, SSE connections gauge, cache hits/misses.
- `/healthz` (process up), `/readyz` (`SELECT 1` on the read pool).
- SQL tagged with `/* route:... */` and pools named with `application_name`, so `pg_stat_activity` shows who holds connections.

## 13. Frontend

- Vite + React 18 + TypeScript strict + React Router v6 + TanStack Query v5 + Tailwind CSS. No component library.
- Routes: `/login`, `/signup`, `/` (hackathon list), `/h/:hid` (board with Teams and People tabs), `/h/:hid/teams/new`, `/h/:hid/join` (enter code, also accepts `?code=`), `/teams/:tid` (members, requests, invite code, leave, finalize, audit), `/me` (profile: name, skills, time zone).
- `api/client.ts`: same-origin fetch with credentials, adds `Idempotency-Key` to mutations, parses the error envelope, retries network errors and 503 with the same key (max 3, `Retry-After` plus jitter).
- `hooks/useEventStream.ts`: one EventSource per hackathon, refetch on open, merge `team` events by version, keep tombstones, refetch People board on `people` events, refresh request lists on `request` events, handle `resync`.
- `lib/merge.ts`: `mergeTeam`, `mergeBoardPage` and the tombstone map, shared by event and refetch paths.
- Time zone: signup and profile default to the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`; shown as the current offset.
- Visual design: `PRODUCT.md` (who uses the app and for what) and `DESIGN.md` (tokens, type, spacing, components) are written before UI work.
- Optimistic updates for join, accept, leave with rollback on error. 409 messages in an `aria-live` region.
- Accessibility: real buttons, links and labels; visible focus; logical tab order and a skip link; 44 px touch targets; works at 360 px; one `aria-live="polite"` region per page; focus moves sensibly after accept, decline or remove.

## 14. Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — | Direct connection string for pools |
| `DATABASE_LISTEN_URL` | `DATABASE_URL` | Direct connection for LISTEN |
| `JWT_SECRET` | — | HS256 key (32+ random bytes) |
| `JWT_TTL_MIN` | `120` | Token lifetime |
| `COOKIE_SECURE` | `true` | `false` only for local HTTP |
| `READ_POOL_MAX` / `WRITE_POOL_MAX` | `10` / `10` | Pool sizes per worker |
| `POOL_ACQUIRE_TIMEOUT_S` | `1.0` | Acquire timeout |
| `WRITE_INFLIGHT_MAX` | `30` | In-flight write cap per worker |
| `BOARD_CACHE_TTL_MS` | `1000` | Micro-cache TTL |
| `SSE_HEARTBEAT_S` | `15` | Heartbeat interval |
| `SSE_MAX_STREAMS_PER_USER` | `3` | Stream cap |
| `RATE_CODE_PER_USER_MIN` / `RATE_CODE_PER_IP_MIN` | `5` / `20` | Invite brute-force limits |
| `RATE_LOGIN_PER_MIN` / `RATE_SIGNUP_PER_HOUR` / `RATE_MUTATIONS_PER_MIN` | `5` / `10` / `60` | Login per IP+email, signup per IP, mutations per user |
| `IDEMPOTENCY_TTL_H` | `24` | Key retention |
| `LOG_LEVEL` | `INFO` | Logging |
| `WEB_DIST_DIR` | `frontend/dist` | Built SPA served at `/` |

## 15. Deployment

| Piece | Choice |
|---|---|
| API + web | Render free web service, region Singapore, Docker image from the repo `Dockerfile`, 1 uvicorn worker |
| Database | Neon free Postgres 16, region AWS ap-southeast-1 (Singapore), direct connection string |
| Migrations | `database/migrate.py` runs at container start before uvicorn |
| Demo data | Small seed on the live DB: 1 hackathon, about 300 users, about 40 teams, 2 reviewer accounts (in README) |
| Keep warm | External ping to `/healthz` every 10 minutes (Render free sleeps after 15 minutes idle) through 30 Nov |
| Secrets | Render environment variables only |

Why Singapore: the organizers and most judges are likely in India; Singapore is the closest region both providers offer, and putting API and database in the same region keeps app-to-database round trips around 1 to 2 ms.

Verify on Friday: SSE is not buffered by the Render proxy, heartbeat keeps streams open, Neon resumes from scale-to-zero and the listener reconnects (resync path).

## 16. Local environment

Two options, same schema and tests:

- **Without Docker (dev machine default):** `database/dev_db.py start` runs PostgreSQL 16 from the `pgserver` package (bundled binaries, data in `.devdb/`, git-ignored) and prints its `DATABASE_URL`. `database/dev_db.py stop` stops it.
- **Docker Compose (CI and machines with Docker):**

- `postgres:16` with a health check, `max_connections=200`, data on a named volume.
- `api` built from the Dockerfile, `depends_on: postgres (healthy)`, 2 uvicorn workers, `restart: unless-stopped`.
- The chaos test runs uvicorn as a host subprocess against the Compose Postgres (see verification.md), so it can hard-kill the process portably.

## 17. Guarantees and their proof

Every guarantee the system makes, the mechanism that provides it, and the test that proves it through a real server and a real PostgreSQL.

| Guarantee | Mechanism | Proof |
|---|---|---|
| **Atomicity (all or nothing)** | One transaction per write (`run_write`); any rejection raises and rolls back; unexpected errors roll back too. The seat increment, membership, request transition, audit row and idempotency response commit together or not at all | T-GUAR-03 and T-GUAR-04 inject a failure into the last statement (audit insert) of a real join and accept: no seat, no member, request still pending, no stored key; the same key then succeeds. T-RACE-12, T-API-18 |
| **Consistency** | CHECK, UNIQUE and composite FK constraints (section 4); conditional UPDATE predicates; denormalized count updated in the same transaction | Invariant checker (I1 to I9) after every API and concurrency test, and on the fault database; T-RACE-03 shows the predicate holds even without the CHECK backstop |
| **Concurrency (isolation)** | READ COMMITTED with predicate re-check on the team row; one lock order (section 6.12); unique indexes for one team per hackathon and one pending request | T-RACE-01 to 19: 50-way last seat, negative control, overlaps, double accept, accept vs withdraw, requests while filling; `pg_stat_database.deadlocks` unchanged (T-RACE-15) |
| **Idempotency (retries)** | Key claimed first inside the transaction; success stored as exact JSON text in the same commit; no business pre-checks before the claim | T-API-26, 27, 28; T-RACE-10, 11, 12, 16 |
| **Queue wait under overload (fail fast, never hang)** | Write in-flight cap per worker (immediate 503); pool acquire timeout 1 s; `lock_timeout` 1 s; `statement_timeout` 3 s; all map to `503 busy` with `Retry-After: 1`; clients retry with the same key | T-GUAR-01: a 2-connection pool with a 4-request cap under a 40-request burst returns 503s in under 2 s, never 500; retries finish with exactly the right membership |
| **Per-user request limits** | Sliding windows per worker: mutations 60/min per user, failed invite codes 5/min per user and 20/min per IP, login 5/min per IP+email, signup 10/hour per IP; `429` with `Retry-After` | T-GUAR-02 (one user limited, another unaffected; login and signup limits), T-API-30, T-UNIT-07 |
| **Durability and crash safety** | PostgreSQL commit; an interrupted transaction is aborted by the server; nothing is held in process memory for correctness | T-CHAOS-01 (module 7) |
| **Fresh reads** | Board micro-cache 1 s, cleared on every change notification (module 6); ETag for unchanged pages | T-API-32; T-API-35 and B-2 regression in module 6 |
