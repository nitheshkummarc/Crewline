# Crewline web app

React app for Crewline: sign up, register for a hackathon, live teams and people boards, create or join a team, join requests, leader actions, suggestions and profile. The built output (`frontend/dist`) is served by the API from the same origin, so the session cookie and the event stream need no CORS.

## Commands

Run from the repository root (or drop `--prefix frontend` inside this folder).

| Task | Command |
|---|---|
| Install | `npm --prefix frontend ci` |
| Dev server (proxies `/api` to `http://127.0.0.1:8000`, override with `CREWLINE_API`) | `npm --prefix frontend run dev` |
| Type check | `npm --prefix frontend run typecheck` |
| Lint (typescript-eslint strict, react-hooks, jsx-a11y) | `npm --prefix frontend run lint` |
| Unit and component tests (Vitest, T-WEB-01 to 08) | `npm --prefix frontend test` |
| Production build (set `CREWLINE_PUBLIC_URL` for the preview image URLs) | `npm --prefix frontend run build` |
| End-to-end tests (Playwright, E2E-01 to 07) | `npm --prefix frontend run e2e` |
| Contrast check of the color tokens | `node frontend/scripts/contrast.mjs` |
| Re-render favicons and the preview image | `node frontend/scripts/make-images.mjs` |

End-to-end tests need a running API that serves the build, on seeded data, with relaxed signup and login limits (as the pytest server uses), for example:

```
uv run --project backend python database/seed.py --users 300 --teams 40
RATE_SIGNUP_PER_HOUR=100000 RATE_LOGIN_PER_MIN=100000 COOKIE_SECURE=false \
  uv run --project backend uvicorn --factory app.main:create_app --app-dir backend --port 8000
npm --prefix frontend run e2e            # E2E_BASE_URL defaults to http://127.0.0.1:8000
```

Locally Playwright uses the installed Chrome; set `PW_CHANNEL=chromium` after `npx playwright install chromium` on machines without Chrome.

## Structure

```
src/
  api/          client.ts (fetch, Idempotency-Key, error envelope, 503 retry), endpoints.ts (every /api route), types.ts
  hooks/        queries, mutations (optimistic accept and leave), useEventStream (SSE merge by version), useBotCheckedSubmit
  pages/        one file per route, TeamSections for team page sections that own their data
  components/   presentational: board rows, seat strip, flap text, fields, buttons, dialogs, error notice, live region
  lib/          merge (versions, tombstones), keys, validation (zod, same limits as the API), errors, skills, time
  styles/       tokens.css (theme tokens), index.css
  test/         Vitest setup and fixtures
e2e/            Playwright flows
scripts/        contrast checker, image renderer
```

Behavior, accessibility and visual rules are in [docs/architecture.md](../docs/architecture.md) section 13; every file and function is listed in [docs/CODEMAP.md](../docs/CODEMAP.md).
