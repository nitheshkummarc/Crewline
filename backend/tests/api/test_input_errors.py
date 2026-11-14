"""Input and session edge cases that used to answer 500: T-API-29 nulls (B-38), T-API-50 (B-40), T-API-51 (B-39).

Contents:
    test_api_29_explicit_nulls_are_400: T-API-29 (B-38): explicit null for display_name, skills or timezone on PATCH
        /api/users/me is 400.
    test_api_50_session_for_missing_user_is_401: T-API-50 (B-40): a valid token for a user row that does not exist
        gets 401 on every write.
    test_api_51_nul_in_text_is_400: T-API-51 (B-39): U+0000 in a team name, display name or request message is 400,
        nothing stored.
"""

import uuid

from helpers import User, Users, create_team, make_hackathon, session_token


async def test_api_29_explicit_nulls_are_400(users: Users, clean_db: str) -> None:
    """T-API-29 (B-38): explicit null for display_name, skills or timezone on PATCH /api/users/me is 400."""
    user = await users.new()
    for body in ({"display_name": None}, {"skills": None}, {"timezone": None}):
        response = await user.patch("/api/users/me", body)
        assert response.status_code == 400, (body, response.text)
        assert response.json()["error"]["code"] == "validation_error"


async def test_api_50_session_for_missing_user_is_401(users: Users, clean_db: str) -> None:
    """T-API-50 (B-40): a valid token for a user row that does not exist gets 401 on every write."""
    hid = await make_hackathon(clean_db)
    client = users.client()
    client.cookies.set("crewline_session", session_token(str(uuid.uuid4())))
    ghost = User(client=client, id="", email="", name="ghost")
    for response in (await ghost.post(f"/api/hackathons/{hid}/register"),
                     await ghost.post(f"/api/hackathons/{hid}/teams", {"name": "Ghosts"}),
                     await ghost.patch("/api/users/me", {"display_name": "Ghost"})):
        assert response.status_code == 401, response.text
        assert response.json()["error"]["code"] == "unauthenticated"


async def test_api_51_nul_in_text_is_400(users: Users, clean_db: str) -> None:
    """T-API-51 (B-39): U+0000 in a team name, display name or request message is 400, nothing stored."""
    hid = await make_hackathon(clean_db)
    leader, asker = await users.new(hackathon=hid), await users.new(hackathon=hid)
    tid, _ = await create_team(leader, hid)
    for response in (await leader.post(f"/api/hackathons/{hid}/teams", {"name": "team\u0000x"}),
                     await leader.patch("/api/users/me", {"display_name": "a\u0000b"}),
                     await asker.post(f"/api/teams/{tid}/requests", {"message": "hi\u0000"})):
        assert response.status_code == 400, response.text
        assert response.json()["error"]["code"] == "validation_error"
