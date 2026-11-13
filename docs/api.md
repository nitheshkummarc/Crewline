# API reference

Base path `/api`. JSON in and out (`application/json`, UTF-8). Times are ISO 8601 UTC. IDs are UUIDs.
Transactions behind each write are in [architecture.md](architecture.md) section 6.

## Conventions

| Item | Rule |
|---|---|
| Auth | Cookie `crewline_session` (httpOnly JWT). Endpoints marked "auth" return 401 `unauthenticated` without it |
| Idempotency | Every `POST`, `PATCH`, `DELETE` requires `Idempotency-Key` (16 to 64 chars, `[A-Za-z0-9_-]`) except signup, login, logout and the Race lab runs (each run is a new experiment) |
| Request ID | `X-Request-ID` accepted or generated; echoed in the response header and error body |
| Pagination | `?limit=` (default 20, max 50) and `?cursor=` (opaque). Responses: `{"items": [...], "next_cursor": "..." | null}` |
| Caching | Board responses carry `ETag`; send `If-None-Match` to get 304 |
| Errors | `{"error": {"code": "team_full", "message": "Team is full", "request_id": "..."}}` |
| Headers | Every response carries the security headers in architecture.md section 10 (CSP, HSTS, nosniff, Referrer-Policy) |

## Error codes

