"""Read and write asyncpg pools."""

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

import asyncpg
import orjson

from app.config import Settings
from app.core.errors import Busy, DomainError
from app.db import trace
from app.db.errors import is_busy

log = logging.getLogger("crewline.db")

# Client-side bound per statement, above the server timeouts (write 3 s, read 2 s).
COMMAND_TIMEOUT_S = 5.0


async def init_connection(conn: asyncpg.Connection) -> None:
    """Register orjson codecs for json/jsonb and decode uuid to the standard uuid.UUID (orjson-serializable)."""
    for typename in ("json", "jsonb"):
        await conn.set_type_codec(
            typename, schema="pg_catalog",
            encoder=lambda value: orjson.dumps(value, default=str).decode(), decoder=orjson.loads)
    await conn.set_type_codec("uuid", schema="pg_catalog", encoder=str, decoder=uuid.UUID, format="text")


@dataclass
class Pools:
    """Holds the read and write pools and the acquire timeout."""

    read: asyncpg.Pool
    write: asyncpg.Pool
    acquire_timeout: float


_pools: Pools | None = None


async def create_pools(settings: Settings) -> Pools:
    """Open both pools fully at startup and never reap idle connections (cold backends cost 20-70 ms on first use)."""
    global _pools
    write = await asyncpg.create_pool(
        settings.database_url, min_size=settings.write_pool_max, max_size=settings.write_pool_max,
        max_inactive_connection_lifetime=0, init=init_connection,
        # Client-side bound: a half-open socket never reaches statement_timeout on the server (B-34).
        command_timeout=COMMAND_TIMEOUT_S,
        server_settings={
            "lock_timeout": "1000",
            "statement_timeout": "3000",
            "idle_in_transaction_session_timeout": "5000",
            "application_name": "crewline-write",
        })
    read = await asyncpg.create_pool(
        settings.database_url, min_size=settings.read_pool_max, max_size=settings.read_pool_max,
        max_inactive_connection_lifetime=0, init=init_connection, command_timeout=COMMAND_TIMEOUT_S,
        server_settings={"statement_timeout": "2000", "application_name": "crewline-read"})
    _pools = Pools(read=read, write=write, acquire_timeout=settings.pool_acquire_timeout_s)
    return _pools


async def close_pools() -> None:
    """Close both pools."""
    global _pools
    if _pools is not None:
        await asyncio.gather(_pools.read.close(), _pools.write.close())
        _pools = None


def pools() -> Pools:
    """Return the open pools."""
    if _pools is None:
        raise RuntimeError("pools are not open")
    return _pools


async def _release(pool: asyncpg.Pool, conn: asyncpg.Connection) -> None:
    """Return a connection to the pool; one that died during the reset is dropped, not raised."""
    try:
        await pool.release(conn)
    except Exception as exc:
        # asyncpg terminates a connection whose reset failed and frees its slot; the request's work is done,
        # and for a write the COMMIT already succeeded, so a 503 here would be wrong (B-35).
        if not is_busy(exc):
            raise
        log.warning("dropped a dead connection on release", extra={"error": type(exc).__name__})


@asynccontextmanager
async def read_conn() -> AsyncIterator[asyncpg.Connection]:
    """Acquire a read connection; timeouts and lost connections raise 503 busy."""
    p = pools()
    try:
        conn = await p.read.acquire(timeout=p.acquire_timeout)
    except Exception as exc:
        # Acquire timeout, or a refused reconnect while PostgreSQL restarts (B-35).
        if is_busy(exc):
            raise Busy() from exc
        raise
    logger = trace.attach(conn, "read")
    try:
        yield conn
    except DomainError:
        raise
    except Exception as exc:
        # Reads skip run_write: a read timeout or lost connection becomes Busy here (B-35).
        if is_busy(exc):
            raise Busy() from exc
        raise
    finally:
        trace.detach(conn, logger)
        await _release(p.read, conn)


@asynccontextmanager
async def write_conn() -> AsyncIterator[asyncpg.Connection]:
    """Acquire a write connection; acquire timeouts and refused reconnects raise 503 busy."""
    p = pools()
    try:
        conn = await p.write.acquire(timeout=p.acquire_timeout)
    except Exception as exc:
        # Acquire timeout, or a refused reconnect while PostgreSQL restarts (B-35).
        if is_busy(exc):
            raise Busy() from exc
        raise
    logger = trace.attach(conn, "write")
    try:
        yield conn
    finally:
        trace.detach(conn, logger)
        await _release(p.write, conn)
