"""Race lab SQL: the hidden lab hackathon, synthetic participants, and the facts read back after an experiment."""

from uuid import UUID

import asyncpg


async def ensure_lab_hackathon(conn: asyncpg.Connection) -> UUID:
    """Return the lab hackathon id, creating it once (hackathons_one_lab keeps it unique)."""
    await conn.execute(
        "/* route:lab */ INSERT INTO hackathons (name, min_team_size, max_team_size, invite_ttl, is_lab) "
        "VALUES ('Race lab', 2, 4, interval '1 hour', true) ON CONFLICT (is_lab) WHERE is_lab DO NOTHING")
    return await conn.fetchval("/* route:lab */ SELECT id FROM hackathons WHERE is_lab")


async def create_participants(conn: asyncpg.Connection, hackathon_id: UUID, count: int,
                              label: str) -> list[asyncpg.Record]:
    """Insert synthetic users that cannot log in (no valid password hash) and register them; return id and name."""
    users = await conn.fetch(
        "/* route:lab */ INSERT INTO users (email, password_hash, display_name, skills) "
        "SELECT 'lab-' || gen_random_uuid() || '@example.com', '!lab', $2 || ' ' || lpad(g::text, 3, '0'), "
        "ARRAY[(ARRAY['frontend','backend','ml','design','devops','pitch'])[1 + g % 6]] "
        "FROM generate_series(1, $1) g ORDER BY g RETURNING id, display_name", count, label)
    await conn.execute(
        "/* route:lab */ INSERT INTO participants (hackathon_id, user_id, looking) "
        "SELECT $1, unnest($2::uuid[]), false",
        hackathon_id, [row["id"] for row in users])
    return list(users)


async def team_facts(conn: asyncpg.Connection, team_id: UUID) -> asyncpg.Record:
    """Read member_count, max_size, the membership rows and the join audit events of a team."""
    return await conn.fetchrow(
        "/* route:lab */ SELECT t.member_count, t.max_size, t.version, "
        "(SELECT count(*) FROM memberships m WHERE m.team_id = t.id) AS memberships, "
        "(SELECT count(*) FROM audit_events a WHERE a.team_id = t.id "
        " AND a.action IN ('member_joined_via_code', 'request_accepted')) AS join_events "
        "FROM teams t WHERE t.id = $1", team_id)


async def user_facts(conn: asyncpg.Connection, hackathon_id: UUID, team_id: UUID, user_id: UUID) -> asyncpg.Record:
    """Read how many memberships and join events one user has (to prove a spammed join counted once)."""
    return await conn.fetchrow(
        "/* route:lab */ SELECT "
        "(SELECT count(*) FROM memberships WHERE hackathon_id = $1 AND user_id = $3) AS memberships, "
        "(SELECT count(*) FROM audit_events WHERE team_id = $2 AND action = 'member_joined_via_code' "
        " AND payload->>'user_id' = $3::text) AS join_events, "
        "(SELECT count(*) FROM idempotency_keys WHERE user_id = $3 AND response_status IS NOT NULL) AS stored_keys",
        hackathon_id, team_id, user_id)
