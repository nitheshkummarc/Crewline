"""Team rules and transactions (architecture.md 6.1, 6.2, 6.7 to 6.10).

Contents:
    _reraise_constraint: Raise StateChanged for an invite code collision, the mapped DomainError, or the original
        error.
    _explain_leader_failure: Raise 404 or 403 after a 0-row leader update; return the team state for further checks.
    get_team: Return team detail or raise 404.
    get_invite: Return the invite code to a member.
    create_team: Create a team with the caller as leader.
    _record_failed_code: Count a failed invite code attempt against the user and IP limits.
    join_by_code: Normalize the code, then in one transaction take a seat and add the membership; limits after the
        replay.
    _explain_join: After a rolled-back join: 200 already member, 404, 409 finalized / full / already_in_team /
        not_registered.
    _shrink: Decrement a team after a member left or was removed; audit leader promotion and reopening.
    leave: Remove the caller; promote a new leader or delete the team.
    remove_member: Leader removes a member.
    finalize: Leader finalizes a team that meets min size.
    reopen: Leader reopens a finalized team.
    regenerate_invite: Leader replaces the invite code; the old code stops working immediately.
    update_team: Leader changes name or looking flag.
    team_audit: Return a page of the team's audit events to a member.
"""

from uuid import UUID

import asyncpg

from app.core import ratelimit
from app.core.errors import (
    AlreadyInTeam,
    BelowMinSize,
    CannotRemoveSelf,
    InviteInvalid,
    MembersOnly,
    NotAMember,
    NotFinalized,
    NotFound,
    NotLeader,
    NotRegistered,
    RateLimited,
    TeamFinalized,
    TeamFull,
)
from app.core.invite_codes import format_code, generate_code, normalize_code
from app.db.errors import constraint_of, to_domain_error
from app.db.pools import read_conn
from app.db.tx import GuardFailed, Outcome, StateChanged, WriteContext, run_write
from app.modules.audit import repo as audit
from app.modules.teams import repo


def _reraise_constraint(exc: BaseException) -> None:
    """Raise StateChanged for an invite code collision, the mapped DomainError, or the original error."""
    if constraint_of(exc) == "teams_invite_code_unique":
        raise StateChanged()
    mapped = to_domain_error(exc)
    if mapped is not None:
        raise mapped from exc
    raise exc


async def _explain_leader_failure(team_id: UUID, user_id: UUID) -> asyncpg.Record:
    """Raise 404 or 403 after a 0-row leader update; return the team state for further checks."""
    async with read_conn() as conn:
        state = await repo.get_state(conn, team_id)
    if state is None:
        raise NotFound()
    if state["leader_id"] != user_id:
        raise NotLeader()
    return state


async def get_team(team_id: UUID) -> dict:
    """Return team detail or raise 404."""
    async with read_conn() as conn:
        detail = await repo.get_detail(conn, team_id)
    if detail is None:
        raise NotFound()
    return detail


async def get_invite(team_id: UUID, user_id: UUID) -> dict:
    """Return the invite code to a member."""
    async with read_conn() as conn:
        invite = await repo.get_invite(conn, team_id)
        if invite is None:
            raise NotFound()
        if not await repo.is_member(conn, team_id, user_id):
            raise MembersOnly()
    return {"code": format_code(invite["invite_code"]), "expires_at": invite["invite_expires_at"]}


async def create_team(ctx: WriteContext, hackathon_id: UUID, name: str) -> Outcome:
    """Create a team with the caller as leader."""

    async def body(conn: asyncpg.Connection) -> Outcome:
        team = await repo.insert_team(conn, hackathon_id, name, ctx.user_id, generate_code())
        if team is None:
            raise NotFound()
        await repo.insert_membership(conn, team["id"], hackathon_id, ctx.user_id)
        await audit.record(conn, hackathon_id, team["id"], ctx.user_id, "team_created",
                           {"user_id": ctx.user_id, "name": name}, ctx.request_id)
        return Outcome(201, await repo.get_detail(conn, team["id"]))

    async def explain(exc: BaseException) -> Outcome:
        _reraise_constraint(exc)
        raise exc

    return await run_write(ctx, body, explain)


def _record_failed_code(user_id: UUID, ip: str) -> None:
    """Count a failed invite code attempt against the user and IP limits."""
    limits = ratelimit.get()
    limits.code_user.hit(str(user_id))
    limits.code_ip.hit(ip)


