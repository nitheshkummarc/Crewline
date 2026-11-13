"""Scheduled overlaps forced with an external row lock: T-RACE-21 (in-flight key claim), T-RACE-22 (request vs seat)."""

import asyncio
import uuid

import asyncpg
import pytest
from helpers import Users, create_team, key, make_hackathon, query

pytestmark = pytest.mark.race
LOCK_PARTICIPANT = "SELECT 1 FROM participants WHERE user_id = $1 FOR UPDATE"


async def wait_for_waiters(conn: asyncpg.Connection, count: int) -> None:
    """Wait until count write backends wait on a lock (poll up to 2 s); the write lock_timeout is 1 s."""
    for _ in range(400):
        waiting = await conn.fetchval("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'crewline-write' "
                                      "AND wait_event_type = 'Lock' AND datname = current_database()")
        if waiting >= count:
            return
        await asyncio.sleep(0.005)
    raise AssertionError(f"expected {count} lock waiters")


async def test_race_21_duplicates_of_an_in_flight_key_replay(users: Users, clean_db: str) -> None:
    """T-RACE-21: duplicates that find the key claimed by an uncommitted original replay it; one team is created."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=4)
    (creator,) = await users.bulk(clean_db, 1, hid)
    fixed = key()
    holder = await asyncpg.connect(clean_db)
    try:
        tx = holder.transaction()
        await tx.start()
        # The create blocks on the membership FK after claiming its key; duplicates then block on the key row.
        await holder.execute(LOCK_PARTICIPANT, uuid.UUID(creator.id))
        send = lambda: creator.post(f"/api/hackathons/{hid}/teams", {"name": "Once"}, idem=fixed)  # noqa: E731
        original = asyncio.create_task(send())
        await wait_for_waiters(holder, 1)
        duplicates = [asyncio.create_task(send()) for _ in range(3)]
        await wait_for_waiters(holder, 4)
        await tx.rollback()
        responses = [await original] + [await d for d in duplicates]
    finally:
        await holder.close()
    assert {r.status_code for r in responses} == {201}, [r.text for r in responses]
    assert len({r.content for r in responses}) == 1
    teams = await query(clean_db, "SELECT count(*) FROM teams WHERE leader_id = $1", uuid.UUID(creator.id))
    assert teams[0][0] == 1


async def test_race_22_request_waits_for_an_uncommitted_last_seat(users: Users, clean_db: str) -> None:
    """T-RACE-22: a request created while a join holds the last seat uncommitted is refused as team_full."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=2)
    leader, joiner, asker = await users.bulk(clean_db, 3, hid)
    tid, code = await create_team(leader, hid)
    holder = await asyncpg.connect(clean_db)
    try:
        tx = holder.transaction()
        await tx.start()
        # The join takes the last seat on the team row, then blocks on the membership FK.
        await holder.execute(LOCK_PARTICIPANT, uuid.UUID(joiner.id))
        joined = asyncio.create_task(joiner.post("/api/teams/join", {"code": code}))
        await wait_for_waiters(holder, 1)
        requested = asyncio.create_task(asker.post(f"/api/teams/{tid}/requests", {}))
        await asyncio.sleep(0.2)
        await tx.rollback()
        join_response, request_response = await joined, await requested
    finally:
        await holder.close()
    assert join_response.status_code == 200, join_response.text
    assert request_response.status_code == 409 and request_response.json()["error"]["code"] == "team_full"
