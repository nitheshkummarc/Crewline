"""Suggestions SQL.

Contents:
    is_registered: True if the user is a participant of the hackathon.
    group_members: Return the caller's team id and its members' (id, skills, timezone); the caller alone when
        teamless.
    candidates: Looking participants without a team, ordered by missing-skill overlap then recency (max 500).
"""

from uuid import UUID

import asyncpg

MAX_CANDIDATES = 500


async def is_registered(conn: asyncpg.Connection, hackathon_id: UUID, user_id: UUID) -> bool:
    """True if the user is a participant of the hackathon."""
    return await conn.fetchval(
        "SELECT EXISTS (SELECT 1 FROM participants WHERE hackathon_id = $1 AND user_id = $2)", hackathon_id, user_id)


async def group_members(conn: asyncpg.Connection, hackathon_id: UUID, user_id: UUID) -> tuple[UUID | None, list]:
    """Return the caller's team id and its members' (id, skills, timezone); the caller alone when teamless."""
    team_id = await conn.fetchval(
        "SELECT team_id FROM memberships WHERE hackathon_id = $1 AND user_id = $2", hackathon_id, user_id)
    if team_id is None:
        rows = await conn.fetch("SELECT id, skills, timezone FROM users WHERE id = $1", user_id)
    else:
        rows = await conn.fetch(
            "SELECT u.id, u.skills, u.timezone FROM memberships m JOIN users u ON u.id = m.user_id "
            "WHERE m.team_id = $1", team_id)
    return team_id, list(rows)


async def candidates(conn: asyncpg.Connection, hackathon_id: UUID, exclude_ids: list[UUID],
                     missing: list[str]) -> list[asyncpg.Record]:
    """Looking participants without a team, ordered by missing-skill overlap then recency (max 500)."""
    return await conn.fetch(
        """
        /* route:suggestions */
        SELECT p.user_id, u.display_name, u.skills, u.timezone
        FROM participants p
        JOIN users u ON u.id = p.user_id
        WHERE p.hackathon_id = $1 AND p.looking
          AND p.user_id <> ALL($2::uuid[])
          AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.hackathon_id = p.hackathon_id AND m.user_id = p.user_id)
        ORDER BY (u.skills && $3::text[]) DESC, p.registered_at DESC
        LIMIT $4
        """, hackathon_id, exclude_ids, missing, MAX_CANDIDATES)
