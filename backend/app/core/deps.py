"""FastAPI dependencies shared by routers."""

import re
from typing import Any
from uuid import UUID

from fastapi import Header, Request

from app.core import ratelimit
from app.core.errors import IdempotencyKeyRequired, RateLimited, Unauthenticated
from app.core.idempotency import request_hash
from app.core.security import COOKIE_NAME, decode_token
from app.db.tx import WriteContext

_KEY_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")


def current_user_id(request: Request) -> UUID:
    """Return the user id from the session cookie or raise 401."""
    token = request.cookies.get(COOKIE_NAME)
    user_id = decode_token(token) if token else None
    if user_id is None:
        raise Unauthenticated()
    return user_id


def idempotency_key(key: str | None = Header(default=None, alias="Idempotency-Key")) -> str:
    """Validate and return the Idempotency-Key header or raise 400."""
    if key is None or not _KEY_RE.match(key):
        raise IdempotencyKeyRequired()
    return key


def client_ip(request: Request) -> str:
    """Return the client IP used for rate limits (first X-Forwarded-For hop behind a proxy)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def write_context(request: Request, user_id: UUID, key: str, route: str,
                  params: dict[str, Any] | None = None, body: Any = None) -> WriteContext:
    """Apply the per-user mutation limit and build the WriteContext for one write."""
    wait = ratelimit.get().mutations.hit(str(user_id))
    if wait:
        raise RateLimited(retry_after=wait)
    return WriteContext(
        user_id=user_id, key=key, route=route,
        request_hash=request_hash(request.method, route, params or {}, body),
        request_id=getattr(request.state, "request_id", None))
