"""Last-seat races and idempotency under concurrency: T-RACE-01, 10, 11, 12, 16.

Contents:
    _team_with_one_seat: Create a team of max 4 with 3 members; return (team id, code, members).
    _member_count: Return (teams.member_count, membership rows) for a team.
    test_race_01_last_seat_50_way: T-RACE-01: 50 users race for one seat; exactly one wins, 49 get team_full, every
        iteration.
    test_race_16_retry_racing_its_original: T-RACE-16: two copies of one keyed join race 48 others for the last
        seat; both copies get the same answer.
    test_race_10_same_key_twenty_times: T-RACE-10: one join sent 20 times at once with one key creates one
        membership and 20 identical bodies.
    test_race_11_retry_after_winning_last_seat: T-RACE-11: a retry of a winning last-seat join, sent after it
        committed, replays 200 (not 409).
    test_race_12_key_reused_after_rejection: T-RACE-12: a key that got 409 is not stored; the same key succeeds once
        a seat frees up.
"""

import os
import uuid
from collections import Counter

import pytest
from barrier import close, fire_together, keyed, warm
from helpers import Users, create_team, join, key, make_hackathon, query

ITERATIONS = int(os.environ.get("RACE_ITERATIONS", "20"))
pytestmark = pytest.mark.race


async def _team_with_one_seat(users: Users, db_url: str, hid: str, name: str) -> tuple[str, str, list]:
    """Create a team of max 4 with 3 members; return (team id, code, members)."""
    leader, m1, m2 = await users.bulk(db_url, 3, hid)
    tid, code = await create_team(leader, hid, name)
    for member in (m1, m2):
        assert (await join(member, code)).status_code == 200
    return tid, code, [leader, m1, m2]


async def _member_count(db_url: str, tid: str) -> tuple[int, int]:
    """Return (teams.member_count, membership rows) for a team."""
    rows = await query(db_url, "SELECT member_count, (SELECT count(*) FROM memberships WHERE team_id = $1) AS n "
                               "FROM teams WHERE id = $1", uuid.UUID(tid))
    return rows[0]["member_count"], rows[0]["n"]


async def test_race_01_last_seat_50_way(users: Users, clean_db: str) -> None:
    """T-RACE-01: 50 users race for one seat; exactly one wins, 49 get team_full, every iteration."""
    hid = await make_hackathon(clean_db, min_size=2, max_size=4)
    for i in range(ITERATIONS):
        tid, code, _ = await _team_with_one_seat(users, clean_db, hid, f"Race {i}")
        racers = await users.bulk(clean_db, 50, hid)
        await warm(racers)
        responses = await fire_together([keyed(u, "POST", "/api/teams/join", {"code": code}) for u in racers])
        statuses = Counter(r.status_code for r in responses)
        errors = Counter(r.json()["error"]["code"] for r in responses if r.status_code != 200)
        assert statuses[200] == 1, f"iteration {i}: {statuses}"
        assert errors == Counter({"team_full": 49}), f"iteration {i}: {errors}"
        assert await _member_count(clean_db, tid) == (4, 4)
        await close(racers)


async def test_race_16_retry_racing_its_original(users: Users, clean_db: str) -> None:
    """T-RACE-16: two copies of one keyed join race 48 others for the last seat; both copies get the same answer."""
    hid = await make_hackathon(clean_db, min_size=2, max_size=4)
    for i in range(max(ITERATIONS // 2, 5)):
        tid, code, _ = await _team_with_one_seat(users, clean_db, hid, f"Dup {i}")
        racers = await users.bulk(clean_db, 49, hid)
        await warm(racers)
        dup, others = racers[0], racers[1:]
        idem = key()
        calls = [keyed(dup, "POST", "/api/teams/join", {"code": code}, idem=idem) for _ in range(2)]
        calls += [keyed(u, "POST", "/api/teams/join", {"code": code}) for u in others]
        responses = await fire_together(calls)
        first, second = responses[0], responses[1]
        assert first.status_code == second.status_code, f"iteration {i}: {first.text} vs {second.text}"
        if first.status_code == 200:
            assert first.content == second.content
        else:
            assert first.json()["error"]["code"] == second.json()["error"]["code"] == "team_full"
        winners = (1 if first.status_code == 200 else 0) + sum(r.status_code == 200 for r in responses[2:])
        assert winners == 1
        assert await _member_count(clean_db, tid) == (4, 4)
        await close(racers)


async def test_race_10_same_key_twenty_times(users: Users, clean_db: str) -> None:
    """T-RACE-10: one join sent 20 times at once with one key creates one membership and 20 identical bodies."""
    hid = await make_hackathon(clean_db, min_size=2, max_size=4)
    leader, member = await users.bulk(clean_db, 2, hid)
    tid, code = await create_team(leader, hid)
    idem = key()
    responses = await fire_together([keyed(member, "POST", "/api/teams/join", {"code": code}, idem=idem)
                                     for _ in range(20)])
    assert {r.status_code for r in responses} == {200}
    assert len({r.content for r in responses}) == 1
    assert await _member_count(clean_db, tid) == (2, 2)


async def test_race_11_retry_after_winning_last_seat(users: Users, clean_db: str) -> None:
    """T-RACE-11: a retry of a winning last-seat join, sent after it committed, replays 200 (not 409)."""
    hid = await make_hackathon(clean_db, min_size=2, max_size=4)
    tid, code, _ = await _team_with_one_seat(users, clean_db, hid, "Retry")
    (winner,) = await users.bulk(clean_db, 1, hid)
    idem = key()
    first = await winner.post("/api/teams/join", {"code": code}, idem=idem)
    retry = await winner.post("/api/teams/join", {"code": code}, idem=idem)
    assert first.status_code == retry.status_code == 200
    assert first.content == retry.content


async def test_race_12_key_reused_after_rejection(users: Users, clean_db: str) -> None:
    """T-RACE-12: a key that got 409 is not stored; the same key succeeds once a seat frees up."""
    hid = await make_hackathon(clean_db, min_size=2, max_size=4)
    tid, code, members = await _team_with_one_seat(users, clean_db, hid, "Reuse")
    (filler, late) = await users.bulk(clean_db, 2, hid)
    assert (await join(filler, code)).status_code == 200
    idem = key()
    rejected = await late.post("/api/teams/join", {"code": code}, idem=idem)
    assert rejected.status_code == 409
    assert (await filler.post(f"/api/teams/{tid}/leave")).status_code == 200
    accepted = await late.post("/api/teams/join", {"code": code}, idem=idem)
    assert accepted.status_code == 200
