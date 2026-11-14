"""Auth and profile: T-API-01 to 04, 26 to 29 on PATCH /api/users/me.

Contents:
    test_api_01_signup_creates_user_and_session: T-API-01: signup returns 201 with the user and a session cookie
        that works.
    test_api_01_signup_validation: T-API-01 / T-API-29: invalid signup bodies return 400 validation_error, never
        422.
    test_api_02_duplicate_email_is_case_insensitive: T-API-02: the same email in another case returns 409
        email_taken.
    test_api_03_login: T-API-03: wrong password and unknown email both return 401 invalid_credentials; right one
        logs in.
    test_api_04_unauthenticated: T-API-04: missing, expired or logged-out sessions return 401 unauthenticated.
    test_api_26_27_28_profile_update_idempotency: T-API-26/27/28: replay with the same key, 422 on a different body,
        400 without a key.
"""

import time

import httpx
import jwt
import pytest
from helpers import SHARED_TLS, TEST_JWT_SECRET, Users, form_fields, key, make_hackathon, query


async def test_api_01_signup_creates_user_and_session(users: Users) -> None:
    """T-API-01: signup returns 201 with the user and a session cookie that works."""
    user = await users.new("alice", skills=("frontend", "design"), timezone="Asia/Kolkata")
    me = await user.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json() == {"id": user.id, "email": user.email.lower(), "display_name": "alice",
                         "skills": ["frontend", "design"], "timezone": "Asia/Kolkata"}


@pytest.mark.parametrize("patch", [
    {"password": "short"},
    {"email": "not-an-email"},
    {"skills": ["juggling"]},
    {"timezone": "+05:30"},
    {"timezone": "Mars/Olympus"},
    {"display_name": ""},
    {"unexpected": 1},
])
async def test_api_01_signup_validation(server: str, patch: dict) -> None:
    """T-API-01 / T-API-29: invalid signup bodies return 400 validation_error, never 422."""
    body = {"email": "v@example.com", "password": "long-enough-1", "display_name": "V", **form_fields(), **patch}
    async with httpx.AsyncClient(base_url=server, verify=SHARED_TLS) as client:
        response = await client.post("/api/auth/signup", json=body)
    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "validation_error"


async def test_api_02_duplicate_email_is_case_insensitive(server: str) -> None:
    """T-API-02: the same email in another case returns 409 email_taken."""
    async with httpx.AsyncClient(base_url=server, verify=SHARED_TLS) as client:
        first = await client.post("/api/auth/signup", json={
            "email": "Bob@Example.com", "password": "long-enough-1", "display_name": "Bob", **form_fields()})
        second = await client.post("/api/auth/signup", json={
            "email": "bob@example.com", "password": "long-enough-2", "display_name": "Bob2", **form_fields()})
    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "email_taken"


async def test_api_03_login(users: Users, server: str) -> None:
    """T-API-03: wrong password and unknown email both return 401 invalid_credentials; right one logs in."""
    user = await users.new("carol")
    async with httpx.AsyncClient(base_url=server, verify=SHARED_TLS) as client:
        bot = form_fields()
        wrong = await client.post("/api/auth/login", json={"email": user.email, "password": "nope-nope-1", **bot})
        unknown = await client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "x" * 10, **bot})
        right = await client.post("/api/auth/login", json={"email": user.email.upper(), "password": "correct-horse-1",
                                                           **bot})
        me = await client.get("/api/auth/me")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["error"]["code"] == unknown.json()["error"]["code"] == "invalid_credentials"
    assert right.status_code == 200
    assert me.json()["id"] == user.id


async def test_api_04_unauthenticated(users: Users, server: str) -> None:
    """T-API-04: missing, expired or logged-out sessions return 401 unauthenticated."""
    async with httpx.AsyncClient(base_url=server, verify=SHARED_TLS) as client:
        missing = await client.get("/api/auth/me")
        claims = {"sub": "00000000-0000-0000-0000-000000000001", "iat": 1, "exp": int(time.time()) - 5}
        expired_token = jwt.encode(claims, TEST_JWT_SECRET, algorithm="HS256")
        client.cookies.set("crewline_session", expired_token)
        expired = await client.get("/api/auth/me")
    user = await users.new("dave")
    await user.post("/api/auth/logout")
    after_logout = await user.get("/api/auth/me")
    for response in (missing, expired, after_logout):
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "unauthenticated"


async def test_api_26_27_28_profile_update_idempotency(users: Users, clean_db: str) -> None:
    """T-API-26/27/28: replay with the same key, 422 on a different body, 400 without a key."""
    hid = await make_hackathon(clean_db)
    user = await users.new("erin", hackathon=hid)
    idem = key()
    first = await user.patch("/api/users/me", {"skills": ["backend"]}, idem=idem)
    again = await user.patch("/api/users/me", {"skills": ["backend"]}, idem=idem)
    other = await user.patch("/api/users/me", {"skills": ["ml"]}, idem=idem)
    no_key = await user.client.patch("/api/users/me", json={"skills": ["ml"]})
    empty = await user.patch("/api/users/me", {})
    assert first.status_code == again.status_code == 200
    assert first.json() == again.json()
    assert first.json()["skills"] == ["backend"]
    assert other.status_code == 422 and other.json()["error"]["code"] == "idempotency_key_mismatch"
    assert no_key.status_code == 400 and no_key.json()["error"]["code"] == "idempotency_key_required"
    assert empty.status_code == 400
    events = await query(clean_db, "SELECT action FROM audit_events WHERE action = 'participant_updated'")
    assert len(events) == 1