async def join_by_code(ctx: WriteContext, raw_code: str, ip: str) -> Outcome:
    """Normalize the code, then in one transaction take a seat and add the membership; limits after the replay."""
    code = normalize_code(raw_code)

    def precheck() -> None:
        """Failed-code limits and the code format; runs after the replay fast path, before the claim (B-41)."""
        limits = ratelimit.get()
        wait = max(limits.code_user.check(str(ctx.user_id)), limits.code_ip.check(ip))
        if wait:
            raise RateLimited(retry_after=wait)
        if code is None:
            _record_failed_code(ctx.user_id, ip)
            raise InviteInvalid()

    valid_code = code or ""  # precheck refuses a malformed code before the body runs

    async def body(conn: asyncpg.Connection) -> Outcome:
        seat = await repo.take_seat_by_code(conn, valid_code)
        if seat is None:
            raise GuardFailed()
        await repo.insert_membership(conn, seat["id"], seat["hackathon_id"], ctx.user_id)
        await audit.record(conn, seat["hackathon_id"], seat["id"], ctx.user_id, "member_joined_via_code",
                           {"user_id": ctx.user_id, "before_count": seat["member_count"] - 1,
                            "after_count": seat["member_count"]}, ctx.request_id)
        return Outcome(200, await repo.get_detail(conn, seat["id"]))

    async def explain(exc: BaseException) -> Outcome:
        return await _explain_join(valid_code, ctx.user_id, ip)

    return await run_write(ctx, body, explain, precheck)


async def _explain_join(code: str, user_id: UUID, ip: str) -> Outcome:
    """After a rolled-back join: 200 already member, 404, 409 finalized / full / already_in_team / not_registered."""
    async with read_conn() as conn:
        team = await repo.find_by_code(conn, code)
        if team is None:
            _record_failed_code(user_id, ip)
            raise InviteInvalid()
        member_of = await repo.get_membership(conn, team["hackathon_id"], user_id)
        if member_of == team["id"]:
            return Outcome(200, await repo.get_detail(conn, team["id"]), store=False)
        if not team["active"]:
            _record_failed_code(user_id, ip)
            raise InviteInvalid()
        if team["status"] == "finalized":
            raise TeamFinalized()
        if team["member_count"] >= team["max_size"]:
            raise TeamFull()
        if member_of is not None:
            raise AlreadyInTeam()
        if not await repo.is_registered(conn, team["hackathon_id"], user_id):
            raise NotRegistered()
    raise StateChanged()


async def _shrink(conn: asyncpg.Connection, ctx: WriteContext, team: asyncpg.Record, leaver_id: UUID,
                  action: str) -> None:
    """Decrement a team after a member left or was removed; audit leader promotion and reopening."""
    row = await repo.shrink_team(conn, team["id"], leaver_id)
    hid, tid = team["hackathon_id"], team["id"]
    await audit.record(conn, hid, tid, ctx.user_id, action,
                       {"user_id": leaver_id, "before_count": team["member_count"],
                        "after_count": row["member_count"]}, ctx.request_id)
    if row["leader_id"] != team["leader_id"]:
        await audit.record(conn, hid, tid, None, "leader_promoted",
                           {"from_user_id": team["leader_id"], "to_user_id": row["leader_id"]}, ctx.request_id)
    if team["status"] == "finalized":
        await audit.record(conn, hid, tid, None, "team_reopened", {}, ctx.request_id)


async def leave(ctx: WriteContext, team_id: UUID) -> Outcome:
    """Remove the caller; promote a new leader or delete the team."""

    async def body(conn: asyncpg.Connection) -> Outcome:
        team = await repo.lock_team(conn, team_id)
        if team is None:
            raise NotFound()
        if not await repo.delete_membership(conn, team_id, ctx.user_id):
            raise NotAMember()
        if team["member_count"] == 1:
            tombstone = await repo.delete_team(conn, team_id) + 1
            hid = team["hackathon_id"]
            await audit.record(conn, hid, team_id, ctx.user_id, "member_left",
                               {"user_id": ctx.user_id, "before_count": 1, "after_count": 0,
                                "version": tombstone}, ctx.request_id)
            await audit.record(conn, hid, team_id, None, "team_deleted", {"version": tombstone}, ctx.request_id)
            return Outcome(200, {"team": None})
        await _shrink(conn, ctx, team, ctx.user_id, "member_left")
        return Outcome(200, {"team": await repo.get_detail(conn, team_id)})

    return await run_write(ctx, body)


