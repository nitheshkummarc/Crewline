"""Concurrency test fixtures: clean database per test and a deadlock check for the whole suite."""

import asyncio
from collections.abc import Iterator

import asyncpg
import pytest


async def _deadlocks(db_url: str) -> int:
    """Return the deadlock counter of the test database."""
    conn = await asyncpg.connect(db_url)
    try:
        return await conn.fetchval("SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()")
    finally:
        await conn.close()


@pytest.fixture(autouse=True)
def _clean(clean_db: str) -> str:
    """Apply clean_db to every concurrency test."""
    return clean_db


@pytest.fixture(scope="session", autouse=True)
def no_deadlocks(db_url: str) -> Iterator[None]:
    """T-RACE-15: the deadlock counter must not increase during the concurrency suite."""
    before = asyncio.run(_deadlocks(db_url))
    yield
    after = asyncio.run(_deadlocks(db_url))
    assert after == before, f"deadlocks increased from {before} to {after}"
