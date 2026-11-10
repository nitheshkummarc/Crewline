"""Read and write asyncpg pools."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

import asyncpg
import orjson

from app.config import Settings
from app.core.errors import Busy


async def init_connection(conn: asyncpg.Connection) -> None:
    """Register json and jsonb codecs that use orjson."""
    for typename in ("json", "jsonb"):
        await conn.set_type_codec(
            typename, schema="pg_catalog",
            encoder=lambda value: orjson.dumps(value).decode(), decoder=orjson.loads)


@dataclass
class Pools:
    """Holds the read and write pools and the acquire timeout."""

    read: asyncpg.Pool
    write: asyncpg.Pool
    acquire_timeout: float


_pools: Pools | None = None


async def create_pools(settings: Settings) -> Pools:
    """Open both pools with their server settings and application names."""
    global _pools
    write = await asyncpg.create_pool(
        settings.database_url, min_size=1, max_size=settings.write_pool_max, init=init_connection,
        server_settings={
            "lock_timeout": "1000",
            "statement_timeout": "3000",
            "idle_in_transaction_session_timeout": "5000",
            "application_name": "crewline-write",
        })
    read = await asyncpg.create_pool(
        settings.database_url, min_size=1, max_size=settings.read_pool_max, init=init_connection,
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


@asynccontextmanager
async def read_conn() -> AsyncIterator[asyncpg.Connection]:
    """Acquire a read connection with the acquire timeout; 503 busy on timeout."""
    p = pools()
    try:
        conn = await p.read.acquire(timeout=p.acquire_timeout)
    except TimeoutError as exc:
        raise Busy() from exc
    try:
        yield conn
    finally:
        await p.read.release(conn)


@asynccontextmanager
async def write_conn() -> AsyncIterator[asyncpg.Connection]:
    """Acquire a write connection with the acquire timeout; 503 busy on timeout."""
    p = pools()
    try:
        conn = await p.write.acquire(timeout=p.acquire_timeout)
    except TimeoutError as exc:
        raise Busy() from exc
    try:
        yield conn
    finally:
        await p.write.release(conn)
