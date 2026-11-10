"""Apply SQL migrations in order.

Usage: python database/migrate.py [--url URL]   (default: $DATABASE_URL)
"""

import argparse
import asyncio
import os
from pathlib import Path

import asyncpg

MIGRATIONS = Path(__file__).resolve().parent / "migrations"


async def apply_migrations(url: str) -> list[str]:
    """Apply files not yet in schema_migrations; return the versions applied."""
    conn = await asyncpg.connect(url)
    applied: list[str] = []
    try:
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            " version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())")
        await conn.execute("SELECT pg_advisory_lock(727001)")
        done = {r["version"] for r in await conn.fetch("SELECT version FROM schema_migrations")}
        for path in sorted(MIGRATIONS.glob("*.sql")):
            version = path.stem
            if version in done:
                continue
            async with conn.transaction():
                await conn.execute(path.read_text(encoding="utf-8"))
                await conn.execute("INSERT INTO schema_migrations (version) VALUES ($1)", version)
            applied.append(version)
        await conn.execute("SELECT pg_advisory_unlock(727001)")
    finally:
        await conn.close()
    return applied


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.environ.get("DATABASE_URL"))
    args = parser.parse_args()
    if not args.url:
        raise SystemExit("set DATABASE_URL or pass --url")
    applied = asyncio.run(apply_migrations(args.url))
    print("applied:", ", ".join(applied) if applied else "nothing (up to date)")


if __name__ == "__main__":
    main()
