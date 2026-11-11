"""Request id, access log and request-duration metrics middleware (pure ASGI, safe for streaming)."""

import logging
import time
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.metrics import observe_request

log = logging.getLogger("crewline.access")


class RequestIdMiddleware:
    """Accept or create X-Request-ID, attach it to the request and response, log one line per request."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Wrap one HTTP request."""
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = dict(scope["headers"]).get(b"x-request-id", b"").decode()[:64]
        request_id = incoming or uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        started = time.perf_counter()
        status = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message.setdefault("headers", []).append((b"x-request-id", request_id.encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            route = scope.get("route")
            elapsed = time.perf_counter() - started
            route_path = getattr(route, "path", "unmatched")
            observe_request(scope["method"], route_path, status, elapsed)
            log.info("request", extra={
                "request_id": request_id,
                "method": scope["method"],
                "route": getattr(route, "path", scope["path"]),
                "status": status,
                "duration_ms": round(elapsed * 1000, 2),
            })
