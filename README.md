# Crewline

Race-proof team formation service for a 10,000-participant hackathon. Hack4Hack Crew Hiring Challenge 2026, Problem Statement 1.
When 50 people race for the last seat, exactly one gets it, and retries, crashes and overlapping operations never leave the data invalid.

Status: in development. CI badge and live URL are added once available.

## Project layout

| Folder | Contents |
|---|---|
| `backend/` | FastAPI service (`app/`), tests (`tests/api`, `tests/concurrency`, `tests/unit`) |
| `database/` | SQL migrations, migration runner, invariant checker, local dev PostgreSQL |
| `frontend/` | React + TypeScript app (in progress) |
| `docs/` | Architecture, decisions, API, verification, plan, bug diary |

## Run it

Without Docker (uses PostgreSQL 16 binaries bundled in the `pgserver` package):

```
uv sync --project backend
uv run --project backend pytest backend/tests -q        # starts the test database, runs all tests including the races
uv run --project backend python database/dev_db.py start  # local dev database, prints DATABASE_URL
```

With Docker (planned): `docker compose up -d --build`. All commands are in [CLAUDE.md](CLAUDE.md).

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

## Stack

FastAPI (Python 3.11+, asyncpg, raw SQL) · PostgreSQL 16 · React + TypeScript + TanStack Query · SSE · k6 · Docker Compose · GitHub Actions.

## Reviewer accounts (live demo)

TBD after deploy.

## Known gaps

No CAPTCHA at signup · logout does not revoke a token before expiry · rate limits are per worker · no organizer UI.
