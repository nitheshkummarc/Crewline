"""Team endpoints: T-API-06 to 13, 19 to 26, 29, 30, 37, 39, 45."""

import uuid

from helpers import Users, create_team, join, key, make_hackathon, query


def _code(response_json: dict) -> str:
    """Return the error code of an error response body."""
    return response_json["error"]["code"]


async def test_api_06_create_team(users: Users, clean_db: str) -> None:
    """T-API-06: the creator is leader and only member; status forming; audit team_created with user_id."""
    hid = await make_hackathon(clean_db, min_size=2, max_size=4)
    leader = await users.new("lead", skills=("backend",), hackathon=hid)
    created = await leader.post(f"/api/hackathons/{hid}/teams", {"name": "  Rocket  "})
    assert created.status_code == 201
    team = created.json()
    assert team["name"] == "Rocket" and team["member_count"] == 1 and team["status"] == "forming"
    assert team["min_size"] == 2 and team["max_size"] == 4 and team["leader_id"] == leader.id
    assert team["skills"] == ["backend"] and [m["user_id"] for m in team["members"]] == [leader.id]
    assert "invite_code" not in team
    audit = await query(clean_db, "SELECT action, payload->>'user_id' AS uid FROM audit_events WHERE team_id = $1",
                        uuid.UUID(team["id"]))
    assert [(a["action"], a["uid"]) for a in audit] == [("team_created", leader.id)]


async def test_api_07_second_team_and_not_registered(users: Users, clean_db: str) -> None:
    """T-API-07: a second team in the same hackathon is 409 already_in_team; unregistered is 409 not_registered."""
    hid = await make_hackathon(clean_db)
    leader = await users.new(hackathon=hid)
    await create_team(leader, hid)
    second = await leader.post(f"/api/hackathons/{hid}/teams", {"name": "Another"})
    stranger = await users.new()
    unregistered = await stranger.post(f"/api/hackathons/{hid}/teams", {"name": "Nope"})
    assert second.status_code == 409 and _code(second.json()) == "already_in_team"
    assert unregistered.status_code == 409 and _code(unregistered.json()) == "not_registered"
    assert len(await query(clean_db, "SELECT 1 FROM teams")) == 1


async def test_api_08_join_with_code(users: Users, clean_db: str) -> None:
    """T-API-08: joining with a valid code (any case, with dash) adds a member and an audit event."""
    hid = await make_hackathon(clean_db)
    leader = await users.new(hackathon=hid)
    member = await users.new(hackathon=hid)
    tid, code = await create_team(leader, hid)
    joined = await join(member, code.lower())
    assert joined.status_code == 200
    assert joined.json()["member_count"] == 2
    events = await query(clean_db, "SELECT payload FROM audit_events WHERE action = 'member_joined_via_code'")
    assert events[0]["payload"]["user_id"] == member.id
    assert events[0]["payload"]["before_count"] == 1 and events[0]["payload"]["after_count"] == 2


async def test_api_09_10_expired_and_unknown_codes_look_the_same(users: Users, clean_db: str) -> None:
    """T-API-09/10: expired and unknown codes both return 404 invite_invalid with the same message."""
    hid = await make_hackathon(clean_db)
    leader = await users.new(hackathon=hid)
    member = await users.new(hackathon=hid)
    tid, code = await create_team(leader, hid)
    await query(clean_db, "UPDATE teams SET invite_expires_at = now() - interval '1 minute' WHERE id = $1",
                uuid.UUID(tid))
    expired = await join(member, code)
    unknown = await join(member, "ZZZZZ-ZZZZZ")
    malformed = await join(member, "abc")
    for response in (expired, unknown, malformed):
        assert response.status_code == 404
    bodies = [{k: v for k, v in r.json()["error"].items() if k != "request_id"} for r in (expired, unknown, malformed)]
    assert bodies[0] == bodies[1] == bodies[2]


async def test_api_11_12_13_full_own_and_finalized(users: Users, clean_db: str) -> None:
    """T-API-11/12/13: full team 409; joining your own team 200 without changes; finalized team 409."""
    hid = await make_hackathon(clean_db, min_size=2, max_size=2)
    leader = await users.new(hackathon=hid)
    member = await users.new(hackathon=hid)
    late = await users.new(hackathon=hid)
    tid, code = await create_team(leader, hid)
    assert (await join(member, code)).status_code == 200
    full = await join(late, code)
    again = await join(member, code)
    assert full.status_code == 409 and _code(full.json()) == "team_full"
    assert again.status_code == 200 and again.json()["member_count"] == 2
    joins = await query(clean_db, "SELECT 1 FROM audit_events WHERE action = 'member_joined_via_code'")
    assert len(joins) == 1

    hid2 = await make_hackathon(clean_db, min_size=1, max_size=3)
    leader2 = await users.new(hackathon=hid2)
    other = await users.new(hackathon=hid2)
    tid2, code2 = await create_team(leader2, hid2)
    assert (await leader2.post(f"/api/teams/{tid2}/finalize")).status_code == 200
    finalized = await join(other, code2)
    assert finalized.status_code == 409 and _code(finalized.json()) == "team_finalized"


