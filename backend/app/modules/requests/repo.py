"""Join request SQL.

Contents:
    lock_participant: SELECT ... FOR NO KEY UPDATE on the participant row; False if the user is not registered.
    count_pending_for_user: Count the caller's pending requests in a hackathon.
    insert_request: Insert a pending request; return its id, or None if one is already pending for this team.
    get_pending: Return the caller's pending request for a team, or None.
    get_request: Return one request in the API shape, or None.
    get_ids: Return the team, hackathon and requester ids of a request (they never change).
    transition: Conditional status change of a request; return the requester id, or None if it was not in
        from_status.
    withdraw: Conditional withdraw by the requester; return the team and hackathon ids, or None.
    mark_stale: Mark a pending request stale; return its team, hackathon and requester ids, or None.
    list_pending_for_team: Pending requests for a team, oldest first, hiding users who already have a team in the
        hackathon.
"""

from uuid import UUID

import asyncpg

REQUEST_SELECT = """
    SELECT r.id, r.team_id, t.name AS team_name, r.user_id, u.display_name, r.message, r.status,
           r.created_at, r.decided_at
    FROM join_requests r
    JOIN users u ON u.id = r.user_id
    JOIN teams t ON t.id = r.team_id
"""


async def lock_participant(conn: asyncpg.Connection, hackathon_id: UUID, user_id: UUID) -> bool:
    """SELECT ... FOR NO KEY UPDATE on the participant row; False if the user is not registered."""
    row = await conn.fetchrow(
        "SELECT 1 FROM participants WHERE hackathon_id = $1 AND user_id = $2 FOR NO KEY UPDATE",
        hackathon_id, user_id)
    return row is not None


async def count_pending_for_user(conn: asyncpg.Connection, hackathon_id: UUID, user_id: UUID) -> int:
    """Count the caller's pending requests in a hackathon."""
    return await conn.fetchval(
        "SELECT count(*) FROM join_requests WHERE user_id = $1 AND hackathon_id = $2 AND status = 'pending'",
        user_id, hackathon_id)


async def insert_request(conn: asyncpg.Connection, team_id: UUID, hackathon_id: UUID, user_id: UUID,
                         message: str | None) -> UUID | None:
    """Insert a pending request; return its id, or None if one is already pending for this team."""
    return await conn.fetchval(
        """
        /* route:create_request */
        INSERT INTO join_requests (team_id, hackathon_id, user_id, message)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (team_id, user_id) WHERE status = 'pending' DO NOTHING
        RETURNING id
        """, team_id, hackathon_id, user_id, message)


async def get_pending(conn: asyncpg.Connection, team_id: UUID, user_id: UUID) -> asyncpg.Record | None:
    """Return the caller's pending request for a team, or None."""
    return await conn.fetchrow(
        REQUEST_SELECT + " WHERE r.team_id = $1 AND r.user_id = $2 AND r.status = 'pending'", team_id, user_id)


async def get_request(conn: asyncpg.Connection, request_id: UUID) -> asyncpg.Record | None:
    """Return one request in the API shape, or None."""
    return await conn.fetchrow(REQUEST_SELECT + " WHERE r.id = $1", request_id)


async def get_ids(conn: asyncpg.Connection, request_id: UUID) -> asyncpg.Record | None:
    """Return the team, hackathon and requester ids of a request (they never change)."""
    return await conn.fetchrow(
        "SELECT team_id, hackathon_id, user_id FROM join_requests WHERE id = $1", request_id)


async def transition(conn: asyncpg.Connection, request_id: UUID, team_id: UUID, from_status: str,
                     to_status: str, actor_id: UUID) -> UUID | None:
    """Conditional status change of a request; return the requester id, or None if it was not in from_status."""
    return await conn.fetchval(
        """
        /* route:request_transition */
        UPDATE join_requests SET status = $4, decided_at = now(), decided_by = $5
        WHERE id = $1 AND team_id = $2 AND status = $3
        RETURNING user_id
        """, request_id, team_id, from_status, to_status, actor_id)


async def withdraw(conn: asyncpg.Connection, request_id: UUID, user_id: UUID) -> asyncpg.Record | None:
    """Conditional withdraw by the requester; return the team and hackathon ids, or None."""
    return await conn.fetchrow(
        """
        /* route:withdraw_request */
        UPDATE join_requests SET status = 'withdrawn', decided_at = now(), decided_by = $2
        WHERE id = $1 AND user_id = $2 AND status = 'pending'
        RETURNING team_id, hackathon_id
        """, request_id, user_id)


async def mark_stale(conn: asyncpg.Connection, request_id: UUID, actor_id: UUID) -> asyncpg.Record | None:
    """Mark a pending request stale; return its team, hackathon and requester ids, or None."""
    return await conn.fetchrow(
        """
        /* route:mark_stale */
        UPDATE join_requests SET status = 'stale', decided_at = now(), decided_by = $2
        WHERE id = $1 AND status = 'pending'
        RETURNING team_id, hackathon_id, user_id
        """, request_id, actor_id)


async def list_pending_for_team(conn: asyncpg.Connection, team_id: UUID) -> list[asyncpg.Record]:
    """Pending requests for a team, oldest first, hiding users who already have a team in the hackathon."""
    return await conn.fetch(
        REQUEST_SELECT + """
        WHERE r.team_id = $1 AND r.status = 'pending'
          AND NOT EXISTS (SELECT 1 FROM memberships m
                          WHERE m.hackathon_id = r.hackathon_id AND m.user_id = r.user_id)
        ORDER BY r.created_at, r.id
        """, team_id)
