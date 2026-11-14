"""Hackathons, registration and the looking flag: T-API-05 and the audit side of T-API-40.

Contents:
    test_list_get_and_meta: Hackathons list and get return the configured sizes; unknown id is 404; meta lists
        skills.
    test_api_05_register_twice: T-API-05: registering twice gives 200 both times, one participant row, one audit
        event.
    test_register_unknown_hackathon: Registering for a hackathon that does not exist returns 404.
    test_api_40_looking_flag_is_audited: T-API-40 (audit part): a looking change writes participant_updated; an
        unchanged value writes nothing.
    test_looking_requires_registration: Changing the looking flag without registering returns 409 not_registered.
"""

from helpers import Users, make_hackathon, query


async def test_list_get_and_meta(users: Users, clean_db: str) -> None:
    """Hackathons list and get return the configured sizes; unknown id is 404; meta lists skills."""
    hid = await make_hackathon(clean_db, min_size=2, max_size=5, ttl="24 hours")
    user = await users.new()
    listed = await user.get("/api/hackathons")
    one = await user.get(f"/api/hackathons/{hid}")
    missing = await user.get("/api/hackathons/00000000-0000-0000-0000-000000000000")
    meta = await user.get("/api/meta")
    assert [h["id"] for h in listed.json()] == [hid]
    assert one.json() == {"id": hid, "name": "Test Hack", "min_team_size": 2, "max_team_size": 5,
                          "invite_ttl_hours": 24}
    assert missing.status_code == 404
    assert len(meta.json()["skills"]) == 12 and "pitch" in meta.json()["core_roles"]


async def test_api_05_register_twice(users: Users, clean_db: str) -> None:
    """T-API-05: registering twice gives 200 both times, one participant row, one audit event."""
    hid = await make_hackathon(clean_db)
    user = await users.new()
    first = await user.post(f"/api/hackathons/{hid}/register")
    second = await user.post(f"/api/hackathons/{hid}/register")
    assert first.status_code == second.status_code == 200
    assert first.json() == {"registered": True, "looking": True}
    assert len(await query(clean_db, "SELECT 1 FROM participants")) == 1
    events = await query(clean_db, "SELECT action FROM audit_events")
    assert [e["action"] for e in events] == ["participant_registered"]


async def test_register_unknown_hackathon(users: Users) -> None:
    """Registering for a hackathon that does not exist returns 404."""
    user = await users.new()
    response = await user.post("/api/hackathons/00000000-0000-0000-0000-000000000000/register")
    assert response.status_code == 404


async def test_api_40_looking_flag_is_audited(users: Users, clean_db: str) -> None:
    """T-API-40 (audit part): a looking change writes participant_updated; an unchanged value writes nothing."""
    hid = await make_hackathon(clean_db)
    user = await users.new(hackathon=hid)
    off = await user.patch(f"/api/hackathons/{hid}/me", {"looking": False})
    same = await user.patch(f"/api/hackathons/{hid}/me", {"looking": False})
    status = await user.get(f"/api/hackathons/{hid}/me")
    assert off.json() == same.json() == {"registered": True, "looking": False}
    assert status.json() == {"registered": True, "looking": False, "team": None, "pending_requests": []}
    events = await query(clean_db, "SELECT action FROM audit_events ORDER BY seq")
    assert [e["action"] for e in events] == ["participant_registered", "participant_updated"]


async def test_looking_requires_registration(users: Users, clean_db: str) -> None:
    """Changing the looking flag without registering returns 409 not_registered."""
    hid = await make_hackathon(clean_db)
    user = await users.new()
    response = await user.patch(f"/api/hackathons/{hid}/me", {"looking": False})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "not_registered"
