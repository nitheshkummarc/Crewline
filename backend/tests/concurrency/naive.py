"""Test-only check-then-insert join used as the negative control. Never imported by the app.

Contents:
    weaken_schema: Drop the capacity CHECK so only the application logic can prevent over-filling.
    seed_team: Insert a team with `members` members and `racers` registered outsiders; return (team, code, racer
        ids).
    naive_join: Read count, sleep, insert membership, increment without a predicate; return True if it 'won'.
"""

import uuid

import asyncpg

from app.core.invite_codes import generate_code


async def weaken_schema(conn: asyncpg.Connection) -> None:
    """Drop the capacity CHECK so only the application logic can prevent over-filling."""
    await conn.execute("ALTER TABLE teams DROP CONSTRAINT teams_cap")
    await conn.execute("ALTER TABLE teams ADD CONSTRAINT teams_cap_floor CHECK (member_count >= 1)")


async def seed_team(conn: asyncpg.Connection, hackathon_id: uuid.UUID, members: int, max_size: int,
                    racers: int) -> tuple[uuid.UUID, str, list[uuid.UUID]]:
    """Insert a team with `members` members and `racers` registered outsiders; return (team, code, racer ids)."""
    ids = [row["id"] for row in await conn.fetch(
        "INSERT INTO users (email, password_hash, display_name) "
        "SELECT 'naive-' || gen_random_uuid() || '@example.com', 'x', 'n' FROM generate_series(1, $1) "
        "RETURNING id", members + racers)]
    await conn.execute("INSERT INTO participants (hackathon_id, user_id) SELECT $1, unnest($2::uuid[])",
                       hackathon_id, ids)
    code = generate_code()
    team_id = await conn.fetchval(
        "INSERT INTO teams (hackathon_id, name, leader_id, member_count, min_size, max_size, invite_code, "
        "invite_expires_at) VALUES ($1, 'naive', $2, $3, 1, $4, $5, now() + interval '1 day') RETURNING id",
        hackathon_id, ids[0], members, max_size, code)
    await conn.execute(
        "INSERT INTO memberships (team_id, hackathon_id, user_id) SELECT $1, $2, unnest($3::uuid[])",
        team_id, hackathon_id, ids[:members])
    return team_id, code, ids[members:]


async def naive_join(pool: asyncpg.Pool, team_id: uuid.UUID, hackathon_id: uuid.UUID, user_id: uuid.UUID,
                     sleep_s: float) -> bool:
    """Read count, sleep, insert membership, increment without a predicate; return True if it 'won'."""
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow("SELECT member_count, max_size FROM teams WHERE id = $1", team_id)
        if row["member_count"] >= row["max_size"]:
            return False
        await conn.execute("SELECT pg_sleep($1)", sleep_s)
        await conn.execute("INSERT INTO memberships (team_id, hackathon_id, user_id) VALUES ($1, $2, $3)",
                           team_id, hackathon_id, user_id)
        await conn.execute("UPDATE teams SET member_count = member_count + 1 WHERE id = $1", team_id)
        return True
