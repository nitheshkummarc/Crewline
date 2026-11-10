"""Overlapping operations: T-RACE-04, 08, 09."""

import asyncio
import os
import uuid
from collections import Counter

import pytest
from barrier import close, fire_together, keyed, warm
from helpers import Users, create_team, join, make_hackathon, query

ITERATIONS = int(os.environ.get("RACE_ITERATIONS", "20"))
pytestmark = pytest.mark.race


async def test_race_04_one_user_joins_two_teams(users: Users, clean_db: str) -> None:
    """T-RACE-04: one user joins two teams at the same instant; exactly one membership, the other team unchanged."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=4)
    for _ in range(max(ITERATIONS // 2, 5)):
        lead_a, lead_b, user = await users.bulk(clean_db, 3, hid)
        _, code_a = await create_team(lead_a, hid, "A")
        _, code_b = await create_team(lead_b, hid, "B")
        await warm([user])
        a, b = await fire_together([keyed(user, "POST", "/api/teams/join", {"code": code_a}),
                                    keyed(user, "POST", "/api/teams/join", {"code": code_b})])
        assert sorted([a.status_code, b.status_code]) == [200, 409]
        loser = a if a.status_code == 409 else b
        assert loser.json()["error"]["code"] == "already_in_team"
        rows = await query(clean_db, "SELECT count(*) AS n FROM memberships WHERE user_id = $1", uuid.UUID(user.id))
        assert rows[0]["n"] == 1


async def test_race_08_leader_leaves_while_users_join(users: Users, clean_db: str) -> None:
    """T-RACE-08: the leader leaves while 8 users join; the new leader is always a member (I3 via clean_db)."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=10)
    for i in range(5):
        leader, member = await users.bulk(clean_db, 2, hid)
        tid, code = await create_team(leader, hid, f"Handover {i}")
        assert (await join(member, code)).status_code == 200
        joiners = await users.bulk(clean_db, 8, hid)
        await warm([*joiners, leader])
        calls = [keyed(leader, "POST", f"/api/teams/{tid}/leave")]
        calls += [keyed(u, "POST", "/api/teams/join", {"code": code}) for u in joiners]
        responses = await fire_together(calls)
        assert all(r.status_code == 200 for r in responses), [r.text for r in responses if r.status_code != 200]
        team = (await member.get(f"/api/teams/{tid}")).json()
        assert team["member_count"] == 9 and team["leader_id"] != leader.id
        assert team["leader_id"] in {m["user_id"] for m in team["members"]}
        await close(joiners)


async def test_race_09_last_member_leaves_while_users_join(users: Users, clean_db: str) -> None:
    """T-RACE-09: the only member leaves while 10 users join; no deadlock or 500, outcomes stay consistent."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=10)
    for i in range(max(ITERATIONS // 2, 5)):
        (leader,) = await users.bulk(clean_db, 1, hid)
        tid, code = await create_team(leader, hid, f"Last {i}")
        joiners = await users.bulk(clean_db, 10, hid)
        await warm([*joiners, leader])
        calls = [keyed(leader, "POST", f"/api/teams/{tid}/leave")]
        calls += [keyed(u, "POST", "/api/teams/join", {"code": code}) for u in joiners]
        responses = await fire_together(calls)
        assert responses[0].status_code == 200
        statuses = Counter(r.status_code for r in responses[1:])
        assert set(statuses) <= {200, 404}, statuses
        rows = await query(clean_db, "SELECT member_count FROM teams WHERE id = $1", uuid.UUID(tid))
        if rows:
            assert rows[0]["member_count"] == statuses[200]
        else:
            assert statuses[200] == 0
        await close(joiners)
        await asyncio.sleep(0)
