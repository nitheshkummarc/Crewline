"""Join request endpoints: T-API-14 to 18, 29 (request cases), 42 (audience), 43 and the pending cap.

Contents:
    _code: Return the error code of an error response body.
    _team: Create a hackathon and a team; return (hid, tid, code, leader).
    test_api_14_create_request_twice: T-API-14: creating a request twice returns 201 then 200 with the same request.
    test_api_43_create_request_rejections: T-API-43: full team 409 team_full; finalized 409; already in a team 409;
        unregistered 409; unknown 404.
    test_accept_happy_path: Accept adds the requester, marks the request accepted and audits request_accepted with
        the user id.
    test_api_15_accept_by_non_leader: T-API-15: a non-leader accept is 403 and changes nothing.
    test_accept_when_full_keeps_request_pending: Accepting into a team that filled after the request was made is 409
        team_full; the request stays pending.
    test_api_16_decline: T-API-16: decline works once; again is 409 request_not_pending; a non-leader gets 403.
    test_api_17_withdraw: T-API-17: withdraw own request works once; someone else's is 404; again is 409.
    test_api_18_accept_stale_request: T-API-18: accepting a user who joined another team is 409; the request becomes
        stale; counts unchanged.
    test_team_request_list_is_leader_only: The team request list is visible to the leader only.
    test_pending_cap: A user can hold 5 pending requests per hackathon; the 6th is 409 too_many_pending_requests.
    test_api_42_request_event_audience: T-API-42 (payload part): request events carry an audience of team members
        plus the requester.
    test_api_29_request_validation: T-API-29: a 281-character message and a bad request id are 400 validation_error.
"""

import uuid

from helpers import Users, create_team, join, make_hackathon, query


def _code(response_json: dict) -> str:
    """Return the error code of an error response body."""
    return response_json["error"]["code"]


async def _team(users: Users, db_url: str, max_size: int = 4, min_size: int = 1):
    """Create a hackathon and a team; return (hid, tid, code, leader)."""
    hid = await make_hackathon(db_url, min_size=min_size, max_size=max_size)
    leader = await users.new("leader", hackathon=hid)
    tid, code = await create_team(leader, hid)
    return hid, tid, code, leader


async def test_api_14_create_request_twice(users: Users, clean_db: str) -> None:
    """T-API-14: creating a request twice returns 201 then 200 with the same request."""
    hid, tid, _, _ = await _team(users, clean_db)
    asker = await users.new("asker", hackathon=hid)
    first = await asker.post(f"/api/teams/{tid}/requests", {"message": "  I do backend  "})
    second = await asker.post(f"/api/teams/{tid}/requests", {"message": "again"})
    assert first.status_code == 201 and second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["message"] == "I do backend" and first.json()["status"] == "pending"
    assert first.json()["team_name"] == "Team"
    assert len(await query(clean_db, "SELECT 1 FROM audit_events WHERE action = 'request_created'")) == 1


async def test_api_43_create_request_rejections(users: Users, clean_db: str) -> None:
    """T-API-43: full team 409 team_full; finalized 409; already in a team 409; unregistered 409; unknown 404."""
    hid, tid, code, leader = await _team(users, clean_db, max_size=2)
    member = await users.new(hackathon=hid)
    asker = await users.new(hackathon=hid)
    await join(member, code)
    full = await asker.post(f"/api/teams/{tid}/requests", {})
    assert full.status_code == 409 and _code(full.json()) == "team_full"
    assert await query(clean_db, "SELECT 1 FROM join_requests") == []

    hid2, tid2, _, leader2 = await _team(users, clean_db, max_size=3)
    assert (await leader2.post(f"/api/teams/{tid2}/finalize")).status_code == 200
    late = await users.new(hackathon=hid2)
    finalized = await late.post(f"/api/teams/{tid2}/requests", {})
    assert finalized.status_code == 409 and _code(finalized.json()) == "team_finalized"

    own = await leader2.post(f"/api/teams/{tid2}/requests", {})
    assert own.status_code == 409
    hid3, tid3, _, _ = await _team(users, clean_db)
    stranger = await users.new()
    unregistered = await stranger.post(f"/api/teams/{tid3}/requests", {})
    unknown = await stranger.post(f"/api/teams/{uuid.uuid4()}/requests", {})
    assert unregistered.status_code == 409 and _code(unregistered.json()) == "not_registered"
    assert unknown.status_code == 404


