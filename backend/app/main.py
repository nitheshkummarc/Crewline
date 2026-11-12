"""App factory: lifespan, middleware, routers, static web files."""

import asyncio
import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from starlette.responses import Response

from app.config import Settings, get_settings
from app.core import cache, events, idempotency, metrics, ratelimit
from app.core.errors import Busy, NotFound, install_error_handlers
from app.core.headers import SecurityHeadersMiddleware
from app.core.logging import configure_logging
from app.core.middleware import RequestIdMiddleware
from app.core.responses import JsonResponse
from app.db import pools as db_pools
from app.db import tx
from app.db.listener import EventListener
from app.modules.auth.router import router as auth_router
from app.modules.board.router import router as board_router
from app.modules.events.router import router as events_router
from app.modules.hackathons.router import router as hackathons_router
from app.modules.lab.router import router as lab_router
from app.modules.requests.router import router as requests_router
from app.modules.suggestions.router import router as suggestions_router
from app.modules.teams.router import router as teams_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Open pools and start background tasks; close them on shutdown."""
    settings: Settings = app.state.settings
    pools = await db_pools.create_pools(settings)
    tx.configure(settings.write_inflight_max)
    purge = asyncio.create_task(idempotency.purge_loop(pools.write, settings.idempotency_ttl_h))
    listener = EventListener(settings.listen_url)
    await listener.start()
    app.state.listener = listener
    try:
        yield
    finally:
        await listener.stop()
        purge.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await purge
        await db_pools.close_pools()


def mount_web(app: FastAPI, dist_dir: str) -> None:
    """Serve the built SPA at / with index.html as the fallback for client routes."""
    dist = Path(dist_dir)
    if not dist.is_absolute():
        dist = Path(__file__).resolve().parents[2] / dist_dir
    index = dist / "index.html"
    if not index.exists():
        return

    # HEAD too: uptime monitors and link checkers send it, and FastAPI routes are GET-only by default (B-32).
    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        """Return a built file, or index.html so the client router decides; API paths stay 404."""
        if path.startswith("api/"):
            raise NotFound()
        candidate = (dist / path).resolve()
        if path and candidate.is_file() and dist.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the FastAPI app with middleware, routers and the SPA mount."""
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(title="Crewline API", default_response_class=JsonResponse, lifespan=lifespan)
    app.state.settings = settings
    ratelimit.configure(settings)
    cache.configure(settings.board_cache_ttl_ms)
    events.configure(settings.sse_max_streams_per_user)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestIdMiddleware)
    install_error_handlers(app)
    for router in (auth_router, hackathons_router, teams_router, requests_router, board_router,
                   suggestions_router, events_router, lab_router):
        app.include_router(router)

    @app.api_route("/healthz", methods=["GET", "HEAD"], include_in_schema=False)
    async def healthz() -> dict:
        """Liveness: the process answers; no database call."""
        return {"ok": True}

    @app.api_route("/readyz", methods=["GET", "HEAD"], include_in_schema=False)
    async def readyz() -> dict:
        """Readiness: one SELECT 1 on the read pool; 503 busy if the database is unreachable."""
        try:
            async with db_pools.read_conn() as conn:
                await conn.fetchval("SELECT 1")
        except Exception as exc:
            raise Busy("database not ready") from exc
        return {"ok": True}

    @app.get("/metrics", include_in_schema=False)
    async def metrics_endpoint() -> Response:
        metrics.collect(db_pools._pools, tx.stats, cache.board_cache, events.hub, getattr(app.state, "listener", None))
        body, content_type = metrics.render()
        return Response(body, media_type=content_type)

    mount_web(app, settings.web_dist_dir)
    return app
