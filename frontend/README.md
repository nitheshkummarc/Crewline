# Crewline frontend

React app for Crewline: sign up, register for a hackathon, live teams and people boards, create or join a team, join requests, leader actions, suggestions and profile.

Status: planned (module 8 in [docs/plan.md](../docs/plan.md)). The backend API it uses is complete and documented in [docs/api.md](../docs/api.md).

## Stack

Vite, React 18, TypeScript (strict), React Router v6, TanStack Query v5, Tailwind CSS, Vitest. Built output (`frontend/dist`) is served by the backend from the same origin, so the session cookie and the event stream need no CORS.

## Planned structure

```
frontend/src/
  api/          client.ts (fetch wrapper: Idempotency-Key, error envelope, 503 retry), endpoints.ts, types.ts
  hooks/        useEventStream.ts (SSE: merge by version, tombstones, resync), query and mutation hooks
  pages/        Login, Signup, Hackathons, Board, CreateTeam, Join, Team, Profile
  components/   TeamCard, PersonCard, MemberList, RequestList, InviteCodeBox, SkillPicker, LiveRegion, Layout
  lib/          merge.ts (version merge, tombstones), keys.ts (query keys), time.ts (IANA zones)
```

Behavior and accessibility requirements are in [docs/architecture.md](../docs/architecture.md) section 13.
