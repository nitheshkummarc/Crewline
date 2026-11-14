"""Team and membership SQL.

Contents:
    insert_team: Insert a team copying sizes and invite TTL from the hackathon; None if the hackathon does not
        exist.
    insert_membership: Insert a membership row (unique per hackathon and user).
    take_seat_by_code: Conditional seat UPDATE by invite code; return id, hackathon, count, version or None.
    take_seat_as_leader: Conditional seat UPDATE for an accept by the leader; return hackathon, count, version or
        None.
    lock_team: SELECT ... FOR UPDATE on the team row (used by paths that may delete the team).
    lock_team_shared: SELECT ... FOR SHARE on the team row (blocks seat and leader changes, not other readers).
    delete_membership: Delete one membership; return True if a row was deleted.
    shrink_team: Decrement count, reopen, promote the earliest member if the leader left; return the new state.
    delete_team: Delete the team row (requests cascade) and return its last version.
    set_status: Conditional status change by the leader (finalizing needs member_count >= min_size); return the new
        state.
    set_invite: Replace the invite code and expiry by the leader; return the new code and expiry or None.
    update_fields: Update name or looking by the leader; return the hackathon id or None.
    find_by_code: Return the team for an invite code with an `active` flag for expiry.
    get_state: Return id, hackathon, leader, counts, sizes and status for error explanation.
    get_membership: Return the caller's team id in a hackathon, or None.
    is_member: True if the user is a member of the team.
    is_registered: True if the user is a participant of the hackathon.
    get_invite: Return the invite code and expiry of a team.
    get_detail: Return the team snapshot with its members, leader first by join order, or None.
"""

from uuid import UUID

import asyncpg

STATE_COLUMNS = "id, hackathon_id, leader_id, member_count, min_size, max_size, status"


async def insert_team(conn: asyncpg.Connection, hackathon_id: UUID, name: str, leader_id: UUID,
                      code: str) -> asyncpg.Record | None:
    """Insert a team copying sizes and invite TTL from the hackathon; None if the hackathon does not exist."""
    return await conn.fetchrow(
        """
        /* route:create_team */
        INSERT INTO teams (hackathon_id, name, leader_id, min_size, max_size, invite_code, invite_expires_at)
        SELECT $1, $2, $3, h.min_team_size, h.max_team_size, $4, now() + h.invite_ttl
        FROM hackathons h WHERE h.id = $1
        RETURNING id, hackathon_id
        """, hackathon_id, name, leader_id, code)


async def insert_membership(conn: asyncpg.Connection, team_id: UUID, hackathon_id: UUID, user_id: UUID) -> None:
    """Insert a membership row (unique per hackathon and user)."""
    await conn.execute(
        "INSERT INTO memberships (team_id, hackathon_id, user_id) VALUES ($1, $2, $3)",
        team_id, hackathon_id, user_id)


async def take_seat_by_code(conn: asyncpg.Connection, code: str) -> asyncpg.Record | None:
    """Conditional seat UPDATE by invite code; return id, hackathon, count, version or None."""
    return await conn.fetchrow(
        """
        /* route:join_by_code */
        UPDATE teams SET member_count = member_count + 1, version = version + 1
        WHERE invite_code = $1 AND invite_expires_at > now()
          AND status = 'forming' AND member_count < max_size
        RETURNING id, hackathon_id, member_count, version
        """, code)


async def take_seat_as_leader(conn: asyncpg.Connection, team_id: UUID, leader_id: UUID) -> asyncpg.Record | None:
    """Conditional seat UPDATE for an accept by the leader; return hackathon, count, version or None."""
    return await conn.fetchrow(
        """
        /* route:accept_request */
        UPDATE teams SET member_count = member_count + 1, version = version + 1
        WHERE id = $1 AND leader_id = $2 AND status = 'forming' AND member_count < max_size
        RETURNING hackathon_id, member_count, version
        """, team_id, leader_id)


async def lock_team(conn: asyncpg.Connection, team_id: UUID) -> asyncpg.Record | None:
    """SELECT ... FOR UPDATE on the team row (used by paths that may delete the team)."""
    return await conn.fetchrow(f"SELECT {STATE_COLUMNS} FROM teams WHERE id = $1 FOR UPDATE", team_id)


async def lock_team_shared(conn: asyncpg.Connection, team_id: UUID) -> asyncpg.Record | None:
    """SELECT ... FOR SHARE on the team row (blocks seat and leader changes, not other readers)."""
    return await conn.fetchrow(f"SELECT {STATE_COLUMNS} FROM teams WHERE id = $1 FOR SHARE", team_id)


async def delete_membership(conn: asyncpg.Connection, team_id: UUID, user_id: UUID) -> bool:
    """Delete one membership; return True if a row was deleted."""
    row = await conn.fetchrow(
        "DELETE FROM memberships WHERE team_id = $1 AND user_id = $2 RETURNING 1", team_id, user_id)
    return row is not None


