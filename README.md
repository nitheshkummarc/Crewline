# Crewline

Race-proof team formation service for a 10,000-participant hackathon. Hack4Hack Crew Hiring Challenge 2026, Problem Statement 1.
When 50 people race for the last seat, exactly one gets it, and retries, crashes and overlapping operations never leave the data invalid.

Status: in development. CI badge and live URL are added once available.

## Run it

```
docker compose up -d --build          # Postgres 16 + API serving the web app on http://localhost:8000
make race                             # 50-way last-seat race test and the negative control
make invariants                       # database invariant checker
```

Without make (Windows): see the command table in [CLAUDE.md](CLAUDE.md).

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
