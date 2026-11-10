"""Hackathon and participant SQL."""

from uuid import UUID

import asyncpg

HACKATHON_COLUMNS = ("id, name, min_team_size, max_team_size, "
                     "(extract(epoch FROM invite_ttl) / 3600)::int AS invite_ttl_hours")


async def list_all(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    """Return all hackathons, newest first."""
    return await conn.fetch(f"SELECT {HACKATHON_COLUMNS} FROM hackathons ORDER BY created_at DESC")


async def get(conn: asyncpg.Connection, hackathon_id: UUID) -> asyncpg.Record | None:
    """Return one hackathon."""
    return await conn.fetchrow(f"SELECT {HACKATHON_COLUMNS} FROM hackathons WHERE id = $1", hackathon_id)


async def insert_participant(conn: asyncpg.Connection, hackathon_id: UUID, user_id: UUID) -> asyncpg.Record | None:
    """Insert participant ON CONFLICT DO NOTHING; return the row if inserted."""
    return await conn.fetchrow(
        "/* route:register */ INSERT INTO participants (hackathon_id, user_id) VALUES ($1, $2) "
        "ON CONFLICT DO NOTHING RETURNING looking", hackathon_id, user_id)


async def get_participant(conn: asyncpg.Connection, hackathon_id: UUID, user_id: UUID) -> asyncpg.Record | None:
    """Return the participant row."""
    return await conn.fetchrow(
        "SELECT looking FROM participants WHERE hackathon_id = $1 AND user_id = $2", hackathon_id, user_id)


async def set_looking(conn: asyncpg.Connection, hackathon_id: UUID, user_id: UUID,
                      looking: bool) -> asyncpg.Record | None:
    """Update the looking flag if it differs; return the row or None."""
    return await conn.fetchrow(
        "/* route:set_looking */ UPDATE participants SET looking = $3 "
        "WHERE hackathon_id = $1 AND user_id = $2 AND looking IS DISTINCT FROM $3 RETURNING looking",
        hackathon_id, user_id, looking)


async def my_team(conn: asyncpg.Connection, hackathon_id: UUID, user_id: UUID) -> dict | None:
    """Return the snapshot of the caller's team in a hackathon, or None."""
    return await conn.fetchval(
        "SELECT team_snapshot(m.team_id) FROM memberships m WHERE m.hackathon_id = $1 AND m.user_id = $2",
        hackathon_id, user_id)


async def my_requests(conn: asyncpg.Connection, hackathon_id: UUID, user_id: UUID) -> list[asyncpg.Record]:
    """Return the caller's join requests in a hackathon, newest first."""
    return await conn.fetch(
        """
        SELECT r.id, r.team_id, r.user_id, u.display_name, r.message, r.status, r.created_at, r.decided_at,
               t.name AS team_name
        FROM join_requests r
        JOIN users u ON u.id = r.user_id
        JOIN teams t ON t.id = r.team_id
        WHERE r.hackathon_id = $1 AND r.user_id = $2
        ORDER BY r.created_at DESC
        LIMIT 50
        """, hackathon_id, user_id)
