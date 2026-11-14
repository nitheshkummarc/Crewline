"""Suggestions endpoint.

Contents:
    suggestions: GET /api/hackathons/{hid}/suggestions.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.deps import current_user_id
from app.modules.suggestions import service

router = APIRouter(prefix="/api", tags=["suggestions"])


@router.get("/hackathons/{hid}/suggestions")
async def suggestions(hid: UUID, user_id: UUID = Depends(current_user_id),
                      limit: int = Query(20, ge=1, le=50)) -> dict:
    """GET /api/hackathons/{hid}/suggestions."""
    return await service.suggest(hid, user_id, limit)
