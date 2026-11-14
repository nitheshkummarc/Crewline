"""Team endpoints, including the team audit log.

Contents:
    _respond: Render a write outcome.
    create_team: POST /api/hackathons/{hid}/teams.
    join_by_code: POST /api/teams/join.
    get_team: GET /api/teams/{tid}.
    update_team: PATCH /api/teams/{tid}.
    leave: POST /api/teams/{tid}/leave.
    remove_member: DELETE /api/teams/{tid}/members/{uid}.
    finalize: POST /api/teams/{tid}/finalize.
    reopen: POST /api/teams/{tid}/reopen.
    get_invite: GET /api/teams/{tid}/invite.
    regenerate_invite: POST /api/teams/{tid}/invite/regenerate.
    team_audit: GET /api/teams/{tid}/audit for members.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request

from app.core.deps import client_ip, current_user_id, idempotency_key, write_context
from app.core.errors import ValidationFailed
from app.core.responses import JsonResponse
from app.db.tx import Outcome
from app.modules.teams import service
from app.modules.teams.schemas import CreateTeamIn, JoinIn, UpdateTeamIn

router = APIRouter(prefix="/api", tags=["teams"])


def _respond(outcome: Outcome) -> JsonResponse:
    """Render a write outcome."""
    return JsonResponse(outcome.body, status_code=outcome.status)


@router.post("/hackathons/{hid}/teams")
async def create_team(hid: UUID, body: CreateTeamIn, request: Request, user_id: UUID = Depends(current_user_id),
                      key: str = Depends(idempotency_key)) -> JsonResponse:
    """POST /api/hackathons/{hid}/teams."""
    ctx = write_context(request, user_id, key, "create_team", {"hid": hid}, body.model_dump())
    return _respond(await service.create_team(ctx, hid, body.name))


@router.post("/teams/join")
async def join_by_code(body: JoinIn, request: Request, user_id: UUID = Depends(current_user_id),
                       key: str = Depends(idempotency_key), ip: str = Depends(client_ip)) -> JsonResponse:
    """POST /api/teams/join."""
    ctx = write_context(request, user_id, key, "join_by_code", {}, body.model_dump())
    return _respond(await service.join_by_code(ctx, body.code, ip))


@router.get("/teams/{tid}")
async def get_team(tid: UUID, user_id: UUID = Depends(current_user_id)) -> dict:
    """GET /api/teams/{tid}."""
    return await service.get_team(tid)


@router.patch("/teams/{tid}")
async def update_team(tid: UUID, body: UpdateTeamIn, request: Request, user_id: UUID = Depends(current_user_id),
                      key: str = Depends(idempotency_key)) -> JsonResponse:
    """PATCH /api/teams/{tid}."""
    ctx = write_context(request, user_id, key, "update_team", {"tid": tid}, body.model_dump())
    return _respond(await service.update_team(ctx, tid, body.name, body.looking))


@router.post("/teams/{tid}/leave")
async def leave(tid: UUID, request: Request, user_id: UUID = Depends(current_user_id),
                key: str = Depends(idempotency_key)) -> JsonResponse:
    """POST /api/teams/{tid}/leave."""
    ctx = write_context(request, user_id, key, "leave_team", {"tid": tid})
    return _respond(await service.leave(ctx, tid))


@router.delete("/teams/{tid}/members/{uid}")
async def remove_member(tid: UUID, uid: UUID, request: Request, user_id: UUID = Depends(current_user_id),
                        key: str = Depends(idempotency_key)) -> JsonResponse:
    """DELETE /api/teams/{tid}/members/{uid}."""
    ctx = write_context(request, user_id, key, "remove_member", {"tid": tid, "uid": uid})
    return _respond(await service.remove_member(ctx, tid, uid))


@router.post("/teams/{tid}/finalize")
async def finalize(tid: UUID, request: Request, user_id: UUID = Depends(current_user_id),
                   key: str = Depends(idempotency_key)) -> JsonResponse:
    """POST /api/teams/{tid}/finalize."""
    ctx = write_context(request, user_id, key, "finalize_team", {"tid": tid})
    return _respond(await service.finalize(ctx, tid))


@router.post("/teams/{tid}/reopen")
async def reopen(tid: UUID, request: Request, user_id: UUID = Depends(current_user_id),
                 key: str = Depends(idempotency_key)) -> JsonResponse:
    """POST /api/teams/{tid}/reopen."""
    ctx = write_context(request, user_id, key, "reopen_team", {"tid": tid})
    return _respond(await service.reopen(ctx, tid))


@router.get("/teams/{tid}/invite")
async def get_invite(tid: UUID, user_id: UUID = Depends(current_user_id)) -> dict:
    """GET /api/teams/{tid}/invite."""
    return await service.get_invite(tid, user_id)


@router.post("/teams/{tid}/invite/regenerate")
async def regenerate_invite(tid: UUID, request: Request, user_id: UUID = Depends(current_user_id),
                            key: str = Depends(idempotency_key)) -> JsonResponse:
    """POST /api/teams/{tid}/invite/regenerate."""
    ctx = write_context(request, user_id, key, "regenerate_invite", {"tid": tid})
    return _respond(await service.regenerate_invite(ctx, tid))


@router.get("/teams/{tid}/audit")
async def team_audit(tid: UUID, user_id: UUID = Depends(current_user_id), limit: int = Query(20, ge=1, le=50),
                     cursor: str | None = Query(None, max_length=20)) -> dict:
    """GET /api/teams/{tid}/audit for members."""
    if cursor is not None and not cursor.isdigit():
        raise ValidationFailed("cursor: invalid")
    return await service.team_audit(tid, user_id, int(cursor) if cursor else None, limit)