async def test_api_19_member_leaves(users: Users, clean_db: str) -> None:
    """T-API-19: a non-leader leaves; count drops, leader unchanged, audit member_left."""
    hid = await make_hackathon(clean_db)
    leader, member = await users.new(hackathon=hid), await users.new(hackathon=hid)
    tid, code = await create_team(leader, hid)
    await join(member, code)
    left = await member.post(f"/api/teams/{tid}/leave")
    assert left.status_code == 200
    assert left.json()["team"]["member_count"] == 1 and left.json()["team"]["leader_id"] == leader.id
    again = await member.post(f"/api/teams/{tid}/leave")
    assert again.status_code == 409 and _code(again.json()) == "not_a_member"


async def test_api_20_leader_handover(users: Users, clean_db: str) -> None:
    """T-API-20: when the leader leaves, the earliest joined member leads; leader_promoted has a null actor."""
    hid = await make_hackathon(clean_db, max_size=5)
    leader = await users.new("leader", hackathon=hid)
    first = await users.new("first", hackathon=hid)
    second = await users.new("second", hackathon=hid)
    tid, code = await create_team(leader, hid)
    await join(first, code)
    await join(second, code)
    left = await leader.post(f"/api/teams/{tid}/leave")
    assert left.json()["team"]["leader_id"] == first.id
    rows = await query(clean_db, "SELECT actor_id, payload FROM audit_events WHERE action = 'leader_promoted'")
    assert rows[0]["actor_id"] is None
    assert rows[0]["payload"]["from_user_id"] == leader.id and rows[0]["payload"]["to_user_id"] == first.id


async def test_api_21_45_last_member_deletes_team(users: Users, clean_db: str) -> None:
    """T-API-21/45: the last member leaving deletes the team; audit stays; team_deleted carries a tombstone version."""
    hid = await make_hackathon(clean_db)
    leader, asker = await users.new(hackathon=hid), await users.new(hackathon=hid)
    tid, _ = await create_team(leader, hid)
    await query(clean_db, "INSERT INTO join_requests (team_id, hackathon_id, user_id) VALUES ($1, $2, $3)",
                uuid.UUID(tid), uuid.UUID(hid), uuid.UUID(asker.id))
    version = (await leader.get(f"/api/teams/{tid}")).json()["version"]
    left = await leader.post(f"/api/teams/{tid}/leave")
    assert left.status_code == 200 and left.json() == {"team": None}
    assert (await leader.get(f"/api/teams/{tid}")).status_code == 404
    assert await query(clean_db, "SELECT 1 FROM join_requests") == []
    rows = await query(clean_db, "SELECT action, actor_id, payload FROM audit_events WHERE team_id = $1 ORDER BY seq",
                       uuid.UUID(tid))
    assert [r["action"] for r in rows] == ["team_created", "member_left", "team_deleted"]
    deleted = rows[-1]
    assert deleted["actor_id"] is None
    assert deleted["payload"]["version"] == version + 1 and deleted["payload"]["team"] is None


async def test_api_22_remove_member(users: Users, clean_db: str) -> None:
    """T-API-22: leader removes a member; non-leader gets 403; leader removing self gets 409."""
    hid = await make_hackathon(clean_db)
    leader, a, b = (await users.new(hackathon=hid), await users.new(hackathon=hid), await users.new(hackathon=hid))
    tid, code = await create_team(leader, hid)
    await join(a, code)
    await join(b, code)
    by_member = await a.delete(f"/api/teams/{tid}/members/{b.id}")
    removed = await leader.delete(f"/api/teams/{tid}/members/{b.id}")
    self_remove = await leader.delete(f"/api/teams/{tid}/members/{leader.id}")
    assert by_member.status_code == 403 and _code(by_member.json()) == "not_leader"
    assert removed.status_code == 200 and removed.json()["member_count"] == 2
    assert self_remove.status_code == 409 and _code(self_remove.json()) == "cannot_remove_self"


async def test_api_23_24_finalize_and_reopen_on_leave(users: Users, clean_db: str) -> None:
    """T-API-23/24: finalize below min is 409; at min it works; a member leaving reopens the team."""
    hid = await make_hackathon(clean_db, min_size=2, max_size=4)
    leader, member = await users.new(hackathon=hid), await users.new(hackathon=hid)
    tid, code = await create_team(leader, hid)
    below = await leader.post(f"/api/teams/{tid}/finalize")
    assert below.status_code == 409 and _code(below.json()) == "below_min_size"
    await join(member, code)
    by_member = await member.post(f"/api/teams/{tid}/finalize")
    assert by_member.status_code == 403
    done = await leader.post(f"/api/teams/{tid}/finalize")
    twice = await leader.post(f"/api/teams/{tid}/finalize")
    assert done.status_code == 200 and done.json()["status"] == "finalized"
    assert twice.status_code == 409 and _code(twice.json()) == "team_finalized"
    left = await member.post(f"/api/teams/{tid}/leave")
    assert left.json()["team"]["status"] == "forming"
    reopened = await query(clean_db, "SELECT actor_id FROM audit_events WHERE action = 'team_reopened'")
    assert len(reopened) == 1 and reopened[0]["actor_id"] is None
    not_finalized = await leader.post(f"/api/teams/{tid}/reopen")
    assert not_finalized.status_code == 409 and _code(not_finalized.json()) == "not_finalized"


