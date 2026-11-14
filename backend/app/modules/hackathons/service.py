"""Participant registration and status.

Contents:
    list_hackathons: Return all hackathons.
    get_hackathon: Return one hackathon or raise 404.
    my_status: Return registration, looking flag, team and pending requests.
    register: Insert the participant row if missing; audit participant_registered when inserted.
    set_looking: Update the looking flag; audit participant_updated when it changed.
"""

from uuid import UUID

import asyncpg

from app.core.errors import NotFound, NotRegistered
from app.db.pools import read_conn
from app.db.tx import Outcome, WriteContext, run_write
from app.modules.audit import repo as audit
from app.modules.hackathons import repo


async def list_hackathons() -> list[dict]:
    """Return all hackathons."""
    async with read_conn() as conn:
        return [dict(row) for row in await repo.list_all(conn)]


async def get_hackathon(hackathon_id: UUID) -> dict:
    """Return one hackathon or raise 404."""
    async with read_conn() as conn:
        row = await repo.get(conn, hackathon_id)
    if row is None:
        raise NotFound()
    return dict(row)


async def my_status(hackathon_id: UUID, user_id: UUID) -> dict:
    """Return registration, looking flag, team and pending requests."""
    async with read_conn() as conn:
        if await repo.get(conn, hackathon_id) is None:
            raise NotFound()
        participant = await repo.get_participant(conn, hackathon_id, user_id)
        team = await repo.my_team(conn, hackathon_id, user_id)
        requests = await repo.my_requests(conn, hackathon_id, user_id)
    return {
        "registered": participant is not None,
        "looking": participant["looking"] if participant else False,
        "team": team,
        "pending_requests": [dict(r) for r in requests if r["status"] == "pending"],
    }


async def register(ctx: WriteContext, hackathon_id: UUID) -> Outcome:
    """Insert the participant row if missing; audit participant_registered when inserted."""

    async def body(conn: asyncpg.Connection) -> Outcome:
        if await repo.get(conn, hackathon_id) is None:
            raise NotFound()
        row = await repo.insert_participant(conn, hackathon_id, ctx.user_id)
        if row is None:
            current = await repo.get_participant(conn, hackathon_id, ctx.user_id)
            looking = bool(current and current["looking"])
            return Outcome(200, {"registered": True, "looking": looking}, store=False)
        await audit.record(conn, hackathon_id, None, ctx.user_id, "participant_registered",
                           {"user_id": ctx.user_id, "looking": row["looking"]}, ctx.request_id)
        return Outcome(200, {"registered": True, "looking": row["looking"]})

    return await run_write(ctx, body)


async def set_looking(ctx: WriteContext, hackathon_id: UUID, looking: bool) -> Outcome:
    """Update the looking flag; audit participant_updated when it changed."""

    async def body(conn: asyncpg.Connection) -> Outcome:
        row = await repo.set_looking(conn, hackathon_id, ctx.user_id, looking)
        if row is None:
            if await repo.get_participant(conn, hackathon_id, ctx.user_id) is None:
                raise NotRegistered()
            return Outcome(200, {"registered": True, "looking": looking}, store=False)
        await audit.record(conn, hackathon_id, None, ctx.user_id, "participant_updated",
                           {"user_id": ctx.user_id, "fields": ["looking"], "looking": looking}, ctx.request_id)
        return Outcome(200, {"registered": True, "looking": looking})

    return await run_write(ctx, body)
