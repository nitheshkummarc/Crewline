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
    """Lock the user's teams in id order, increment their version, return team and hackathon ids."""
    return await conn.fetch(
        """
        /* route:update_profile */
        WITH mine AS (
          SELECT t.id FROM teams t JOIN memberships m ON m.team_id = t.id
          WHERE m.user_id = $1 ORDER BY t.id FOR NO KEY UPDATE OF t)
        UPDATE teams SET version = version + 1 FROM mine WHERE teams.id = mine.id
        RETURNING teams.id, teams.hackathon_id
        """, user_id)


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
