"""Security headers on every response and cache rules for the built web app (pure ASGI, safe for streaming)."""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])

SECURITY_HEADERS: list[tuple[bytes, bytes]] = [
    (b"content-security-policy", CSP.encode()),
    (b"strict-transport-security", b"max-age=31536000; includeSubDomains"),
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"same-origin"),
    (b"x-frame-options", b"DENY"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
]

# Vite puts content hashes in every file name under /assets/, so those never change.
IMMUTABLE = b"public, max-age=31536000, immutable"
REVALIDATE = b"no-cache"


def cache_control(path: str, headers: list[tuple[bytes, bytes]]) -> bytes | None:
    """Return the Cache-Control for a web app response, or None to leave the response as it is."""
    if path.startswith("/api/") or any(name == b"cache-control" for name, _ in headers):
        return None
    if path.startswith("/assets/"):
        return IMMUTABLE
    content_type = next((value for name, value in headers if name == b"content-type"), b"")
    return REVALIDATE if content_type.startswith(b"text/html") else None


class SecurityHeadersMiddleware:
    """Add the security headers to every HTTP response and cache rules to web app files."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Wrap one HTTP request."""
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(SECURITY_HEADERS)
                cache = cache_control(scope["path"], headers)
                if cache:
                    headers.append((b"cache-control", cache))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_wrapper)
