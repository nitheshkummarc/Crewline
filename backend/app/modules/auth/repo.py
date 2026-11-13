"""User SQL."""

from typing import Any
from uuid import UUID

import asyncpg

USER_COLUMNS = "id, email, display_name, skills, timezone"


async def insert_user(conn: asyncpg.Connection, email: str, password_hash: str, display_name: str,
                      skills: list[str], timezone: str) -> asyncpg.Record:
    """Insert a user; 23505 on users_email_unique means the email is taken."""
    return await conn.fetchrow(
        f"INSERT INTO users (email, password_hash, display_name, skills, timezone) "
        f"VALUES ($1, $2, $3, $4, $5) RETURNING {USER_COLUMNS}",
        email, password_hash, display_name, skills, timezone)


async def get_by_email(conn: asyncpg.Connection, email: str) -> asyncpg.Record | None:
    """Return the user and password hash for an email."""
    return await conn.fetchrow(f"SELECT {USER_COLUMNS}, password_hash FROM users WHERE email = $1", email)


async def get_by_id(conn: asyncpg.Connection, user_id: UUID) -> asyncpg.Record | None:
    """Return a user."""
    return await conn.fetchrow(f"SELECT {USER_COLUMNS} FROM users WHERE id = $1", user_id)


async def bump_member_teams(conn: asyncpg.Connection, user_id: UUID) -> list[asyncpg.Record]:
    """Lock the user's participant rows, then their teams by (hackathon, id); bump teams they still belong to."""
    # FOR UPDATE conflicts with the FK KEY SHARE of a membership insert, so a join or accept of this
    # user either commits first (and is seen below) or waits until this profile change commits (B-36).
    await conn.execute(
        "/* route:update_profile */ SELECT 1 FROM participants WHERE user_id = $1 "
        "ORDER BY hackathon_id FOR UPDATE", user_id)
    team_ids = await conn.fetchval(
        """
        /* route:update_profile */
        SELECT COALESCE(array_agg(id), '{}') FROM (
          SELECT t.id FROM teams t JOIN memberships m ON m.team_id = t.id
          WHERE m.user_id = $1 ORDER BY t.hackathon_id, t.id FOR NO KEY UPDATE OF t) locked
        """, user_id)
    # New statement, new snapshot: a leave that committed while this waited on a team row is seen (B-37).
    return await conn.fetch(
        """
        /* route:update_profile */
        UPDATE teams SET version = version + 1
        WHERE id = ANY($2::uuid[])
          AND EXISTS (SELECT 1 FROM memberships m WHERE m.team_id = teams.id AND m.user_id = $1)
        RETURNING id, hackathon_id
        """, user_id, team_ids)


async def update_profile(conn: asyncpg.Connection, user_id: UUID, fields: dict[str, Any]) -> asyncpg.Record:
    """Update profile columns and return the user."""
    allowed = ("display_name", "skills", "timezone")
    names = [name for name in allowed if name in fields]
    assignments = ", ".join(f"{name} = ${i + 2}" for i, name in enumerate(names))
    return await conn.fetchrow(
        f"UPDATE users SET {assignments} WHERE id = $1 RETURNING {USER_COLUMNS}",
        user_id, *[fields[name] for name in names])


async def participations(conn: asyncpg.Connection, user_id: UUID) -> list[UUID]:
    """Return the hackathon ids the user is registered in."""
    rows = await conn.fetch("SELECT hackathon_id FROM participants WHERE user_id = $1", user_id)
    return [row["hackathon_id"] for row in rows]