async def test_accept_happy_path(users: Users, clean_db: str) -> None:
    """Accept adds the requester, marks the request accepted and audits request_accepted with the user id."""
    hid, tid, _, leader = await _team(users, clean_db)
    asker = await users.new("asker", hackathon=hid)
    rid = (await asker.post(f"/api/teams/{tid}/requests", {})).json()["id"]
    accepted = await leader.post(f"/api/requests/{rid}/accept")
    assert accepted.status_code == 200
    assert accepted.json()["member_count"] == 2
    assert asker.id in [m["user_id"] for m in accepted.json()["members"]]
    mine = await asker.get(f"/api/hackathons/{hid}/my-requests")
    assert [r["status"] for r in mine.json()] == ["accepted"]
    rows = await query(clean_db, "SELECT payload FROM audit_events WHERE action = 'request_accepted'")
    assert rows[0]["payload"]["user_id"] == asker.id and rows[0]["payload"]["request_id"] == rid


async def test_api_15_accept_by_non_leader(users: Users, clean_db: str) -> None:
    """T-API-15: a non-leader accept is 403 and changes nothing."""
    hid, tid, code, _ = await _team(users, clean_db)
    member, asker = await users.new(hackathon=hid), await users.new(hackathon=hid)
    await join(member, code)
    rid = (await asker.post(f"/api/teams/{tid}/requests", {})).json()["id"]
    response = await member.post(f"/api/requests/{rid}/accept")
    assert response.status_code == 403 and _code(response.json()) == "not_leader"
    rows = await query(clean_db, "SELECT status FROM join_requests WHERE id = $1", uuid.UUID(rid))
    assert rows[0]["status"] == "pending"
    team = await query(clean_db, "SELECT member_count FROM teams WHERE id = $1", uuid.UUID(tid))
    assert team[0]["member_count"] == 2


async def test_accept_when_full_keeps_request_pending(users: Users, clean_db: str) -> None:
    """Accepting into a team that filled after the request was made is 409 team_full; the request stays pending."""
    hid, tid, code, leader = await _team(users, clean_db, max_size=2)
    asker, joiner = await users.new(hackathon=hid), await users.new(hackathon=hid)
    rid = (await asker.post(f"/api/teams/{tid}/requests", {})).json()["id"]
    await join(joiner, code)
    response = await leader.post(f"/api/requests/{rid}/accept")
    assert response.status_code == 409 and _code(response.json()) == "team_full"
    rows = await query(clean_db, "SELECT status FROM join_requests WHERE id = $1", uuid.UUID(rid))
    assert rows[0]["status"] == "pending"


async def test_api_16_decline(users: Users, clean_db: str) -> None:
    """T-API-16: decline works once; again is 409 request_not_pending; a non-leader gets 403."""
    hid, tid, code, leader = await _team(users, clean_db)
    member, asker = await users.new(hackathon=hid), await users.new(hackathon=hid)
    await join(member, code)
    rid = (await asker.post(f"/api/teams/{tid}/requests", {})).json()["id"]
    by_member = await member.post(f"/api/requests/{rid}/decline")
    first = await leader.post(f"/api/requests/{rid}/decline")
    again = await leader.post(f"/api/requests/{rid}/decline")
    assert by_member.status_code == 403
    assert first.status_code == 200 and first.json()["status"] == "declined"
    assert again.status_code == 409 and _code(again.json()) == "request_not_pending"


