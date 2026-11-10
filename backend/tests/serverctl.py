"""Start and stop real API servers and create databases for tests."""

import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import asyncpg
import httpx
from helpers import SERVER_ENV
from migrate import apply_migrations

ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"


def database_url(server_url: str, name: str) -> str:
    """Return a server URL pointed at another database."""
    return urlunparse(urlparse(server_url)._replace(path=f"/{name}"))


async def create_database(server_url: str, name: str) -> str:
    """Drop and recreate a database, apply all migrations, and return its URL."""
    conn = await asyncpg.connect(database_url(server_url, "postgres"))
    try:
        await conn.execute(f"DROP DATABASE IF EXISTS {name} WITH (FORCE)")
        await conn.execute(f"CREATE DATABASE {name}")
    finally:
        await conn.close()
    url = database_url(server_url, name)
    await apply_migrations(url)
    return url


def free_port() -> int:
    """Return a free local TCP port."""
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def start_server(db_url: str, log_path: Path, extra_env: dict[str, str] | None = None) -> tuple[subprocess.Popen, str]:
    """Start uvicorn as a subprocess and wait until /readyz answers."""
    port = free_port()
    env = {**os.environ, **SERVER_ENV, "DATABASE_URL": db_url, **(extra_env or {})}
    log = open(log_path, "ab")  # noqa: SIM115
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "--factory", "app.main:create_app", "--app-dir", str(BACKEND_DIR),
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
