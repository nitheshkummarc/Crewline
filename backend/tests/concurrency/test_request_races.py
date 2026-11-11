"""Join request races: T-RACE-05, 06, 07, 13, 17, 18."""

import os
import uuid
from collections import Counter

import pytest
from barrier import close, fire_together, keyed, warm
from helpers import Users, create_team, make_hackathon, query

ITERATIONS = int(os.environ.get("RACE_ITERATIONS", "20"))
ROUNDS = max(ITERATIONS // 2, 5)
pytestmark = pytest.mark.race


def _error(response) -> str | None:
    """Return the error code of a response, or None for a 2xx."""
    return None if response.status_code < 300 else response.json()["error"]["code"]


async def _count(db_url: str, tid: str) -> tuple[int, int]:
    """Return (teams.member_count, membership rows) for a team."""
    rows = await query(db_url, "SELECT member_count, (SELECT count(*) FROM memberships WHERE team_id = $1) AS n "
                               "FROM teams WHERE id = $1", uuid.UUID(tid))
    return rows[0]["member_count"], rows[0]["n"]


async def _request(user, tid: str) -> str:
    """Create a join request and return its id."""
    response = await user.post(f"/api/teams/{tid}/requests", {})
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def test_race_05_code_join_vs_accept_for_last_seat(users: Users, clean_db: str) -> None:
    """T-RACE-05: a code join and a leader accept race for the last seat; exactly one new member."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=2)
    for _ in range(ROUNDS):
        leader, asker, joiner = await users.bulk(clean_db, 3, hid)
        tid, code = await create_team(leader, hid)
        rid = await _request(asker, tid)
        await warm([leader, joiner])
        accept, joined = await fire_together([keyed(leader, "POST", f"/api/requests/{rid}/accept"),
                                              keyed(joiner, "POST", "/api/teams/join", {"code": code})])
        assert sorted([accept.status_code, joined.status_code]) == [200, 409], (accept.text, joined.text)
        assert {_error(accept), _error(joined)} == {None, "team_full"}
        assert await _count(clean_db, tid) == (2, 2)


async def test_race_06_two_leaders_accept_same_user(users: Users, clean_db: str) -> None:
    """T-RACE-06: two leaders accept the same user at once; one membership, the other request goes stale."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=4)
    for _ in range(ROUNDS):
        lead_a, lead_b, asker = await users.bulk(clean_db, 3, hid)
        tid_a, _ = await create_team(lead_a, hid, "A")
        tid_b, _ = await create_team(lead_b, hid, "B")
        rid_a, rid_b = await _request(asker, tid_a), await _request(asker, tid_b)
        await warm([lead_a, lead_b])
        a, b = await fire_together([keyed(lead_a, "POST", f"/api/requests/{rid_a}/accept"),
                                    keyed(lead_b, "POST", f"/api/requests/{rid_b}/accept")])
        assert sorted([a.status_code, b.status_code]) == [200, 409], (a.text, b.text)
        loser_rid, loser_tid = (rid_b, tid_b) if a.status_code == 200 else (rid_a, tid_a)
        assert _error(b if a.status_code == 200 else a) == "already_in_team"
        statuses = await query(clean_db, "SELECT status FROM join_requests WHERE id = $1", uuid.UUID(loser_rid))
        assert statuses[0]["status"] == "stale"
        assert await _count(clean_db, loser_tid) == (1, 1)
        memberships = await query(clean_db, "SELECT count(*) AS n FROM memberships WHERE user_id = $1",
                                  uuid.UUID(asker.id))
        assert memberships[0]["n"] == 1


async def test_race_07_same_request_accepted_twice(users: Users, clean_db: str) -> None:
    """T-RACE-07: the same request accepted twice at once (two tabs); the count goes up once."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=4)
    for _ in range(ROUNDS):
        leader, asker = await users.bulk(clean_db, 2, hid)
        tid, _ = await create_team(leader, hid)
        rid = await _request(asker, tid)
        await warm([leader])
        first, second = await fire_together([keyed(leader, "POST", f"/api/requests/{rid}/accept"),
                                             keyed(leader, "POST", f"/api/requests/{rid}/accept")])
        assert sorted([first.status_code, second.status_code]) == [200, 409]
        assert {_error(first), _error(second)} == {None, "request_not_pending"}
        assert await _count(clean_db, tid) == (2, 2)


async def test_race_13_accept_vs_withdraw(users: Users, clean_db: str) -> None:
    """T-RACE-13: accept and withdraw of one request race; exactly one transition wins."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=4)
    outcomes: Counter = Counter()
    for _ in range(ROUNDS):
        leader, asker = await users.bulk(clean_db, 2, hid)
        tid, _ = await create_team(leader, hid)
        rid = await _request(asker, tid)
        await warm([leader, asker])
        accept, withdraw = await fire_together([keyed(leader, "POST", f"/api/requests/{rid}/accept"),
                                                keyed(asker, "POST", f"/api/requests/{rid}/withdraw")])
        status = (await query(clean_db, "SELECT status FROM join_requests WHERE id = $1", uuid.UUID(rid)))[0]["status"]
        if accept.status_code == 200:
            assert _error(withdraw) == "request_not_pending" and status == "accepted"
            assert await _count(clean_db, tid) == (2, 2)
        else:
            assert withdraw.status_code == 200 and _error(accept) == "request_not_pending"
            assert status == "withdrawn" and await _count(clean_db, tid) == (1, 1)
        outcomes[status] += 1
    assert sum(outcomes.values()) == ROUNDS


async def test_race_17_requests_while_team_fills(users: Users, clean_db: str) -> None:
    """T-RACE-17: no request is created after the team became full (ordered by audit sequence under the team lock)."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=10)
    for _ in range(max(ROUNDS // 2, 3)):
        (leader,) = await users.bulk(clean_db, 1, hid)
        tid, code = await create_team(leader, hid)
        askers = await users.bulk(clean_db, 20, hid)
        joiners = await users.bulk(clean_db, 20, hid)
        await warm(askers + joiners)
        calls = [keyed(u, "POST", f"/api/teams/{tid}/requests", {}) for u in askers]
        calls += [keyed(u, "POST", "/api/teams/join", {"code": code}) for u in joiners]
        responses = await fire_together(calls)
        request_codes = Counter(r.status_code if r.status_code < 300 else _error(r) for r in responses[:20])
        join_codes = Counter(r.status_code if r.status_code < 300 else _error(r) for r in responses[20:])
        assert set(request_codes) <= {201, "team_full"}, request_codes
        assert join_codes[200] == 9 and join_codes["team_full"] == 11, join_codes
        events = await query(clean_db, "SELECT seq, action, payload->>'after_count' AS after FROM audit_events "
                                       "WHERE team_id = $1 ORDER BY seq", uuid.UUID(tid))
        filled = next(e["seq"] for e in events if e["action"] == "member_joined_via_code" and e["after"] == "10")
        late = [e["seq"] for e in events if e["action"] == "request_created" and e["seq"] > filled]
        assert late == [], f"requests created after the team filled: {late}"
        assert request_codes[201] == sum(1 for e in events if e["action"] == "request_created")
        await close(askers + joiners)


async def test_race_18_pending_cap_is_exact(users: Users, clean_db: str) -> None:
    """T-RACE-18: one user fires 8 requests to 8 teams at once; exactly 5 are created."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=4)
    for _ in range(max(ROUNDS // 2, 3)):
        leaders = await users.bulk(clean_db, 8, hid)
        (asker,) = await users.bulk(clean_db, 1, hid)
        team_ids = [(await create_team(leader, hid, f"T{i}"))[0] for i, leader in enumerate(leaders)]
        await warm([asker])
        responses = await fire_together([keyed(asker, "POST", f"/api/teams/{tid}/requests", {}) for tid in team_ids])
        codes = Counter(r.status_code if r.status_code < 300 else _error(r) for r in responses)
        assert codes == Counter({201: 5, "too_many_pending_requests": 3}), codes
        pending = await query(clean_db, "SELECT count(*) AS n FROM join_requests WHERE user_id = $1 "
                                        "AND status = 'pending'", uuid.UUID(asker.id))
        assert pending[0]["n"] == 5
