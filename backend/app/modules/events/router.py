"""SSE endpoint: one stream per browser tab, events for one hackathon.

Contents:
    stream: GET /api/events: subscribe and yield events with heartbeats; never holds a database connection.
"""

from collections.abc import AsyncIterator
from uuid import UUID

import orjson
from fastapi import APIRouter, Depends, Query
from sse_starlette.sse import EventSourceResponse

from app.config import get_settings
from app.core import events
from app.core.deps import current_user_id
from app.core.errors import NotFound
from app.db.pools import read_conn
from app.modules.board.repo import hackathon_exists

router = APIRouter(prefix="/api", tags=["events"])


@router.get("/events")
async def stream(hackathon_id: UUID = Query(...), user_id: UUID = Depends(current_user_id)) -> EventSourceResponse:
    """GET /api/events: subscribe and yield events with heartbeats; never holds a database connection."""
    async with read_conn() as conn:
        if not await hackathon_exists(conn, hackathon_id):
            raise NotFound()
    sub = events.hub.subscribe(str(hackathon_id), str(user_id))

    async def generate() -> AsyncIterator[dict]:
        try:
            while True:
                kind, data = await sub.queue.get()
                if kind == events.CLOSE[0]:
                    return
                yield {"event": kind, "data": orjson.dumps(data, default=str).decode()}
        finally:
            events.hub.unsubscribe(sub)

    return EventSourceResponse(
        generate(), ping=get_settings().sse_heartbeat_s,
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
