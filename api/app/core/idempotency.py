"""Idempotency key hashing, lookup, claim and store."""

import asyncio
import hashlib
import logging
from typing import Any
from uuid import UUID

import asyncpg
import orjson

log = logging.getLogger("crewline.idempotency")


def request_hash(method: str, route: str, params: dict[str, Any], body: Any) -> str:
    """Return sha256 of the canonical request."""
    canonical = b"\n".join([
        method.upper().encode(),
        route.encode(),
        orjson.dumps(params, option=orjson.OPT_SORT_KEYS, default=str),
        orjson.dumps(body, option=orjson.OPT_SORT_KEYS, default=str),
    ])
    return hashlib.sha256(canonical).hexdigest()


async def lookup(conn: asyncpg.Connection, user_id: UUID, key: str) -> asyncpg.Record | None:
    """Return the stored row for a key, or None."""
    return await conn.fetchrow(
        "SELECT request_hash, response_status, response_body FROM idempotency_keys "
        "WHERE user_id = $1 AND key = $2", user_id, key)


async def claim(conn: asyncpg.Connection, user_id: UUID, key: str, req_hash: str) -> bool:
    """Insert the key row; return False if it already exists (waits for an in-flight owner)."""
    row = await conn.fetchrow(
        "INSERT INTO idempotency_keys (user_id, key, request_hash) VALUES ($1, $2, $3) "
        "ON CONFLICT DO NOTHING RETURNING 1", user_id, key, req_hash)
    return row is not None


async def store(conn: asyncpg.Connection, user_id: UUID, key: str, status: int, body: Any) -> None:
    """Save the success response on the claimed row."""
    await conn.execute(
        "UPDATE idempotency_keys SET response_status = $3, response_body = $4 "
        "WHERE user_id = $1 AND key = $2", user_id, key, status, body)


async def purge_expired(pool: asyncpg.Pool, ttl_hours: int) -> int:
    """Delete keys older than the TTL; return the number deleted."""
    result = await pool.execute(
        "DELETE FROM idempotency_keys WHERE created_at < now() - make_interval(hours => $1)", ttl_hours)
    return int(result.split()[-1])


async def purge_loop(pool: asyncpg.Pool, ttl_hours: int) -> None:
    """Run purge_expired every hour."""
    while True:
        try:
            deleted = await purge_expired(pool, ttl_hours)
            if deleted:
                log.info("idempotency keys purged", extra={"deleted": deleted})
        except Exception:
            log.exception("idempotency purge failed")
        await asyncio.sleep(3600)
