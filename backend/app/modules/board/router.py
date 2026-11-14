"""Board endpoints with ETag and 304 support.

Contents:
    _cached: Return 304 when the client already has this ETag, else the cached bytes.
    teams_board: GET /api/hackathons/{hid}/board/teams.
    people_board: GET /api/hackathons/{hid}/board/people.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query
from starlette.responses import Response

from app.core.deps import current_user_id
from app.modules.board import service

router = APIRouter(prefix="/api", tags=["board"])


def _cached(etag: str, body: bytes, if_none_match: str | None) -> Response:
    """Return 304 when the client already has this ETag, else the cached bytes."""
    headers = {"ETag": etag, "Cache-Control": "no-cache"}
    if if_none_match == etag:
        return Response(status_code=304, headers=headers)
    return Response(body, media_type="application/json", headers=headers)


@router.get("/hackathons/{hid}/board/teams")
async def teams_board(hid: UUID, user_id: UUID = Depends(current_user_id), limit: int = Query(20, ge=1, le=50),
                      cursor: str | None = Query(None, max_length=200),
                      if_none_match: str | None = Header(None)) -> Response:
    """GET /api/hackathons/{hid}/board/teams."""
    etag, body = await service.teams_page(hid, limit, cursor)
    return _cached(etag, body, if_none_match)


@router.get("/hackathons/{hid}/board/people")
async def people_board(hid: UUID, user_id: UUID = Depends(current_user_id), limit: int = Query(20, ge=1, le=50),
                       cursor: str | None = Query(None, max_length=200),
                       if_none_match: str | None = Header(None)) -> Response:
    """GET /api/hackathons/{hid}/board/people."""
    etag, body = await service.people_page(hid, limit, cursor)
    return _cached(etag, body, if_none_match)
