"""Race lab endpoints: info, last-seat race, spam clicks, request queue, traced join walkthrough, latency."""

from uuid import UUID

from fastapi import APIRouter, Depends

from app.config import get_settings
from app.core.deps import current_user_id
from app.core.errors import NotFound
from app.modules.lab import explain, service
from app.modules.lab.schemas import QueueIn, RaceIn, SpamIn

router = APIRouter(prefix="/api/lab", tags=["lab"])


@router.get("")
async def info(user_id: UUID = Depends(current_user_id)) -> dict:
    """GET /api/lab."""
    settings = get_settings()
    if not settings.lab_enabled:
        raise NotFound()
    return {"enabled": True, "hackathon_id": await service.lab_hackathon(), "max_attempts": settings.lab_max_attempts}


@router.post("/race")
async def race(body: RaceIn, user_id: UUID = Depends(current_user_id)) -> dict:
    """POST /api/lab/race."""
    return await service.guarded(user_id, body.attempts, lambda: service.run_race(body.attempts))


@router.post("/spam")
async def spam(body: SpamIn, user_id: UUID = Depends(current_user_id)) -> dict:
    """POST /api/lab/spam."""
    return await service.guarded(user_id, body.clicks, lambda: service.run_spam(body.clicks))


@router.post("/queue")
async def queue(body: QueueIn, user_id: UUID = Depends(current_user_id)) -> dict:
    """POST /api/lab/queue."""
    return await service.guarded(user_id, body.requests, lambda: service.run_queue(body.requests))


@router.post("/walkthrough")
async def walkthrough(user_id: UUID = Depends(current_user_id)) -> dict:
    """POST /api/lab/walkthrough."""
    return await service.guarded(user_id, 1, explain.run_walkthrough)


@router.get("/latency")
async def latency(user_id: UUID = Depends(current_user_id)) -> dict:
    """GET /api/lab/latency."""
    if not get_settings().lab_enabled:
        raise NotFound()
    return explain.latency()