| Status | Code | When | Client retries? |
|---|---|---|---|
| 400 | `validation_error` | Body, query or path fails validation (custom handler; FastAPI's default 422 is not used) | No |
| 400 | `bot_check_failed` | Signup or login with a filled honeypot, a missing, forged or expired form token, or submitted under 2 s after the token was issued | No (fetch a new form token) |
| 400 | `idempotency_key_required` | Mutation without a valid `Idempotency-Key` | No |
| 401 | `unauthenticated` | Missing, invalid or expired session | No (log in) |
| 401 | `invalid_credentials` | Wrong email or password | No |
| 403 | `not_leader` | Leader-only action by a non-leader | No |
| 403 | `members_only` | Team-private data requested by a non-member | No |
| 404 | `not_found` | Resource does not exist | No |
| 404 | `invite_invalid` | Unknown, malformed or expired invite code (identical body for all) | No |
| 409 | `email_taken` | Signup with an existing email | No |
| 409 | `not_registered` | Not a participant of this hackathon | No |
| 409 | `already_in_team` | Already in another team in this hackathon | No |
| 409 | `team_full` | No seat left | No |
| 409 | `team_finalized` | Team is finalized (no joins, already finalized) | No |
| 409 | `not_finalized` | Reopen on a forming team | No |
| 409 | `below_min_size` | Finalize below min size | No |
| 409 | `request_not_pending` | Request already decided | No |
| 409 | `not_a_member` | Leave or remove a non-member | No |
| 409 | `cannot_remove_self` | Leader removes themselves (use leave) | No |
| 409 | `too_many_pending_requests` | Already 5 pending requests in this hackathon (exact limit) | No |
| 422 | `idempotency_key_mismatch` | Same key, different request | No |
| 429 | `rate_limited` | Rate limit hit; `Retry-After` set | After delay |
| 503 | `busy` | Lock timeout, statement or read timeout, pool timeout, in-flight cap, deadlock retries exhausted, lost or unresponsive database connection; `Retry-After` set | Yes, same key |
| 500 | `internal_error` | Bug | No |

## Shared types

```ts
type Skill = 'frontend' | 'backend' | 'mobile' | 'ml' | 'data' | 'devops' | 'cloud'
  | 'design' | 'product' | 'security' | 'blockchain' | 'pitch';

interface User { id: string; email: string; display_name: string; skills: Skill[]; timezone: string; }  // IANA, e.g. "Asia/Kolkata"
interface PublicUser { user_id: string; display_name: string; skills: Skill[]; timezone: string; }

interface TeamSummary {             // same shape as team_snapshot() and SSE events
  id: string; hackathon_id: string; name: string;
  member_count: number; min_size: number; max_size: number;
  status: 'forming' | 'finalized'; looking: boolean; leader_id: string;
  version: number; created_at: string; skills: Skill[];
}
interface Member extends PublicUser { joined_at: string; is_leader: boolean; }
interface TeamDetail extends TeamSummary { members: Member[]; }

interface JoinRequest {
  id: string; team_id: string; team_name: string; user_id: string; display_name: string; message: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'stale';
  created_at: string; decided_at: string | null;
}

interface Hackathon { id: string; name: string; min_team_size: number; max_team_size: number; invite_ttl_hours: number; }

interface Suggestion extends PublicUser {
  score: number;
  breakdown: { complement: number; timezone: number; completeness: number; redundancy: number };
  reasons: string[];
}

interface AuditEvent { seq: number; action: string; actor_id: string | null; created_at: string; payload: Record<string, unknown>; }
```

## Meta and ops

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/meta` | no | `{skills: Skill[], core_roles: Skill[]}` |
| GET | `/healthz` | no | `{"ok": true}` |
| GET | `/readyz` | no | `{"ok": true}` after `SELECT 1`, else 503 |
| GET | `/metrics` | no | Prometheus text |

## Auth and profile

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/auth/form-token` | - | 200 `{token}` (`Cache-Control: no-store`) | - |
| POST | `/api/auth/signup` | `{email, password (8..128), display_name (1..60), skills? (max 12), timezone? (IANA; default `UTC`), form_token, company?}` | 201 `User`, sets cookie | 400 `validation_error` / `bot_check_failed`, 409 `email_taken`, 429 |
| POST | `/api/auth/login` | `{email, password, form_token, company?}` | 200 `User`, sets cookie | 400 `validation_error` / `bot_check_failed`, 401 `invalid_credentials`, 429 |
| POST | `/api/auth/logout` | - | 204, clears cookie | - |
| GET | `/api/auth/me` | - | 200 `User` | 401 |
| PATCH | `/api/users/me` | `{display_name?, skills?, timezone?}` | 200 `User`; bumps the version of the user's teams and publishes `team` and `people` events | 400, 401, 422, 503 |

Bot check on signup and login (ADR-037): the form fetches `form_token` when it renders. The server rejects the submit with 400 `bot_check_failed` when the token has a bad signature, is older than 2 hours or younger than 2 seconds, or when the hidden honeypot field `company` is not empty. The check runs before the rate limits, so failed bot posts do not use up a shared IP's quota.

## Hackathons

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/hackathons` | - | 200 `Hackathon[]` (the hidden Race lab hackathon is not listed) | 401 |
| GET | `/api/hackathons/{hid}` | - | 200 `Hackathon` | 401, 404 |
| POST | `/api/hackathons/{hid}/register` | - | 200 `{registered: true, looking}` (idempotent); publishes a `people` event when newly registered | 401, 404 |
| GET | `/api/hackathons/{hid}/me` | - | 200 `{registered, looking, team: TeamSummary \| null, pending_requests: JoinRequest[]}` | 401, 404 |
| PATCH | `/api/hackathons/{hid}/me` | `{looking: boolean}` | 200 same as above; publishes a `people` event when the flag changes | 401, 404, 409 `not_registered`, 422, 503 |

## Board

| Method | Path | Query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/hackathons/{hid}/board/teams` | `limit`, `cursor` | 200 `{items: TeamSummary[], next_cursor}` + `ETag` | 400, 401, 404, 304 |
| GET | `/api/hackathons/{hid}/board/people` | `limit`, `cursor` | 200 `{items: PublicUser[], next_cursor}` + `ETag` | 400, 401, 404, 304 |

Teams board lists teams that are `forming`, `looking` and not full, newest first. People board lists participants with `looking = true` and no team.

## Teams

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/hackathons/{hid}/teams` | `{name}` | 201 `TeamDetail` | 400, 401, 404, 409 `not_registered` / `already_in_team`, 422, 503 |
| GET | `/api/teams/{tid}` | - | 200 `TeamDetail` | 401, 404 |
| PATCH | `/api/teams/{tid}` | `{name?, looking?}` | 200 `TeamDetail` | 400, 401, 403 `not_leader`, 404, 422, 503 |
| POST | `/api/teams/join` | `{code}` | 200 `TeamDetail` (also when already a member of that team) | 400, 401, 404 `invite_invalid`, 409 `team_full` / `team_finalized` / `already_in_team` / `not_registered`, 422, 429, 503 |
| POST | `/api/teams/{tid}/leave` | - | 200 `{team: TeamDetail \| null}` (null when deleted) | 401, 404, 409 `not_a_member`, 422, 503 |
| DELETE | `/api/teams/{tid}/members/{uid}` | - | 200 `TeamDetail` | 401, 403 `not_leader`, 404, 409 `not_a_member` / `cannot_remove_self`, 422, 503 |
| POST | `/api/teams/{tid}/finalize` | - | 200 `TeamDetail` | 401, 403, 404, 409 `below_min_size` / `team_finalized`, 422, 503 |
| POST | `/api/teams/{tid}/reopen` | - | 200 `TeamDetail` | 401, 403, 404, 409 `not_finalized`, 422, 503 |
| GET | `/api/teams/{tid}/invite` | - | 200 `{code: "ABCDE-FGHJK", expires_at}` | 401, 403 `members_only`, 404 |
| POST | `/api/teams/{tid}/invite/regenerate` | - | 200 `{code, expires_at}` | 401, 403 `not_leader`, 404, 422, 503 |
| GET | `/api/teams/{tid}/audit` | `limit`, `cursor` | 200 `{items: AuditEvent[], next_cursor}` | 401, 403 `members_only`, 404 |

## Join requests

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/teams/{tid}/requests` | `{message?}` (≤ 280) | 201 `JoinRequest`, or 200 with the existing pending one | 400, 401, 404, 409 `team_full` / `team_finalized` / `already_in_team` / `not_registered` / `too_many_pending_requests`, 422, 503 |
| GET | `/api/teams/{tid}/requests` | - | 200 `JoinRequest[]` (pending, oldest first, hides users already in a team) | 401, 403 `not_leader`, 404 |
| GET | `/api/hackathons/{hid}/my-requests` | - | 200 `JoinRequest[]` (all statuses, newest first, max 50) | 401, 404 |
| POST | `/api/requests/{rid}/accept` | - | 200 `TeamDetail` | 401, 403 `not_leader`, 404, 409 `team_full` / `team_finalized` / `request_not_pending` / `already_in_team`, 422, 503 |
| POST | `/api/requests/{rid}/decline` | - | 200 `JoinRequest` | 401, 403, 404, 409 `request_not_pending`, 422, 503 |
| POST | `/api/requests/{rid}/withdraw` | - | 200 `JoinRequest` | 401, 404, 409 `request_not_pending`, 422, 503 |

A request is only created for a forming team with a free seat, but the team may fill afterwards. Such requests stay pending; the UI shows them with accept disabled while the team is full, and accepting returns 409 `team_full`.

## Suggestions

| Method | Path | Query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/hackathons/{hid}/suggestions` | `limit` (default 20, max 50) | 200 `{context: {team_id \| null, missing_roles: Skill[]}, items: Suggestion[]}`. Without a team, the caller alone is the group (`team_id` null) | 401, 404, 409 `not_registered` |

## Realtime

`GET /api/events?hackathon_id={hid}` (auth) returns `text/event-stream`. Max 3 streams per user (429 beyond).

```
event: team
data: {"seq":1234,"action":"member_joined_via_code","team_id":"...","version":7,"team":{...TeamSummary}}

event: team
data: {"seq":1240,"action":"team_deleted","team_id":"...","version":9,"team":null}

event: people
data: {"seq":1236,"action":"participant_updated"}

event: request                      (only to the team's members and the requester)
data: {"seq":1235,"action":"request_created","team_id":"...","request_id":"..."}

event: resync
data: {}

: ping
```

No `id:` field is sent, so browsers do not send `Last-Event-ID`; reconnect recovery is a refetch (ADR-018).

Client rules:
- Refetch on every open.
- `team`: apply only if `version` is newer than cached. `team: null` removes the team and records a tombstone `{team_id: version}`; any later snapshot of that team with a lower version is ignored.
- `people`: refetch the People board and suggestions.
- `request`: refresh the request list of that team and the caller's own requests.
- `resync`: invalidate everything for the hackathon.

## Race lab

Real concurrent experiments in a hidden lab hackathon, for showing the guarantees (ADR-040). Auth required; off when `LAB_ENABLED=false` (404). One experiment at a time per worker (503 `busy` otherwise); 6 runs per user per minute and 120 per hour in total (429). Sizes above `LAB_MAX_ATTEMPTS` (default 200) return 400.

| Method | Path | Body | Success |
|---|---|---|---|
| GET | `/api/lab` | - | 200 `{enabled, hackathon_id, max_attempts}` |
| POST | `/api/lab/race` | `{attempts}` (2 to max) | 200: a team with 3 of 4 seats taken, `attempts` people join by code at the same instant. Per attempt `{racer, status, code, replayed, started_ms, finished_ms, retries}`, `summary {winners, team_full, other, busy_retries}`, `facts {member_count, max_size, memberships, join_events}`, `elapsed_ms` |
| POST | `/api/lab/spam` | `{clicks}` (2 to 50) | 200: one person joins `clicks` times at once with one key (`same_key`), another with a new key per click (`new_keys`). Per click `{status, replayed, same_body, ...}` and per person `facts {memberships, join_events, stored_keys}` |
| POST | `/api/lab/queue` | `{requests}` (2 to max) | 200: `requests` people ask to join a 3 of 4 team at once; `queue` in the order the leader sees it (`position`, `after_first_ms`), `decisions` for accepting the first two (200, then 409 `team_full`), `facts` |
| POST | `/api/lab/walkthrough` | - | 200: three traced joins (`join`, `retry` with the same key, `full`), each `{status, code, replayed, server_ms, steps[]}` with every SQL statement run: `{label, why, sql, pool, at_ms, gap_ms}` |
| GET | `/api/lab/latency` | - | 200 `{routes: [{route, count, p50_ms, p95_ms, p99_ms, max_ms}], window, pools, transactions}` from the last 1,000 requests per route |

Synthetic lab users cannot log in (no valid password hash) and are never listed outside the lab.

## Rate limits

| Limit | Value | Key |
|---|---|---|
| Failed invite code attempts | 5/min | user |
| Failed invite code attempts | 20/min | IP |
| Login | 5/min | IP + email |
| Signup | 10/hour | IP |
| All mutations | 60/min | user |
| SSE streams | 3 concurrent | user |
| Race lab runs | 6/min per user, 120/hour in total, one at a time per worker | user, global |
