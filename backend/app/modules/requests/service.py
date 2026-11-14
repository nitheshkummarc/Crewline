"""Join request rules and transactions (architecture.md 6.3 to 6.6).

Contents:
    _request_body: Return a request in the API shape; StateChanged (retry) if it vanished inside the transaction.
    create_request: Lock the team (forming, not full) and the participant row (cap 5), then create a pending
        request.
    accept: Leader accepts: seat, request transition, membership; a requester already in a team makes it stale.
    _explain_accept: After a 0-row seat update on accept: 404, 403, 409 finalized or full, or StateChanged.
    _mark_stale: Follow-up transaction that marks a request stale and audits it (no idempotency claim).
    decline: Leader declines a pending request.
    withdraw: Requester withdraws a pending request.
    list_for_team: Pending requests for the leader, hiding users already in a team.
    list_mine: The caller's requests in a hackathon, newest first.
"""

from uuid import UUID

import asyncpg

from app.core.errors import (
    AlreadyInTeam,
    NotFound,
    NotLeader,
    NotRegistered,
    RequestNotPending,
    TeamFinalized,
    TeamFull,
    TooManyPendingRequests,
)
from app.db.errors import constraint_of, to_domain_error
from app.db.pools import read_conn
from app.db.tx import GuardFailed, Outcome, StateChanged, WriteContext, run_plain_write, run_write
from app.modules.audit import repo as audit
from app.modules.hackathons import repo as hackathons_repo
from app.modules.requests import repo
from app.modules.teams import repo as teams_repo

MAX_PENDING = 5


async def _request_body(conn: asyncpg.Connection, request_id: UUID) -> dict:
    """Return a request in the API shape; StateChanged (retry) if it vanished inside the transaction."""
    row = await repo.get_request(conn, request_id)
    if row is None:
        raise StateChanged()
    return dict(row)


async def create_request(ctx: WriteContext, team_id: UUID, message: str | None) -> Outcome:
    """Lock the team (forming, not full) and the participant row (cap 5), then create a pending request."""

    async def body(conn: asyncpg.Connection) -> Outcome:
        # Team row first (FOR SHARE): a request cannot be created while the team fills or finalizes.
        team = await teams_repo.lock_team_shared(conn, team_id)
        if team is None:
            raise NotFound()
        if team["status"] == "finalized":
            raise TeamFinalized()
        if team["member_count"] >= team["max_size"]:
            raise TeamFull()
        hackathon_id = team["hackathon_id"]
        if await teams_repo.get_membership(conn, hackathon_id, ctx.user_id) is not None:
            raise AlreadyInTeam()
        # Participant row second: serializes this user's request creations so the cap is exact.
        if not await repo.lock_participant(conn, hackathon_id, ctx.user_id):
            raise NotRegistered()
        existing = await repo.get_pending(conn, team_id, ctx.user_id)
        if existing is not None:
            return Outcome(200, dict(existing), store=False)
        if await repo.count_pending_for_user(conn, hackathon_id, ctx.user_id) >= MAX_PENDING:
            raise TooManyPendingRequests()
        request_id = await repo.insert_request(conn, team_id, hackathon_id, ctx.user_id, message)
        if request_id is None:
            raise StateChanged()
        await audit.record(conn, hackathon_id, team_id, ctx.user_id, "request_created",
                           {"request_id": request_id, "user_id": ctx.user_id}, ctx.request_id)
        return Outcome(201, await _request_body(conn, request_id))

    return await run_write(ctx, body)


async def accept(ctx: WriteContext, request_id: UUID) -> Outcome:
    """Leader accepts: seat, request transition, membership; a requester already in a team makes it stale."""

    async def body(conn: asyncpg.Connection) -> Outcome:
        ids = await repo.get_ids(conn, request_id)
        if ids is None:
            raise NotFound()
        team_id, hackathon_id = ids["team_id"], ids["hackathon_id"]
        seat = await teams_repo.take_seat_as_leader(conn, team_id, ctx.user_id)
        if seat is None:
            raise GuardFailed(team_id)
        requester = await repo.transition(conn, request_id, team_id, "pending", "accepted", ctx.user_id)
        if requester is None:
            raise RequestNotPending()
        # 23505 here means the requester joined another team; the seat increment rolls back.
        await teams_repo.insert_membership(conn, team_id, hackathon_id, requester)
        await audit.record(conn, hackathon_id, team_id, ctx.user_id, "request_accepted",
                           {"request_id": request_id, "user_id": requester,
                            "before_count": seat["member_count"] - 1, "after_count": seat["member_count"]},
                           ctx.request_id)
        return Outcome(200, await teams_repo.get_detail(conn, team_id))

    async def explain(exc: BaseException) -> Outcome:
        if isinstance(exc, GuardFailed):
            return await _explain_accept(exc.info, ctx.user_id)
        if constraint_of(exc) in ("memberships_one_team_per_hackathon", "memberships_pkey"):
            await _mark_stale(request_id, ctx.user_id, ctx.request_id)
            raise AlreadyInTeam("The requester already joined a team")
        mapped = to_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise exc

    return await run_write(ctx, body, explain)