async def remove_member(ctx: WriteContext, team_id: UUID, target_id: UUID) -> Outcome:
    """Leader removes a member."""

    async def body(conn: asyncpg.Connection) -> Outcome:
        team = await repo.lock_team(conn, team_id)
        if team is None:
            raise NotFound()
        if team["leader_id"] != ctx.user_id:
            raise NotLeader()
        if target_id == ctx.user_id:
            raise CannotRemoveSelf()
        if not await repo.delete_membership(conn, team_id, target_id):
            raise NotAMember()
        await _shrink(conn, ctx, team, target_id, "member_removed")
        return Outcome(200, await repo.get_detail(conn, team_id))

    return await run_write(ctx, body)


async def finalize(ctx: WriteContext, team_id: UUID) -> Outcome:
    """Leader finalizes a team that meets min size."""

    async def body(conn: asyncpg.Connection) -> Outcome:
        row = await repo.set_status(conn, team_id, ctx.user_id, "forming", "finalized")
        if row is None:
            raise GuardFailed()
        await audit.record(conn, row["hackathon_id"], team_id, ctx.user_id, "team_finalized",
                           {"member_count": row["member_count"]}, ctx.request_id)
        return Outcome(200, await repo.get_detail(conn, team_id))

    async def explain(exc: BaseException) -> Outcome:
        if not isinstance(exc, GuardFailed):
            _reraise_constraint(exc)
        state = await _explain_leader_failure(team_id, ctx.user_id)
        if state["status"] == "finalized":
            raise TeamFinalized()
        if state["member_count"] < state["min_size"]:
            raise BelowMinSize(f"Team needs {state['min_size'] - state['member_count']} more to finalize")
        raise StateChanged()

    return await run_write(ctx, body, explain)


async def reopen(ctx: WriteContext, team_id: UUID) -> Outcome:
    """Leader reopens a finalized team."""

    async def body(conn: asyncpg.Connection) -> Outcome:
        row = await repo.set_status(conn, team_id, ctx.user_id, "finalized", "forming")
        if row is None:
            raise GuardFailed()
        await audit.record(conn, row["hackathon_id"], team_id, ctx.user_id, "team_reopened", {}, ctx.request_id)
        return Outcome(200, await repo.get_detail(conn, team_id))

    async def explain(exc: BaseException) -> Outcome:
        state = await _explain_leader_failure(team_id, ctx.user_id)
        if state["status"] == "forming":
            raise NotFinalized()
        raise StateChanged()

    return await run_write(ctx, body, explain)


async def regenerate_invite(ctx: WriteContext, team_id: UUID) -> Outcome:
    """Leader replaces the invite code; the old code stops working immediately."""

    async def body(conn: asyncpg.Connection) -> Outcome:
        row = await repo.set_invite(conn, team_id, ctx.user_id, generate_code())
        if row is None:
            raise GuardFailed()
        await audit.record(conn, row["hackathon_id"], team_id, ctx.user_id, "invite_regenerated",
                           {"expires_at": row["invite_expires_at"]}, ctx.request_id)
        return Outcome(200, {"code": format_code(row["invite_code"]), "expires_at": row["invite_expires_at"]})

    async def explain(exc: BaseException) -> Outcome:
        if not isinstance(exc, GuardFailed):
            _reraise_constraint(exc)
        await _explain_leader_failure(team_id, ctx.user_id)
        raise StateChanged()

    return await run_write(ctx, body, explain)


async def update_team(ctx: WriteContext, team_id: UUID, name: str | None, looking: bool | None) -> Outcome:
    """Leader changes name or looking flag."""

    async def body(conn: asyncpg.Connection) -> Outcome:
        row = await repo.update_fields(conn, team_id, ctx.user_id, name, looking)
        if row is None:
            raise GuardFailed()
        fields = [f for f, v in (("name", name), ("looking", looking)) if v is not None]
        await audit.record(conn, row["hackathon_id"], team_id, ctx.user_id, "team_updated",
                           {"fields": fields}, ctx.request_id)
        return Outcome(200, await repo.get_detail(conn, team_id))

    async def explain(exc: BaseException) -> Outcome:
        await _explain_leader_failure(team_id, ctx.user_id)
        raise StateChanged()

    return await run_write(ctx, body, explain)


async def team_audit(team_id: UUID, user_id: UUID, before_seq: int | None, limit: int) -> dict:
    """Return a page of the team's audit events to a member."""
    async with read_conn() as conn:
        if await repo.get_state(conn, team_id) is None:
            raise NotFound()
        if not await repo.is_member(conn, team_id, user_id):
            raise MembersOnly()
        rows = await audit.list_for_team(conn, team_id, before_seq, limit)
    items = [dict(r) for r in rows]
    next_cursor = str(items[-1]["seq"]) if len(items) == limit else None
    return {"items": items, "next_cursor": next_cursor}
