"""Signup, login and profile rules."""

from uuid import UUID

import asyncpg

from app.core import ratelimit
from app.core.errors import EmailTaken, InvalidCredentials, RateLimited, Unauthenticated
from app.core.formguard import check_form
from app.core.security import hash_password, verify_password
from app.db.pools import read_conn, write_conn
from app.db.tx import Outcome, WriteContext, run_write
from app.modules.audit import repo as audit
from app.modules.auth import repo
from app.modules.auth.schemas import LoginIn, SignupIn, UpdateMeIn, UserOut


def _user(row: asyncpg.Record) -> dict:
    """Return the public user fields of a row."""
    return UserOut(**{k: row[k] for k in UserOut.model_fields}).model_dump(mode="json")


async def signup(data: SignupIn, ip: str) -> dict:
    """Check the form, rate-limit, hash the password, create the user."""
    # Bot check first: it is stateless, so failed bot posts do not use up a shared IP's signup quota.
    check_form(data.form_token, data.company)
    wait = ratelimit.get().signup.hit(ip)
    if wait:
        raise RateLimited(retry_after=wait)
    password_hash = await hash_password(data.password)
    try:
        async with write_conn() as conn:
            row = await repo.insert_user(conn, data.email.lower(), password_hash, data.display_name,
                                         list(data.skills), data.timezone)
    except asyncpg.UniqueViolationError as exc:
        raise EmailTaken() from exc
    return _user(row)


async def login(data: LoginIn, ip: str) -> dict:
    """Check the form, rate-limit, verify the password, return the user."""
    check_form(data.form_token, data.company)
    email = data.email.lower()
    wait = ratelimit.get().login.hit(f"{ip}|{email}")
    if wait:
        raise RateLimited(retry_after=wait)
    async with read_conn() as conn:
        row = await repo.get_by_email(conn, email)
    if not await verify_password(row["password_hash"] if row else None, data.password) or row is None:
        raise InvalidCredentials()
    return _user(row)


async def me(user_id: UUID) -> dict:
    """Return the signed-in user, or 401 if the account no longer exists."""
    async with read_conn() as conn:
        row = await repo.get_by_id(conn, user_id)
    if row is None:
        raise Unauthenticated()
    return _user(row)


async def update_profile(ctx: WriteContext, data: UpdateMeIn) -> Outcome:
    """Update name, skills and time zone; bump the user's team versions; audit and publish."""
    fields = data.model_dump(exclude_unset=True)

    async def body(conn: asyncpg.Connection) -> Outcome:
        teams = await repo.bump_member_teams(conn, ctx.user_id)
        row = await repo.update_profile(conn, ctx.user_id, fields)
        changed = sorted(fields)
        for team in teams:
            await audit.record(conn, team["hackathon_id"], team["id"], ctx.user_id, "member_profile_updated",
                               {"user_id": ctx.user_id, "fields": changed}, ctx.request_id)
        for hackathon_id in await repo.participations(conn, ctx.user_id):
            await audit.record(conn, hackathon_id, None, ctx.user_id, "participant_updated",
                               {"user_id": ctx.user_id, "fields": changed}, ctx.request_id)
        return Outcome(200, _user(row))

    return await run_write(ctx, body)
