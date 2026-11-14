"""Join request endpoints.

Contents:
    _respond: Render a write outcome.
    create_request: POST /api/teams/{tid}/requests.
    list_for_team: GET /api/teams/{tid}/requests (leader only).
    list_mine: GET /api/hackathons/{hid}/my-requests.
    accept: POST /api/requests/{rid}/accept.
    decline: POST /api/requests/{rid}/decline.
    withdraw: POST /api/requests/{rid}/withdraw.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Request

from app.core.deps import current_user_id, idempotency_key, write_context
from app.core.responses import JsonResponse
from app.db.tx import Outcome
from app.modules.requests import service
from app.modules.requests.schemas import CreateRequestIn

router = APIRouter(prefix="/api", tags=["requests"])


def _respond(outcome: Outcome) -> JsonResponse:
    """Render a write outcome."""
    return JsonResponse(outcome.body, status_code=outcome.status)


@router.post("/teams/{tid}/requests")
async def create_request(tid: UUID, body: CreateRequestIn, request: Request,
                         user_id: UUID = Depends(current_user_id),
                         key: str = Depends(idempotency_key)) -> JsonResponse:
    """POST /api/teams/{tid}/requests."""
    ctx = write_context(request, user_id, key, "create_request", {"tid": tid}, body.model_dump())
    return _respond(await service.create_request(ctx, tid, body.message))


@router.get("/teams/{tid}/requests")
async def list_for_team(tid: UUID, user_id: UUID = Depends(current_user_id)) -> list[dict]:
    """GET /api/teams/{tid}/requests (leader only)."""
    return await service.list_for_team(tid, user_id)


@router.get("/hackathons/{hid}/my-requests")
async def list_mine(hid: UUID, user_id: UUID = Depends(current_user_id)) -> list[dict]:
    """GET /api/hackathons/{hid}/my-requests."""
    return await service.list_mine(hid, user_id)


@router.post("/requests/{rid}/accept")
async def accept(rid: UUID, request: Request, user_id: UUID = Depends(current_user_id),
                 key: str = Depends(idempotency_key)) -> JsonResponse:
    """POST /api/requests/{rid}/accept."""
    ctx = write_context(request, user_id, key, "accept_request", {"rid": rid})
    return _respond(await service.accept(ctx, rid))


@router.post("/requests/{rid}/decline")
async def decline(rid: UUID, request: Request, user_id: UUID = Depends(current_user_id),
                  key: str = Depends(idempotency_key)) -> JsonResponse:
    """POST /api/requests/{rid}/decline."""
    ctx = write_context(request, user_id, key, "decline_request", {"rid": rid})
    return _respond(await service.decline(ctx, rid))


@router.post("/requests/{rid}/withdraw")
async def withdraw(rid: UUID, request: Request, user_id: UUID = Depends(current_user_id),
                   key: str = Depends(idempotency_key)) -> JsonResponse:
    """POST /api/requests/{rid}/withdraw."""
    ctx = write_context(request, user_id, key, "withdraw_request", {"rid": rid})
    return _respond(await service.withdraw(ctx, rid))
