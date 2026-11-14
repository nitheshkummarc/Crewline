"""Fixtures for the test database, a real API server and per-test cleanup.

Contents:
    admin_url: Return a server URL from TEST_DATABASE_URL, or start the local test instance (database/dev_db.py).
    server_url: Return the PostgreSQL server URL used by the test session.
    db_url: Create a fresh test database with all migrations applied.
    fake_web_build: Write a minimal built web app (index.html and one hashed asset) so SPA serving is tested without
        npm.
    server: Run one real API server for the whole session (serving a small fake web build) and return its base URL.
    users: Factory for signed-up users; closes their clients after the test.
    truncate: Remove all rows from every application table.
    clean_db: Empty the database before a test and assert the invariants after it.
"""

import asyncio
import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import asyncpg
import pytest
from helpers import Users
from invariants import run_checks
from serverctl import create_database, start_server, stop_server

TEST_DB = "crewline_test"
TABLES = ("audit_events, idempotency_keys, join_requests, memberships, teams, "
          "participants, users, hackathons")


def admin_url() -> str:
    """Return a server URL from TEST_DATABASE_URL, or start the local test instance (database/dev_db.py)."""
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        return url
    import dev_db

    return dev_db.start("test")


@pytest.fixture(scope="session")
def server_url() -> str:
    """Return the PostgreSQL server URL used by the test session."""
    return admin_url()


@pytest.fixture(scope="session")
def db_url(server_url: str) -> str:
    """Create a fresh test database with all migrations applied."""
    return asyncio.run(create_database(server_url, TEST_DB))


def fake_web_build(root: Path) -> Path:
    """Write a minimal built web app (index.html and one hashed asset) so SPA serving is tested without npm."""
    (root / "assets").mkdir()
    (root / "index.html").write_text("<!doctype html><title>Crewline</title><div id=root></div>", encoding="utf-8")
    (root / "assets" / "index-abc123.js").write_text("console.log(1)", encoding="utf-8")
    return root


@pytest.fixture(scope="session")
def server(db_url: str, tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    """Run one real API server for the whole session (serving a small fake web build) and return its base URL."""
    log_path = tmp_path_factory.mktemp("server") / "server.log"
    proc, base = start_server(db_url, log_path, {"WEB_DIST_DIR": str(fake_web_build(tmp_path_factory.mktemp("web")))})
    yield base
    stop_server(proc)


@pytest.fixture
async def users(server: str) -> AsyncIterator[Users]:
    """Factory for signed-up users; closes their clients after the test."""
    factory = Users(server)
    yield factory
    await factory.close()


async def truncate(db_url: str) -> None:
    """Remove all rows from every application table."""
    conn = await asyncpg.connect(db_url)
    try:
        await conn.execute(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE")
    finally:
        await conn.close()


@pytest.fixture
def clean_db(db_url: str) -> Iterator[str]:
    """Empty the database before a test and assert the invariants after it."""
    asyncio.run(truncate(db_url))
    yield db_url
    violations = asyncio.run(run_checks(db_url))
    assert not violations, f"invariant violations: {violations}"
