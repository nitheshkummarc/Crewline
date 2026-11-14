"""Signup and login bot checks: T-API-46 (form token and minimum fill time), T-API-47 (honeypot and forged tokens).

Contents:
    _signup_body: Return a valid signup body without bot-check fields.
    _code: Return the error code of an error response.
    test_api_46_form_token_minimum_fill_time: T-API-46: a token used under 2 s after issue is rejected; the same
        token works after 2 s.
    test_api_47_honeypot_and_forged_tokens: T-API-47: filled honeypot, wrong secret, expired token or a session
        token all return bot_check_failed.
"""

import asyncio
import time
import uuid

import httpx
import jwt
from helpers import SHARED_TLS, TEST_JWT_SECRET, Users, form_fields


def _signup_body(**extra: object) -> dict:
    """Return a valid signup body without bot-check fields."""
    return {"email": f"bot-{uuid.uuid4().hex[:8]}@example.com", "password": "long-enough-1",
            "display_name": "Bot Check", **extra}


def _code(response: httpx.Response) -> str:
    """Return the error code of an error response."""
    return response.json()["error"]["code"]


async def test_api_46_form_token_minimum_fill_time(server: str, users: Users) -> None:
    """T-API-46: a token used under 2 s after issue is rejected; the same token works after 2 s."""
    async with httpx.AsyncClient(base_url=server, verify=SHARED_TLS) as client:
        issued = await client.get("/api/auth/form-token")
        assert issued.status_code == 200 and issued.headers["cache-control"] == "no-store"
        token = issued.json()["token"]
        body = _signup_body(form_token=token)
        fast = await client.post("/api/auth/signup", json=body)
        known = await users.new("bot-login")
        fast_login = await client.post("/api/auth/login", json={
            "email": known.email, "password": "correct-horse-1", "form_token": token})
        await asyncio.sleep(2.1)
        slow = await client.post("/api/auth/signup", json=body)
        missing = await client.post("/api/auth/signup", json=_signup_body())
    assert fast.status_code == 400 and _code(fast) == "bot_check_failed"
    assert fast_login.status_code == 400 and _code(fast_login) == "bot_check_failed"
    assert slow.status_code == 201, slow.text
    assert missing.status_code == 400 and _code(missing) == "validation_error"


async def test_api_47_honeypot_and_forged_tokens(server: str) -> None:
    """T-API-47: filled honeypot, wrong secret, expired token or a session token all return bot_check_failed."""
    now = int(time.time())
    old_ms = (now - 60) * 1000
    other_secret = "another-secret-0123456789abcdef01234567"
    forged = jwt.encode({"aud": "crewline-form", "iat_ms": old_ms, "exp": now + 60}, other_secret, algorithm="HS256")
    expired = jwt.encode({"aud": "crewline-form", "iat_ms": old_ms, "exp": now - 5}, TEST_JWT_SECRET, algorithm="HS256")
    session = jwt.encode({"sub": str(uuid.uuid4()), "iat": now, "exp": now + 60}, TEST_JWT_SECRET, algorithm="HS256")
    bodies = [
        _signup_body(**{**form_fields(), "company": "Acme"}),
        _signup_body(form_token=forged),
        _signup_body(form_token=expired),
        _signup_body(form_token=session),
    ]
    async with httpx.AsyncClient(base_url=server, verify=SHARED_TLS) as client:
        responses = [await client.post("/api/auth/signup", json=body) for body in bodies]
        # A form token is not a session: used as the cookie it is rejected.
        client.cookies.set("crewline_session", form_fields()["form_token"])
        me = await client.get("/api/auth/me")
    for response in responses:
        assert response.status_code == 400 and _code(response) == "bot_check_failed", response.text
    assert me.status_code == 401 and _code(me) == "unauthenticated"
