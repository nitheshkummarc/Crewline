"""Audit SQL."""

from typing import Any
from uuid import UUID

import asyncpg

REQUEST_ACTIONS = frozenset({"request_created", "request_declined", "request_withdrawn", "request_stale"})


async def record(conn: asyncpg.Connection, hackathon_id: UUID, team_id: UUID | None, actor_id: UUID | None,
                 action: str, payload: dict[str, Any], request_id: str | None) -> int:
    """Insert an audit event; add the team snapshot, and the audience for request actions, in the same statement."""
    audience_user = payload.get("user_id") if action in REQUEST_ACTIONS else None
    return await conn.fetchval(
        """
        /* route:audit_record */
        INSERT INTO audit_events (hackathon_id, team_id, actor_id, action, request_id, payload)
        VALUES ($1, $2, $3, $4, $5,
          $6::jsonb
          || jsonb_build_object('team', team_snapshot($2))
          || CASE WHEN $7 THEN jsonb_build_object('audience',
               (SELECT COALESCE(jsonb_agg(m.user_id), '[]'::jsonb) FROM memberships m WHERE m.team_id = $2)
               || jsonb_build_array($8::text))
             ELSE '{}'::jsonb END)
        RETURNING seq
        """,
        hackathon_id, team_id, actor_id, action, request_id, payload,
        action in REQUEST_ACTIONS, str(audience_user) if audience_user else None)


async def list_for_team(conn: asyncpg.Connection, team_id: UUID, before_seq: int | None,
                        limit: int) -> list[asyncpg.Record]:
    """Keyset page of a team's audit events, newest first."""
    return await conn.fetch(
        """
        /* route:team_audit */
        SELECT seq, action, actor_id, created_at, payload - 'team' - 'audience' AS payload
        FROM audit_events
        WHERE team_id = $1 AND ($2::bigint IS NULL OR seq < $2)
        ORDER BY seq DESC
        LIMIT $3
        """, team_id, before_seq, limit)
