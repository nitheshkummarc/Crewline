"""Board SQL: keyset pages served by the teams_board and participants_board partial indexes."""

from datetime import datetime
from uuid import UUID

import asyncpg


async def teams_page(conn: asyncpg.Connection, hackathon_id: UUID, after: tuple[datetime, UUID] | None,
                     limit: int) -> list[dict]:
    """Keyset page of open teams as snapshots, newest first; fetches limit + 1 rows to detect a next page."""
    # The WHERE repeats the teams_board index predicate exactly so the planner can use the partial index.
    if after is None:
        rows = await conn.fetch(
            """
            /* route:board_teams */
            SELECT team_snapshot(id) AS team FROM teams
            WHERE hackathon_id = $1 AND looking AND status = 'forming' AND member_count < max_size
            ORDER BY created_at DESC, id DESC LIMIT $2
            """, hackathon_id, limit + 1)
    else:
        rows = await conn.fetch(
            """
            /* route:board_teams */
            SELECT team_snapshot(id) AS team FROM teams
            WHERE hackathon_id = $1 AND looking AND status = 'forming' AND member_count < max_size
              AND (created_at, id) < ($2, $3)
            ORDER BY created_at DESC, id DESC LIMIT $4
            """, hackathon_id, after[0], after[1], limit + 1)
    return [row["team"] for row in rows]


async def people_page(conn: asyncpg.Connection, hackathon_id: UUID, after: tuple[datetime, UUID] | None,
                      limit: int) -> list[asyncpg.Record]:
    """Keyset page of looking participants without a team, newest first; fetches limit + 1 rows."""
    return await conn.fetch(
        """
        /* route:board_people */
        SELECT p.user_id, u.display_name, u.skills, u.timezone, p.registered_at
        FROM participants p
        JOIN users u ON u.id = p.user_id
        WHERE p.hackathon_id = $1 AND p.looking
          AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.hackathon_id = p.hackathon_id AND m.user_id = p.user_id)
          AND ($2::timestamptz IS NULL OR (p.registered_at, p.user_id) < ($2, $3::uuid))
        ORDER BY p.registered_at DESC, p.user_id DESC
        LIMIT $4
        """, hackathon_id, after[0] if after else None, after[1] if after else None, limit + 1)


async def hackathon_exists(conn: asyncpg.Connection, hackathon_id: UUID) -> bool:
    """True if the hackathon exists."""
    return await conn.fetchval("SELECT EXISTS (SELECT 1 FROM hackathons WHERE id = $1)", hackathon_id)
