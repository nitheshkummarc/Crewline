"""Profile update against the same user's join, accept and leave: T-RACE-19, T-RACE-20 (B-36, B-37).

Contents:
    _warm_twice: Open two HTTP connections per user, so both requests of one user start at the barrier.
    _deadlock_retries: Return the server's deadlock retry counter from /metrics.
    _assert_clean: Assert no deadlock was retried during the test and every invariant query returns zero rows.
    _assert_events_match: Assert E1 and E2 for one team.
    test_race_19_profile_update_vs_join_and_accept: T-RACE-19 (B-36): profile change vs the same user's join or
        accept; last event current, no deadlock.
    test_race_20_profile_update_vs_leave: T-RACE-20 (B-37): profile change vs the same user's leave never audits or
        bumps the team they left.
"""

import asyncio
import os
import re
import uuid

import pytest
from barrier import fire_together, keyed
from helpers import User, Users, create_team, make_hackathon, query
from invariants import run_checks

ITERATIONS = int(os.environ.get("RACE_ITERATIONS", "20"))
pytestmark = pytest.mark.race
SKILLS = {"skills": ["ml", "devops"]}

# E1: the last event of a team carries the current database snapshot.
# E2: one version never maps to two different snapshots.
LAST_EVENT_IS_SNAPSHOT = """
SELECT (SELECT payload->'team' FROM audit_events WHERE team_id = $1 ORDER BY seq DESC LIMIT 1) = team_snapshot($1)
"""
VERSIONS_WITH_TWO_SNAPSHOTS = """
SELECT count(*) FROM (
  SELECT payload->'team'->'version' FROM audit_events WHERE team_id = $1
  GROUP BY 1 HAVING count(DISTINCT payload->'team') > 1) twice
"""


async def _warm_twice(users: list) -> None:
    """Open two HTTP connections per user, so both requests of one user start at the barrier."""
    await asyncio.gather(*(user.get("/healthz") for user in users for _ in range(2)))


async def _deadlock_retries(user: User) -> int:
    """Return the server's deadlock retry counter from /metrics."""
    text = (await user.get("/metrics")).text
    found = re.search(r'^crewline_tx_events\{kind="deadlock_retries"\} ([0-9.]+)$', text, re.M)
    assert found, "deadlock_retries metric missing"
    return int(float(found.group(1)))


async def _assert_clean(db_url: str, user: User, retries_before: int) -> None:
    """Assert no deadlock was retried during the test and every invariant query returns zero rows."""
    assert await _deadlock_retries(user) == retries_before, "deadlock retried"
    assert not any((await run_checks(db_url)).values()), "invariant violated"


async def _assert_events_match(db_url: str, team_id: str) -> None:
    """Assert E1 and E2 for one team."""
    tid = uuid.UUID(team_id)
    assert (await query(db_url, LAST_EVENT_IS_SNAPSHOT, tid))[0][0] is True, "last team event is stale"
    assert (await query(db_url, VERSIONS_WITH_TWO_SNAPSHOTS, tid))[0][0] == 0, "one version, two snapshots"


async def test_race_19_profile_update_vs_join_and_accept(users: Users, clean_db: str) -> None:
    """T-RACE-19 (B-36): profile change vs the same user's join or accept; last event current, no deadlock."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=8)
    (probe,) = await users.bulk(clean_db, 1, hid)
    retries = await _deadlock_retries(probe)
    for round_no in range(ITERATIONS):
        leader, user = await users.bulk(clean_db, 2, hid)
        tid, code = await create_team(leader, hid)
        await _warm_twice([leader, user])
        if round_no % 2 == 0:
            entry = keyed(user, "POST", "/api/teams/join", {"code": code})
        else:
            created = await user.post(f"/api/teams/{tid}/requests", {})
            assert created.status_code == 201, created.text
            entry = keyed(leader, "POST", f"/api/requests/{created.json()['id']}/accept")
        profile, joined = await fire_together([keyed(user, "PATCH", "/api/users/me", SKILLS), entry])
        assert (profile.status_code, joined.status_code) == (200, 200), (profile.text, joined.text)
        await _assert_events_match(clean_db, tid)
    await _assert_clean(clean_db, probe, retries)


async def test_race_20_profile_update_vs_leave(users: Users, clean_db: str) -> None:
    """T-RACE-20 (B-37): profile change vs the same user's leave never audits or bumps the team they left."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=8)
    (probe,) = await users.bulk(clean_db, 1, hid)
    retries = await _deadlock_retries(probe)
    for _ in range(ITERATIONS):
        leader, user = await users.bulk(clean_db, 2, hid)
        tid, code = await create_team(leader, hid)
        assert (await keyed(user, "POST", "/api/teams/join", {"code": code})()).status_code == 200
        await _warm_twice([user])
        profile, left = await fire_together([keyed(user, "PATCH", "/api/users/me", SKILLS),
                                             keyed(user, "POST", f"/api/teams/{tid}/leave")])
        assert (profile.status_code, left.status_code) == (200, 200), (profile.text, left.text)
        late = await query(clean_db, """
            SELECT count(*) FROM audit_events p
            WHERE p.team_id = $1 AND p.action = 'member_profile_updated' AND p.payload->>'user_id' = $2
              AND p.seq > (SELECT max(seq) FROM audit_events l
                           WHERE l.team_id = $1 AND l.action = 'member_left' AND l.payload->>'user_id' = $2)
            """, uuid.UUID(tid), user.id)
        assert late[0][0] == 0, "profile change audited a team the user had left"
        await _assert_events_match(clean_db, tid)
    await _assert_clean(clean_db, probe, retries)
