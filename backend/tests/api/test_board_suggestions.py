"""Board and suggestions: T-API-31, 32, 33, 39 (board part), 44.

Contents:
    test_api_31_teams_board_pagination: T-API-31: pages do not overlap, full and finalized teams are excluded,
        next_cursor ends as null.
    test_api_32_board_etag: T-API-32: a repeat request with If-None-Match gets 304 and no body.
    test_board_errors: Unknown hackathon is 404, a bad cursor or limit is 400, no session is 401.
    test_people_board: People board lists looking participants without a team, newest first, with public fields
        only.
    test_api_33_suggestions_rank_complementary_people: T-API-33: covering missing roles ranks first; breakdown and
        reasons are present; order is stable.
    test_api_44_suggestions_without_team: T-API-44: a caller without a team is a one-person group; unregistered
        callers get 409.
"""

import uuid

from helpers import Users, create_team, join, make_hackathon, query


async def test_api_31_teams_board_pagination(users: Users, clean_db: str) -> None:
    """T-API-31: pages do not overlap, full and finalized teams are excluded, next_cursor ends as null."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=2)
    leaders = await users.bulk(clean_db, 25, hid)
    team_ids = [(await create_team(leader, hid, f"T{i:02d}"))[0] for i, leader in enumerate(leaders)]
    filler = (await users.bulk(clean_db, 1, hid))[0]
    full_code = (await leaders[0].get(f"/api/teams/{team_ids[0]}/invite")).json()["code"]
    assert (await join(filler, full_code)).status_code == 200
    assert (await leaders[1].post(f"/api/teams/{team_ids[1]}/finalize")).status_code == 200
    seen, cursor, pages = [], None, 0
    while True:
        url = f"/api/hackathons/{hid}/board/teams?limit=10" + (f"&cursor={cursor}" if cursor else "")
        page = (await filler.get(url)).json()
        seen += [t["id"] for t in page["items"]]
        pages += 1
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert pages == 3 and len(seen) == len(set(seen)) == 23
    assert team_ids[0] not in seen and team_ids[1] not in seen
    assert seen == list(reversed(team_ids[2:]))
    assert "invite_code" not in str(page)


async def test_api_32_board_etag(users: Users, clean_db: str) -> None:
    """T-API-32: a repeat request with If-None-Match gets 304 and no body."""
    hid = await make_hackathon(clean_db)
    leader = await users.new(hackathon=hid)
    await create_team(leader, hid)
    first = await leader.get(f"/api/hackathons/{hid}/board/teams")
    second = await leader.get(f"/api/hackathons/{hid}/board/teams", headers={"If-None-Match": first.headers["etag"]})
    assert first.status_code == 200 and second.status_code == 304 and second.content == b""


async def test_board_errors(users: Users, clean_db: str) -> None:
    """Unknown hackathon is 404, a bad cursor or limit is 400, no session is 401."""
    hid = await make_hackathon(clean_db)
    user = await users.new(hackathon=hid)
    assert (await user.get(f"/api/hackathons/{uuid.uuid4()}/board/teams")).status_code == 404
    assert (await user.get(f"/api/hackathons/{hid}/board/teams?cursor=garbage")).status_code == 400
    assert (await user.get(f"/api/hackathons/{hid}/board/people?limit=51")).status_code == 400
    anonymous = users.client()
    assert (await anonymous.get(f"/api/hackathons/{hid}/board/teams")).status_code == 401


async def test_people_board(users: Users, clean_db: str) -> None:
    """People board lists looking participants without a team, newest first, with public fields only."""
    hid = await make_hackathon(clean_db)
    in_team = await users.new("member", hackathon=hid)
    hidden = await users.new("hidden", hackathon=hid)
    visible = await users.new("visible", skills=("ml",), timezone="Europe/Berlin", hackathon=hid)
    await create_team(in_team, hid)
    await hidden.patch(f"/api/hackathons/{hid}/me", {"looking": False})
    page = (await visible.get(f"/api/hackathons/{hid}/board/people")).json()
    assert page["items"] == [{"user_id": visible.id, "display_name": "visible", "skills": ["ml"],
                              "timezone": "Europe/Berlin"}]
    assert page["next_cursor"] is None


async def test_api_33_suggestions_rank_complementary_people(users: Users, clean_db: str) -> None:
    """T-API-33: covering missing roles ranks first; breakdown and reasons are present; order is stable."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=4)
    leader = await users.new("lead", skills=("frontend",), timezone="Asia/Kolkata", hackathon=hid)
    await create_team(leader, hid)
    complementary = await users.new("comp", skills=("backend", "devops"), timezone="Asia/Kolkata", hackathon=hid)
    duplicate = await users.new("dup", skills=("frontend",), timezone="Asia/Kolkata", hackathon=hid)
    far = await users.new("far", skills=("backend",), timezone="America/Los_Angeles", hackathon=hid)
    first = (await leader.get(f"/api/hackathons/{hid}/suggestions")).json()
    second = (await leader.get(f"/api/hackathons/{hid}/suggestions")).json()
    assert first == second
    assert first["context"]["missing_roles"] == ["backend", "design", "ml", "devops", "pitch"]
    assert [s["user_id"] for s in first["items"]] == [complementary.id, duplicate.id, far.id]
    top = first["items"][0]
    assert set(top["breakdown"]) == {"complement", "timezone", "completeness", "redundancy"}
    assert top["reasons"][0] == "Covers backend, devops (missing in team)"
    assert first["items"][1]["breakdown"]["redundancy"] == 1.0


async def test_api_44_suggestions_without_team(users: Users, clean_db: str) -> None:
    """T-API-44: a caller without a team is a one-person group; unregistered callers get 409."""
    hid = await make_hackathon(clean_db)
    solo = await users.new("solo", skills=("backend",), timezone="Europe/London", hackathon=hid)
    designer = await users.new("designer", skills=("design",), timezone="Europe/London", hackathon=hid)
    result = (await solo.get(f"/api/hackathons/{hid}/suggestions")).json()
    assert result["context"]["team_id"] is None
    assert [s["user_id"] for s in result["items"]] == [designer.id]
    assert result["items"][0]["breakdown"]["timezone"] == 1.0
    assert "9 h working-hours overlap with you" in result["items"][0]["reasons"]
    stranger = await users.new()
    response = await stranger.get(f"/api/hackathons/{hid}/suggestions")
    assert response.status_code == 409 and response.json()["error"]["code"] == "not_registered"
    rows = await query(clean_db, "SELECT count(*) AS n FROM participants WHERE hackathon_id = $1", uuid.UUID(hid))
    assert rows[0]["n"] == 2
