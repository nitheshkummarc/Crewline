"""Fixtures for the test database, a real API server and per-test cleanup."""

import asyncio
import os
import socket
import subprocess
import sys
import time
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import asyncpg
import httpx
import pytest
from helpers import SERVER_ENV, Users
from invariants import run_checks
from migrate import apply_migrations

ROOT = Path(__file__).resolve().parents[2]
API_DIR = ROOT / "backend"
TEST_DB = "crewline_test"
TABLES = ("audit_events, idempotency_keys, join_requests, memberships, teams, "
          "participants, users, hackathons")



def _admin_url() -> str:
    """Return a server URL from TEST_DATABASE_URL, or start the local pgserver test instance."""
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        return url
    import dev_db

    return dev_db.start("test")


def _database_url(admin_url: str, name: str) -> str:
    """Return the admin URL pointed at another database."""
    parts = urlparse(admin_url)
    return urlunparse(parts._replace(path=f"/{name}"))


def _free_port() -> int:
    """Return a free local TCP port."""
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="session")
def db_url() -> str:
    """Create a fresh test database with all migrations applied."""
    admin = _admin_url()
    url = _database_url(admin, TEST_DB)

    async def setup() -> None:
        conn = await asyncpg.connect(admin)
        try:
            await conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)")
            await conn.execute(f"CREATE DATABASE {TEST_DB}")
        finally:
            await conn.close()
        await apply_migrations(url)

    asyncio.run(setup())
    return url


def start_server(db_url: str, log_path: Path, extra_env: dict[str, str] | None = None) -> tuple[subprocess.Popen, str]:
    """Start uvicorn as a subprocess and wait until /readyz answers."""
    port = _free_port()
    env = {**os.environ, **SERVER_ENV, "DATABASE_URL": db_url, **(extra_env or {})}
    log = open(log_path, "ab")  # noqa: SIM115
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "--factory", "app.main:create_app", "--app-dir", str(API_DIR),
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        env=env, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{port}"
    deadline = time.time() + 40
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f"server exited early, see {log_path}")
        try:
            if httpx.get(f"{base}/readyz", timeout=1).status_code == 200:
                return proc, base
        except httpx.HTTPError:
            pass
        time.sleep(0.2)
    proc.kill()
    raise RuntimeError(f"server did not become ready, see {log_path}")


def stop_server(proc: subprocess.Popen) -> None:
    """Stop a server subprocess."""
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


@pytest.fixture(scope="session")
def server(db_url: str, tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    """Run one real API server for the whole session and return its base URL."""
    log_path = tmp_path_factory.mktemp("server") / "server.log"
    proc, base = start_server(db_url, log_path)
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
