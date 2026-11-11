"""Bot checks for signup and login: a signed form token with a minimum fill time, plus a honeypot field."""

import time

import jwt

from app.config import get_settings
from app.core.errors import BotCheckFailed

AUDIENCE = "crewline-form"
MIN_FILL_MS = 2000
TOKEN_TTL_S = 2 * 3600


def issue_form_token() -> str:
    """Return a signed token that records when the form was rendered."""
    now_ms = int(time.time() * 1000)
    claims = {"aud": AUDIENCE, "iat_ms": now_ms, "exp": now_ms // 1000 + TOKEN_TTL_S}
    return jwt.encode(claims, get_settings().jwt_secret, algorithm="HS256")


def check_form(token: str, honeypot: str) -> None:
    """Raise BotCheckFailed for a filled honeypot, a bad or expired token, or a submit under 2 s after render."""
    if honeypot:
        raise BotCheckFailed()
    try:
        # The audience keeps form tokens and session tokens apart: neither verifies as the other.
        claims = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"], audience=AUDIENCE,
                            options={"require": ["exp", "aud", "iat_ms"]})
    except jwt.PyJWTError as exc:
        raise BotCheckFailed() from exc
    issued = claims["iat_ms"]
    if not isinstance(issued, int) or int(time.time() * 1000) - issued < MIN_FILL_MS:
        raise BotCheckFailed()
