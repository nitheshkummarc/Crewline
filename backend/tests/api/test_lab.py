"""Race lab: T-LAB-01 to T-LAB-05 (race, spam clicks, request queue, traced walkthrough, hidden lab, limits)."""

import httpx
from helpers import SHARED_TLS, Users


async def test_lab_01_race_has_exactly_one_winner(users: Users) -> None:
    """T-LAB-01: 40 people join a 3 of 4 team at once: one 200, 39 team_full, 4 members, one new join event."""
    user = await users.new("judge")
    response = await user.post("/api/lab/race", {"attempts": 40})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"]["winners"] == 1
    assert body["summary"]["team_full"] == 39 and body["summary"]["other"] == 0
    assert body["facts"] == {"member_count": 4, "max_size": 4, "memberships": 4, "join_events": 3}
    assert len(body["attempts"]) == 40


async def test_lab_02_spam_clicks_join_once(users: Users) -> None:
    """T-LAB-02: 12 clicks with one key replay one stored answer; 12 clicks with new keys still make one membership."""
    user = await users.new("clicker")
    response = await user.post("/api/lab/spam", {"clicks": 12})
    assert response.status_code == 200, response.text
    body = response.json()
    same, fresh = body["same_key"], body["new_keys"]
    assert all(c["status"] == 200 and c["same_body"] for c in same["clicks"])
    assert sum(1 for c in same["clicks"] if not c["replayed"]) == 1
    assert same["facts"] == {"memberships": 1, "join_events": 1, "stored_keys": 1}
    assert all(c["status"] == 200 for c in fresh["clicks"])
    assert sum(1 for c in fresh["clicks"] if not c["replayed"]) == 1
    assert fresh["facts"]["memberships"] == 1 and fresh["facts"]["join_events"] == 1
    assert body["facts"]["member_count"] == 3


async def test_lab_03_request_queue_order_and_full_team(users: Users) -> None:
    """T-LAB-03: 8 requests reach the leader oldest first; the first accept fills the team, the second is team_full."""
    user = await users.new("leader-watcher")
    response = await user.post("/api/lab/queue", {"requests": 8})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created"]["ok"] == 8 and body["created"]["failed"] == 0
    offsets = [row["after_first_ms"] for row in body["queue"]]
    assert len(offsets) == 8 and offsets == sorted(offsets)
    assert [(d["status"], d["code"]) for d in body["decisions"]] == [(200, None), (409, "team_full")]
    assert body["facts"]["member_count"] == 4 and body["facts"]["memberships"] == 4


async def test_lab_04_walkthrough_traces_the_real_statements(users: Users) -> None:
    """T-LAB-04: the traced join claims the key, takes the seat, adds the membership, audits, commits; retry replays."""
    user = await users.new("tracer")
    response = await user.post("/api/lab/walkthrough")
    assert response.status_code == 200, response.text
    body = response.json()
    join = [step["label"] for step in body["join"]["steps"]]
    expected = ["Claim the idempotency key", "Take the seat (conditional UPDATE)", "Add the membership",
                "Write the audit event", "Store the response with the key", "Commit"]
    assert [label for label in join if label in expected] == expected
    assert body["join"]["status"] == 200
    assert body["retry"]["replayed"] is True and body["retry"]["status"] == 200
    assert "Take the seat (conditional UPDATE)" not in [step["label"] for step in body["retry"]["steps"]]
    full = [step["label"] for step in body["full"]["steps"]]
    assert body["full"]["code"] == "team_full" and "Roll back" in full and "Commit" not in full


async def test_lab_05_hidden_hackathon_limits_and_latency(users: Users, server: str) -> None:
    """T-LAB-05: the lab hackathon is unlisted, sizes over the cap are refused, latency is reported, auth required."""
    user = await users.new("auditor")
    info = (await user.get("/api/lab")).json()
    listed = [h["id"] for h in (await user.get("/api/hackathons")).json()]
    assert info["hackathon_id"] not in listed
    too_many = await user.post("/api/lab/race", {"attempts": info["max_attempts"] + 1})
    assert too_many.status_code == 400 and too_many.json()["error"]["code"] in ("validation_error",)
    latency = (await user.get("/api/lab/latency")).json()
    assert any(row["route"] == "GET /api/hackathons" for row in latency["routes"])
    assert {pool["pool"] for pool in latency["pools"]} == {"read", "write"}
    async with httpx.AsyncClient(base_url=server, verify=SHARED_TLS) as anonymous:
        assert (await anonymous.post("/api/lab/race", json={"attempts": 5})).status_code == 401
