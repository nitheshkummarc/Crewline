"""Idempotency purge (T-OPS-06, B-42): a backlog larger than one pool statement timeout is still deleted."""

import asyncpg
from helpers import query

from app.core.idempotency import purge_expired
from app.db.pools import init_connection

EXPIRED = 50_000


async def test_ops_06_purge_outlasts_the_pool_timeouts(clean_db: str) -> None:
    """T-OPS-06: on a pool whose statement timeout is 1 ms, every expired key is still purged."""
    await query(clean_db, """
        INSERT INTO idempotency_keys (user_id, key, request_hash, response_status, response_body, created_at)
        SELECT gen_random_uuid(), 'purge-test-key-' || g, 'h', 200, '{}'::jsonb, now() - interval '48 hours'
        FROM generate_series(1, $1) g
        """, EXPIRED)
    await query(clean_db, "INSERT INTO idempotency_keys (user_id, key, request_hash, response_status, response_body) "
                          "VALUES (gen_random_uuid(), 'purge-test-fresh-key', 'h', 200, '{}'::jsonb)")
    # Write pool shape, with a statement timeout far below what deleting the backlog takes.
    pool = await asyncpg.create_pool(clean_db, min_size=1, max_size=1, init=init_connection,
                                     server_settings={"statement_timeout": "1", "lock_timeout": "1"})
    try:
        deleted = await purge_expired(pool, 24)
    finally:
        await pool.close()
    assert deleted == EXPIRED
    rows = await query(clean_db, "SELECT key FROM idempotency_keys WHERE key LIKE 'purge-test-%'")
    assert [r["key"] for r in rows] == ["purge-test-fresh-key"]
