"""Password hashing and JWT session tokens."""

import time
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Response
from starlette.concurrency import run_in_threadpool

from app.config import get_settings

COOKIE_NAME = "crewline_session"
_hasher = PasswordHasher()
_DUMMY_HASH = _hasher.hash("timing-equalizer")


async def hash_password(plain: str) -> str:
    """Hash a password with argon2id in a threadpool."""
    return await run_in_threadpool(_hasher.hash, plain)


async def verify_password(hashed: str | None, plain: str) -> bool:
    """Check a password against its argon2id hash in a threadpool; a missing hash still costs one verify."""
    def check() -> bool:
        try:
            return _hasher.verify(hashed or _DUMMY_HASH, plain) and hashed is not None
        except (VerificationError, InvalidHashError):
            return False
    return await run_in_threadpool(check)


def issue_token(user_id: UUID) -> str:
    """Create a signed JWT with sub, iat and exp."""
    settings = get_settings()
    now = int(time.time())
    claims = {"sub": str(user_id), "iat": now, "exp": now + settings.jwt_ttl_min * 60}
    return jwt.encode(claims, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> UUID | None:
    """Verify a JWT and return the user id, or None if invalid or expired."""
    try:
        claims = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"], options={"require": ["exp", "sub"]})
        return UUID(claims["sub"])
    except (jwt.PyJWTError, ValueError):
        return None


def set_session_cookie(response: Response, token: str) -> None:
    """Set the httpOnly session cookie."""
    settings = get_settings()
    response.set_cookie(
        COOKIE_NAME, token, max_age=settings.jwt_ttl_min * 60, httponly=True,
        secure=settings.cookie_secure, samesite="lax", path="/")


def clear_session_cookie(response: Response) -> None:
    """Remove the session cookie."""
    response.delete_cookie(COOKIE_NAME, path="/")
