"""Schema guarantees: migrations, append-only audit, capacity backstop."""

import asyncpg
import pytest
from migrate import apply_migrations


async def test_migrations_are_idempotent(clean_db: str) -> None:
    """Running migrations again applies nothing."""
    assert await apply_migrations(clean_db) == []


async def test_api_34_audit_is_append_only(clean_db: str) -> None:
    """T-API-34: UPDATE and DELETE on audit_events raise."""
    conn = await asyncpg.connect(clean_db)
    try:
        hid = await conn.fetchval(
            "INSERT INTO hackathons (name, min_team_size, max_team_size) VALUES ('h', 2, 4) RETURNING id")
        await conn.execute(
            "INSERT INTO audit_events (hackathon_id, action, payload) VALUES ($1, 'team_updated', '{}')", hid)
        with pytest.raises(asyncpg.RaiseError, match="append-only"):
            await conn.execute("UPDATE audit_events SET action = 'team_deleted'")
        with pytest.raises(asyncpg.RaiseError, match="append-only"):
            await conn.execute("DELETE FROM audit_events")
    finally:
        await conn.close()


async def test_capacity_check_is_a_backstop(clean_db: str) -> None:
    """teams_cap rejects a member_count above max_size even from raw SQL."""
    conn = await asyncpg.connect(clean_db)
    try:
        hid = await conn.fetchval(
            "INSERT INTO hackathons (name, min_team_size, max_team_size) VALUES ('h', 1, 2) RETURNING id")
        uid = await conn.fetchval(
            "INSERT INTO users (email, password_hash, display_name) VALUES ('a@x.io', 'x', 'A') RETURNING id")
        await conn.execute("INSERT INTO participants (hackathon_id, user_id) VALUES ($1, $2)", hid, uid)
        tid = await conn.fetchval(
            "INSERT INTO teams (hackathon_id, name, leader_id, min_size, max_size, invite_code, invite_expires_at) "
            "VALUES ($1, 't', $2, 1, 2, 'ABCDEFGH12', now() + interval '1 day') RETURNING id", hid, uid)
        await conn.execute(
            "INSERT INTO memberships (team_id, hackathon_id, user_id) VALUES ($1, $2, $3)", tid, hid, uid)
        await conn.execute(
            "INSERT INTO audit_events (hackathon_id, team_id, action, payload) "
            "VALUES ($1, $2, 'team_created', jsonb_build_object('user_id', $3::uuid))", hid, tid, uid)
        with pytest.raises(asyncpg.CheckViolationError) as info:
            await conn.execute("UPDATE teams SET member_count = 3 WHERE id = $1", tid)
        assert info.value.constraint_name == "teams_cap"
    finally:
        await conn.close()