async def shrink_team(conn: asyncpg.Connection, team_id: UUID, leaver_id: UUID) -> asyncpg.Record:
    """Decrement count, reopen, promote the earliest member if the leader left; return the new state."""
    return await conn.fetchrow(
        """
        /* route:leave_team */
        UPDATE teams
        SET member_count = member_count - 1,
            version = version + 1,
            status = 'forming',
            leader_id = CASE WHEN leader_id = $2
              THEN (SELECT user_id FROM memberships WHERE team_id = $1 ORDER BY joined_at, user_id LIMIT 1)
              ELSE leader_id END
        WHERE id = $1
        RETURNING leader_id, member_count, version
        """, team_id, leaver_id)


async def delete_team(conn: asyncpg.Connection, team_id: UUID) -> int:
    """Delete the team row (requests cascade) and return its last version."""
    return await conn.fetchval("DELETE FROM teams WHERE id = $1 RETURNING version", team_id)


async def set_status(conn: asyncpg.Connection, team_id: UUID, leader_id: UUID, from_status: str,
                     to_status: str) -> asyncpg.Record | None:
    """Conditional status change by the leader (finalizing needs member_count >= min_size); return the new state."""
    return await conn.fetchrow(
        """
        /* route:set_status */
        UPDATE teams SET status = $4, version = version + 1
        WHERE id = $1 AND leader_id = $2 AND status = $3
          AND ($4 <> 'finalized' OR member_count >= min_size)
        RETURNING hackathon_id, member_count, version
        """, team_id, leader_id, from_status, to_status)


async def set_invite(conn: asyncpg.Connection, team_id: UUID, leader_id: UUID, code: str) -> asyncpg.Record | None:
    """Replace the invite code and expiry by the leader; return the new code and expiry or None."""
    return await conn.fetchrow(
        """
        /* route:regenerate_invite */
        UPDATE teams
        SET invite_code = $3,
            invite_expires_at = now() + (SELECT invite_ttl FROM hackathons WHERE id = teams.hackathon_id),
            version = version + 1
        WHERE id = $1 AND leader_id = $2
        RETURNING hackathon_id, invite_code, invite_expires_at
        """, team_id, leader_id, code)


async def update_fields(conn: asyncpg.Connection, team_id: UUID, leader_id: UUID, name: str | None,
                        looking: bool | None) -> asyncpg.Record | None:
    """Update name or looking by the leader; return the hackathon id or None."""
    return await conn.fetchrow(
        """
        /* route:update_team */
        UPDATE teams SET name = COALESCE($3, name), looking = COALESCE($4, looking), version = version + 1
        WHERE id = $1 AND leader_id = $2
        RETURNING hackathon_id
        """, team_id, leader_id, name, looking)


async def find_by_code(conn: asyncpg.Connection, code: str) -> asyncpg.Record | None:
    """Return the team for an invite code with an `active` flag for expiry."""
    return await conn.fetchrow(
        f"SELECT {STATE_COLUMNS}, invite_expires_at > now() AS active FROM teams WHERE invite_code = $1", code)


async def get_state(conn: asyncpg.Connection, team_id: UUID) -> asyncpg.Record | None:
    """Return id, hackathon, leader, counts, sizes and status for error explanation."""
    return await conn.fetchrow(f"SELECT {STATE_COLUMNS} FROM teams WHERE id = $1", team_id)


async def get_membership(conn: asyncpg.Connection, hackathon_id: UUID, user_id: UUID) -> UUID | None:
    """Return the caller's team id in a hackathon, or None."""
    return await conn.fetchval(
        "SELECT team_id FROM memberships WHERE hackathon_id = $1 AND user_id = $2", hackathon_id, user_id)


async def is_member(conn: asyncpg.Connection, team_id: UUID, user_id: UUID) -> bool:
    """True if the user is a member of the team."""
    return await conn.fetchval(
        "SELECT EXISTS (SELECT 1 FROM memberships WHERE team_id = $1 AND user_id = $2)", team_id, user_id)


async def is_registered(conn: asyncpg.Connection, hackathon_id: UUID, user_id: UUID) -> bool:
    """True if the user is a participant of the hackathon."""
    return await conn.fetchval(
        "SELECT EXISTS (SELECT 1 FROM participants WHERE hackathon_id = $1 AND user_id = $2)", hackathon_id, user_id)


async def get_invite(conn: asyncpg.Connection, team_id: UUID) -> asyncpg.Record | None:
    """Return the invite code and expiry of a team."""
    return await conn.fetchrow("SELECT invite_code, invite_expires_at FROM teams WHERE id = $1", team_id)


async def get_detail(conn: asyncpg.Connection, team_id: UUID) -> dict | None:
    """Return the team snapshot with its members, leader first by join order, or None."""
    row = await conn.fetchrow(
        """
        SELECT team_snapshot($1) AS team,
               (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'user_id', u.id, 'display_name', u.display_name, 'skills', u.skills,
                   'timezone', u.timezone, 'joined_at', m.joined_at, 'is_leader', u.id = t.leader_id)
                   ORDER BY m.joined_at, m.user_id), '[]'::jsonb)
                FROM memberships m
                JOIN users u ON u.id = m.user_id
                JOIN teams t ON t.id = m.team_id
                WHERE m.team_id = $1) AS members
        """, team_id)
    if row is None or row["team"] is None:
        return None
    return {**row["team"], "members": row["members"]}
