# Crewline

Race-proof team formation service for a 10,000-participant hackathon. Hack4Hack Crew Hiring Challenge 2026, Problem Statement 1.
When 50 people race for the last seat, exactly one gets it, and retries, crashes and overlapping operations never leave the data invalid.

[![CI](https://github.com/nitheshkummarc/Crewline/actions/workflows/ci.yml/badge.svg)](https://github.com/nitheshkummarc/Crewline/actions/workflows/ci.yml)

Status: in development. The live URL is added after deploy. CI runs lint, API tests, the race tests (20 rounds), web tests, Playwright flows and a k6 smoke run against a real PostgreSQL 16 on every push.

## Project layout

| Folder | Contents |
|---|---|
| `backend/` | FastAPI service (`app/`), tests (`tests/api`, `tests/concurrency`, `tests/unit`) |
| `database/` | SQL migrations, migration runner, invariant checker, local dev PostgreSQL |
| `frontend/` | React + TypeScript app (`src/`), Playwright flows (`e2e/`), see [frontend/README.md](frontend/README.md) |
| `docs/` | Architecture, decisions, API, verification, plan, bug diary |

## Run it

Without Docker (uses PostgreSQL 16 binaries bundled in the `pgserver` package):

```
uv sync --project backend
uv run --project backend pytest backend/tests -q        # starts the test database, runs all tests including the races
uv run --project backend python database/dev_db.py start  # local dev database, prints DATABASE_URL
```

With Docker: `docker compose up -d --build` (or `make up`) starts PostgreSQL 16 and the API, which applies migrations and serves the web app at http://localhost:8000. A fresh database has no hackathon; add demo data with `docker compose exec api python database/seed.py --users 300 --teams 40` (password `crewline-demo-1`, users `user00000@example.com` and up).

## Commands

On Windows without make, run the raw commands (uv is installed with `pip install uv`).

| Task | Raw command |
|---|---|
| PostgreSQL + API with Docker (`make up`, `make down`) | `docker compose up -d --build`, `docker compose down` |
| Local Postgres without Docker | `uv run --project backend python database/dev_db.py start` (prints `DATABASE_URL`; `stop` to stop) |
| Apply migrations | `uv run --project backend python database/migrate.py` |
| API dev server | `uv run --project backend uvicorn --factory app.main:create_app --reload --app-dir backend` |
| All backend tests | `uv run --project backend pytest backend/tests` |
| Race and guarantee tests only | `uv run --project backend pytest backend/tests/concurrency -q` |
| Invariant checker | `uv run --project backend python database/invariants.py` |
| Lint and types | `uv run --project backend ruff check backend database` and, inside `backend/`, `uv run mypy app` (mypy reads its settings from backend/pyproject.toml) |
| Seed 10k users / 2k teams | `JWT_SECRET=... uv run --project backend python database/seed.py --url <db> --tokens loadtest/tokens.json` |
| Latency of every endpoint | `uv run --project backend python backend/scripts/latency_probe.py --base <api> --server-log <api log>` |
| Chaos test (kills the API 3 times) | `uv run --project backend python backend/scripts/chaos.py` |
| Load tests (k6) | `k6 run -e BASE_URL=<api> loadtest/board.js` (also `mixed.js`, `soak.js`) |
| Web contrast check | `node frontend/scripts/contrast.mjs` |
| Web: install, dev server | `npm --prefix frontend ci`, `npm --prefix frontend run dev` |
| Web: type check, lint, tests, build | `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`, `npm --prefix frontend test`, `npm --prefix frontend run build` |
| Web: end-to-end (needs a running API, see frontend/README.md) | `npm --prefix frontend run e2e` |

Run `npm --prefix frontend run build` before starting the API to serve the web app at `/`.

## What to look at

| Topic | Where |
|---|---|
| One-page design | [docs/design.md](docs/design.md) |
| Full architecture and every transaction | [docs/architecture.md](docs/architecture.md) |
| Decisions and rejected alternatives | [docs/decisions.md](docs/decisions.md) |
| API | [docs/api.md](docs/api.md) |
| How each claim is proven | [docs/verification.md](docs/verification.md) |
| Load test results | [docs/load-report.md](docs/load-report.md) |
| Bugs found and fixed | [docs/bug-diary.md](docs/bug-diary.md) |
| See the guarantees live | Sign in and open `/lab` (Race lab): a traced join statement by statement, N people racing for the last seat, one person spamming join, the request queue, measured latency |

## Stack

FastAPI (Python 3.11+, asyncpg, raw SQL) · PostgreSQL 16 locally, 18 on Neon (CI tests both) · React + TypeScript + TanStack Query · SSE · k6 · Docker Compose · GitHub Actions.

## Reviewer accounts (live demo)

TBD after deploy.

## Known gaps

No CAPTCHA at signup (a form token and a honeypot stop simple scripts) · logout does not revoke a token before expiry · rate limits are per worker · no organizer UI.