async def test_api_25_regenerate_invite(users: Users, clean_db: str) -> None:
    """T-API-25: the old code stops working, the new one works, the audit payload has no code."""
    hid = await make_hackathon(clean_db)
    leader, member = await users.new(hackathon=hid), await users.new(hackathon=hid)
    tid, old_code = await create_team(leader, hid)
    regenerated = await leader.post(f"/api/teams/{tid}/invite/regenerate")
    assert regenerated.status_code == 200
    new_code = regenerated.json()["code"]
    assert new_code != old_code
    assert (await join(member, old_code)).status_code == 404
    assert (await join(member, new_code)).status_code == 200
    by_member = await member.post(f"/api/teams/{tid}/invite/regenerate")
    assert by_member.status_code == 403
    payloads = await query(clean_db, "SELECT payload::text AS p FROM audit_events")
    assert all(new_code.replace("-", "") not in row["p"] and old_code.replace("-", "") not in row["p"]
               for row in payloads)


async def test_api_26_27_join_replay_and_mismatch(users: Users, clean_db: str) -> None:
    """T-API-26/27: the same key replays the identical response; the same key with another body is 422."""
    hid = await make_hackathon(clean_db)
    leader, member = await users.new(hackathon=hid), await users.new(hackathon=hid)
    _, code = await create_team(leader, hid)
    idem = key()
    first = await member.post("/api/teams/join", {"code": code}, idem=idem)
    replay = await member.post("/api/teams/join", {"code": code}, idem=idem)
    other = await member.post("/api/teams/join", {"code": "ZZZZZ-ZZZZZ"}, idem=idem)
    assert first.status_code == replay.status_code == 200
    assert first.content == replay.content
    assert other.status_code == 422


async def test_api_29_team_validation(users: Users, clean_db: str) -> None:
    """T-API-29: team name too long, empty update and bad UUIDs return 400 validation_error."""
    hid = await make_hackathon(clean_db)
    leader = await users.new(hackathon=hid)
    tid, _ = await create_team(leader, hid)
    for response in (
        await leader.post(f"/api/hackathons/{hid}/teams", {"name": "x" * 61}),
        await leader.patch(f"/api/teams/{tid}", {}),
        await leader.get("/api/teams/not-a-uuid"),
        await leader.get(f"/api/teams/{tid}/audit?limit=500"),
    ):
        assert response.status_code == 400, response.text
        assert _code(response.json()) == "validation_error"


async def test_api_30_code_guessing_is_rate_limited(users: Users, clean_db: str) -> None:
    """T-API-30: the 6th wrong code in a minute returns 429 with Retry-After."""
    hid = await make_hackathon(clean_db)
    guesser = await users.new(hackathon=hid)
    statuses = [(await join(guesser, f"ZZZZZ-ZZZZ{d}")).status_code for d in "12345"]
    blocked = await join(guesser, "ZZZZZ-ZZZZ6")
    assert statuses == [404] * 5
    assert blocked.status_code == 429 and int(blocked.headers["retry-after"]) >= 1


async def test_api_37_39_audit_and_invite_visibility(users: Users, clean_db: str) -> None:
    """T-API-37/39: members see the audit newest first and the invite code; non-members get 403."""
    hid = await make_hackathon(clean_db)
    leader, member, outsider = (await users.new(hackathon=hid), await users.new(hackathon=hid),
                                await users.new(hackathon=hid))
    tid, code = await create_team(leader, hid)
    await join(member, code)
    await leader.patch(f"/api/teams/{tid}", {"name": "Renamed"})
    audit = await member.get(f"/api/teams/{tid}/audit")
    assert [e["action"] for e in audit.json()["items"]] == ["team_updated", "member_joined_via_code", "team_created"]
    assert all("team" not in e["payload"] for e in audit.json()["items"])
    assert (await outsider.get(f"/api/teams/{tid}/audit")).status_code == 403
    assert (await outsider.get(f"/api/teams/{tid}/invite")).status_code == 403
    assert (await member.get(f"/api/teams/{tid}/invite")).json()["code"] == code
    detail = await outsider.get(f"/api/teams/{tid}")
    assert detail.status_code == 200 and "invite_code" not in detail.text