async def test_api_17_withdraw(users: Users, clean_db: str) -> None:
    """T-API-17: withdraw own request works once; someone else's is 404; again is 409."""
    hid, tid, _, leader = await _team(users, clean_db)
    asker, other = await users.new(hackathon=hid), await users.new(hackathon=hid)
    rid = (await asker.post(f"/api/teams/{tid}/requests", {})).json()["id"]
    by_other = await other.post(f"/api/requests/{rid}/withdraw")
    first = await asker.post(f"/api/requests/{rid}/withdraw")
    again = await asker.post(f"/api/requests/{rid}/withdraw")
    accept_after = await leader.post(f"/api/requests/{rid}/accept")
    assert by_other.status_code == 404
    assert first.status_code == 200 and first.json()["status"] == "withdrawn"
    assert again.status_code == 409
    assert accept_after.status_code == 409 and _code(accept_after.json()) == "request_not_pending"


async def test_api_18_accept_stale_request(users: Users, clean_db: str) -> None:
    """T-API-18: accepting a user who joined another team is 409; the request becomes stale; counts unchanged."""
    hid, tid, _, leader = await _team(users, clean_db)
    other_leader = await users.new(hackathon=hid)
    _, other_code = await create_team(other_leader, hid, "Other")
    asker = await users.new(hackathon=hid)
    rid = (await asker.post(f"/api/teams/{tid}/requests", {})).json()["id"]
    hidden_before = await leader.get(f"/api/teams/{tid}/requests")
    await join(asker, other_code)
    hidden_after = await leader.get(f"/api/teams/{tid}/requests")
    response = await leader.post(f"/api/requests/{rid}/accept")
    assert [r["id"] for r in hidden_before.json()] == [rid] and hidden_after.json() == []
    assert response.status_code == 409 and _code(response.json()) == "already_in_team"
    rows = await query(clean_db, "SELECT status FROM join_requests WHERE id = $1", uuid.UUID(rid))
    assert rows[0]["status"] == "stale"
    team = await query(clean_db, "SELECT member_count FROM teams WHERE id = $1", uuid.UUID(tid))
    assert team[0]["member_count"] == 1
    stale = await query(clean_db, "SELECT payload FROM audit_events WHERE action = 'request_stale'")
    assert stale[0]["payload"]["user_id"] == asker.id


async def test_team_request_list_is_leader_only(users: Users, clean_db: str) -> None:
    """The team request list is visible to the leader only."""
    hid, tid, code, leader = await _team(users, clean_db)
    member = await users.new(hackathon=hid)
    await join(member, code)
    assert (await member.get(f"/api/teams/{tid}/requests")).status_code == 403
    assert (await leader.get(f"/api/teams/{tid}/requests")).json() == []


async def test_pending_cap(users: Users, clean_db: str) -> None:
    """A user can hold 5 pending requests per hackathon; the 6th is 409 too_many_pending_requests."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=4)
    asker = await users.new(hackathon=hid)
    statuses = []
    for i in range(6):
        leader = await users.new(hackathon=hid)
        tid, _ = await create_team(leader, hid, f"T{i}")
        statuses.append((await asker.post(f"/api/teams/{tid}/requests", {})).status_code)
    assert statuses == [201] * 5 + [409]


async def test_api_42_request_event_audience(users: Users, clean_db: str) -> None:
    """T-API-42 (payload part): request events carry an audience of team members plus the requester."""
    hid, tid, code, leader = await _team(users, clean_db)
    member, asker = await users.new(hackathon=hid), await users.new(hackathon=hid)
    await join(member, code)
    await asker.post(f"/api/teams/{tid}/requests", {})
    rows = await query(clean_db, "SELECT payload FROM audit_events WHERE action = 'request_created'")
    assert set(rows[0]["payload"]["audience"]) == {leader.id, member.id, asker.id}


async def test_api_29_request_validation(users: Users, clean_db: str) -> None:
    """T-API-29: a 281-character message and a bad request id are 400 validation_error."""
    hid, tid, _, _ = await _team(users, clean_db)
    asker = await users.new(hackathon=hid)
    long_message = await asker.post(f"/api/teams/{tid}/requests", {"message": "x" * 281})
    bad_id = await asker.post("/api/requests/not-a-uuid/withdraw")
    for response in (long_message, bad_id):
        assert response.status_code == 400 and _code(response.json()) == "validation_error"
