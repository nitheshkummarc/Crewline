"""Realtime: T-API-35, 36, 38, 40, 41, 42, 45, stream cap, and listener reconnect (B-3).

Contents:
    _events_url: Return the SSE URL for a hackathon.
    test_api_35_join_event_and_fresh_board: T-API-35 and B-2: a join reaches subscribers with a newer version, and
        the board is fresh right after.
    test_api_36_no_event_after_rollback: T-API-36: a rejected join (409) publishes nothing.
    test_api_40_people_events: T-API-40: registration and a looking change each publish a people event.
    test_api_41_profile_change_republishes_team: T-API-41: a member's skill change publishes the team with the new
        skills and a higher version.
    test_api_42_request_events_reach_only_their_audience: T-API-42: the leader and the requester get request events;
        an outsider does not.
    test_api_45_deletion_tombstone: T-API-45: the last member leaving publishes team_deleted with team null and
        version last + 1.
    test_stream_cap_and_errors: Three streams per user are allowed, the fourth is 429; unknown hackathon 404; no
        session 401.
    test_api_38_metrics: T-API-38: /metrics exposes pool gauges, route histograms and SSE counts.
    test_b3_listener_reconnect_sends_resync: B-3: killing the LISTEN backend triggers a resync event, and events
        keep flowing afterwards.
"""

import uuid

import asyncpg
from helpers import Users, create_team, join, make_hackathon
from sse import SseReader


def _events_url(hid: str) -> str:
    """Return the SSE URL for a hackathon."""
    return f"/api/events?hackathon_id={hid}"


async def test_api_35_join_event_and_fresh_board(users: Users, clean_db: str) -> None:
    """T-API-35 and B-2: a join reaches subscribers with a newer version, and the board is fresh right after."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=4)
    leader, joiner, watcher = (await users.new(hackathon=hid), await users.new(hackathon=hid),
                               await users.new(hackathon=hid))
    tid, code = await create_team(leader, hid)
    before = (await watcher.get(f"/api/hackathons/{hid}/board/teams")).json()["items"][0]
    async with SseReader(watcher.client, _events_url(hid)) as stream:
        assert stream.status == 200
        assert (await join(joiner, code)).status_code == 200
        event = await stream.next("team", within=1.0)
        board = (await watcher.get(f"/api/hackathons/{hid}/board/teams")).json()["items"][0]
    assert event["action"] == "member_joined_via_code" and event["team_id"] == tid
    assert event["version"] > before["version"] and event["team"]["member_count"] == 2
    assert "invite_code" not in str(event)
    assert board["member_count"] == 2 and board["version"] == event["version"]


async def test_api_36_no_event_after_rollback(users: Users, clean_db: str) -> None:
    """T-API-36: a rejected join (409) publishes nothing."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=1)
    leader, late = await users.new(hackathon=hid), await users.new(hackathon=hid)
    _, code = await create_team(leader, hid)
    async with SseReader(leader.client, _events_url(hid)) as stream:
        assert (await join(late, code)).status_code == 409
        assert await stream.nothing("team", 0.7)


async def test_api_40_people_events(users: Users, clean_db: str) -> None:
    """T-API-40: registration and a looking change each publish a people event."""
    hid = await make_hackathon(clean_db)
    watcher = await users.new(hackathon=hid)
    newcomer = await users.new()
    async with SseReader(watcher.client, _events_url(hid)) as stream:
        await newcomer.post(f"/api/hackathons/{hid}/register")
        registered = await stream.next("people")
        await newcomer.patch(f"/api/hackathons/{hid}/me", {"looking": False})
        updated = await stream.next("people")
    assert registered["action"] == "participant_registered" and updated["action"] == "participant_updated"
    assert set(registered) == {"seq", "action"}


async def test_api_41_profile_change_republishes_team(users: Users, clean_db: str) -> None:
    """T-API-41: a member's skill change publishes the team with the new skills and a higher version."""
    hid = await make_hackathon(clean_db)
    leader = await users.new(skills=("frontend",), hackathon=hid)
    tid, _ = await create_team(leader, hid)
    version = (await leader.get(f"/api/teams/{tid}")).json()["version"]
    async with SseReader(leader.client, _events_url(hid)) as stream:
        await leader.patch("/api/users/me", {"skills": ["frontend", "ml"]})
        event = await stream.next("team")
    assert event["action"] == "member_profile_updated"
    assert event["team"]["skills"] == ["frontend", "ml"] and event["version"] == version + 1