async def _explain_accept(team_id: UUID, user_id: UUID) -> Outcome:
    """After a 0-row seat update on accept: 404, 403, 409 finalized or full, or StateChanged."""
    async with read_conn() as conn:
        state = await teams_repo.get_state(conn, team_id)
    if state is None:
        raise NotFound()
    if state["leader_id"] != user_id:
        raise NotLeader()
    if state["status"] == "finalized":
        raise TeamFinalized()
    if state["member_count"] >= state["max_size"]:
        raise TeamFull()
    raise StateChanged()


async def _mark_stale(request_id: UUID, actor_id: UUID, request_tag: str | None) -> None:
    """Follow-up transaction that marks a request stale and audits it (no idempotency claim)."""

    async def body(conn: asyncpg.Connection) -> None:
        row = await repo.mark_stale(conn, request_id, actor_id)
        if row is not None:
            await audit.record(conn, row["hackathon_id"], row["team_id"], actor_id, "request_stale",
                               {"request_id": request_id, "user_id": row["user_id"]}, request_tag)

    await run_plain_write(body)


async def decline(ctx: WriteContext, request_id: UUID) -> Outcome:
    """Leader declines a pending request."""

    async def body(conn: asyncpg.Connection) -> Outcome:
        ids = await repo.get_ids(conn, request_id)
        if ids is None:
            raise NotFound()
        # FOR SHARE blocks a concurrent leader change, so a leader who just left cannot decline.
        team = await teams_repo.lock_team_shared(conn, ids["team_id"])
        if team is None:
            raise NotFound()
        if team["leader_id"] != ctx.user_id:
            raise NotLeader()
        requester = await repo.transition(conn, request_id, ids["team_id"], "pending", "declined", ctx.user_id)
        if requester is None:
            raise RequestNotPending()
        await audit.record(conn, ids["hackathon_id"], ids["team_id"], ctx.user_id, "request_declined",
                           {"request_id": request_id, "user_id": requester}, ctx.request_id)
        return Outcome(200, await _request_body(conn, request_id))

    return await run_write(ctx, body)


async def withdraw(ctx: WriteContext, request_id: UUID) -> Outcome:
    """Requester withdraws a pending request."""

    async def body(conn: asyncpg.Connection) -> Outcome:
        row = await repo.withdraw(conn, request_id, ctx.user_id)
        if row is None:
            current = await repo.get_request(conn, request_id)
            if current is None or current["user_id"] != ctx.user_id:
                raise NotFound()
            raise RequestNotPending()
        await audit.record(conn, row["hackathon_id"], row["team_id"], ctx.user_id, "request_withdrawn",
                           {"request_id": request_id, "user_id": ctx.user_id}, ctx.request_id)
        return Outcome(200, await _request_body(conn, request_id))

    return await run_write(ctx, body)


async def list_for_team(team_id: UUID, user_id: UUID) -> list[dict]:
    """Pending requests for the leader, hiding users already in a team."""
    async with read_conn() as conn:
        state = await teams_repo.get_state(conn, team_id)
        if state is None:
            raise NotFound()
        if state["leader_id"] != user_id:
            raise NotLeader()
        return [dict(r) for r in await repo.list_pending_for_team(conn, team_id)]


async def list_mine(hackathon_id: UUID, user_id: UUID) -> list[dict]:
    """The caller's requests in a hackathon, newest first."""
    async with read_conn() as conn:
        if await hackathons_repo.get(conn, hackathon_id) is None:
            raise NotFound()
        return [dict(r) for r in await hackathons_repo.my_requests(conn, hackathon_id, user_id)]
