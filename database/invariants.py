"""Invariant checker: runs every query in invariants.sql; each must return zero rows.

Usage: python database/invariants.py [--url URL]   (default: $DATABASE_URL); exits 1 on any violation.

Contents:
    load_checks: Return (id, description, query) for each invariant block.
    run_checks: Run every invariant query and return violations keyed by invariant id.
    main: Print violations and exit non-zero if any.
"""

import argparse
import asyncio
import os
import re
from pathlib import Path

import asyncpg

SQL_FILE = Path(__file__).resolve().parent / "invariants.sql"


def load_checks() -> list[tuple[str, str, str]]:
    """Return (id, description, query) for each invariant block."""
    parts = re.split(r"(?m)^-- (I\d+): ", SQL_FILE.read_text(encoding="utf-8"))[1:]
    checks = []
    for ident, body in zip(parts[0::2], parts[1::2], strict=True):
        description, _, query = body.partition("\n")
        checks.append((ident, description.strip(), query.strip().rstrip(";")))
    return checks


async def run_checks(url: str) -> dict[str, list[dict]]:
    """Run every invariant query and return violations keyed by invariant id."""
    conn = await asyncpg.connect(url)
    try:
        violations: dict[str, list[dict]] = {}
        for ident, _, query in load_checks():
            rows = await conn.fetch(query)
            if rows:
                violations[ident] = [dict(r) for r in rows[:20]]
        return violations
    finally:
        await conn.close()


def main() -> None:
    """Print violations and exit non-zero if any."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.environ.get("DATABASE_URL"))
    args = parser.parse_args()
    if not args.url:
        raise SystemExit("set DATABASE_URL or pass --url")
    violations = asyncio.run(run_checks(args.url))
    for ident, description, _ in load_checks():
        status = f"FAIL ({len(violations[ident])} rows)" if ident in violations else "ok"
        print(f"{ident:<4} {status:<16} {description}")
    if violations:
        for ident, rows in violations.items():
            print(ident, rows)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