async def test_api_42_request_events_reach_only_their_audience(users: Users, clean_db: str) -> None:
    """T-API-42: the leader and the requester get request events; an outsider does not."""
    hid = await make_hackathon(clean_db)
    leader, asker, outsider = (await users.new(hackathon=hid), await users.new(hackathon=hid),
                               await users.new(hackathon=hid))
    tid, _ = await create_team(leader, hid)
    async with (SseReader(leader.client, _events_url(hid)) as lead_stream,
                SseReader(asker.client, _events_url(hid)) as ask_stream,
                SseReader(outsider.client, _events_url(hid)) as out_stream):
        await asker.post(f"/api/teams/{tid}/requests", {})
        seen_by_leader = await lead_stream.next("request")
        seen_by_asker = await ask_stream.next("request")
        assert await out_stream.nothing("request", 0.7)
    assert seen_by_leader == seen_by_asker
    assert seen_by_leader["action"] == "request_created" and set(seen_by_leader) == {
        "seq", "action", "team_id", "request_id"}


async def test_api_45_deletion_tombstone(users: Users, clean_db: str) -> None:
    """T-API-45: the last member leaving publishes team_deleted with team null and version last + 1."""
    hid = await make_hackathon(clean_db)
    leader, watcher = await users.new(hackathon=hid), await users.new(hackathon=hid)
    tid, _ = await create_team(leader, hid)
    version = (await leader.get(f"/api/teams/{tid}")).json()["version"]
    async with SseReader(watcher.client, _events_url(hid)) as stream:
        await leader.post(f"/api/teams/{tid}/leave")
        first = await stream.next("team")
        second = await stream.next("team")
    assert [first["action"], second["action"]] == ["member_left", "team_deleted"]
    assert second["team"] is None and second["version"] == version + 1


async def test_stream_cap_and_errors(users: Users, clean_db: str) -> None:
    """Three streams per user are allowed, the fourth is 429; unknown hackathon 404; no session 401."""
    hid = await make_hackathon(clean_db)
    user = await users.new(hackathon=hid)
    async with (SseReader(user.client, _events_url(hid)) as a, SseReader(user.client, _events_url(hid)) as b,
                SseReader(user.client, _events_url(hid)) as c):
        assert (a.status, b.status, c.status) == (200, 200, 200)
        fourth = await user.get(_events_url(hid))
        assert fourth.status_code == 429
    assert (await user.get(_events_url(str(uuid.uuid4())))).status_code == 404
    assert (await users.client().get(_events_url(hid))).status_code == 401


async def test_api_38_metrics(users: Users, clean_db: str) -> None:
    """T-API-38: /metrics exposes pool gauges, route histograms and SSE counts."""
    hid = await make_hackathon(clean_db)
    user = await users.new(hackathon=hid)
    await user.get(f"/api/hackathons/{hid}/board/teams")
    text = (await user.get("/metrics")).text
    assert 'crewline_pool_size{pool="write"}' in text and 'crewline_pool_idle{pool="read"}' in text
    assert 'route="/api/hackathons/{hid}/board/teams"' in text
    assert "crewline_sse_connections" in text and 'crewline_tx_events{kind="busy"}' in text


async def test_b3_listener_reconnect_sends_resync(users: Users, clean_db: str) -> None:
    """B-3: killing the LISTEN backend triggers a resync event, and events keep flowing afterwards."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=4)
    leader, joiner = await users.new(hackathon=hid), await users.new(hackathon=hid)
    _, code = await create_team(leader, hid)
    async with SseReader(leader.client, _events_url(hid)) as stream:
        conn = await asyncpg.connect(clean_db)
        try:
            killed = await conn.fetchval(
                "SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity "
                "WHERE application_name = 'crewline-listen' AND datname = current_database()")
        finally:
            await conn.close()
        assert killed >= 1
        await stream.next("resync", within=5.0)
        assert (await join(joiner, code)).status_code == 200
        event = await stream.next("team", within=2.0)
    assert event["action"] == "member_joined_via_code"
