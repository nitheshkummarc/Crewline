"""Hackathon endpoints and the meta endpoint."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import ORJSONResponse

from app.core.deps import current_user_id, idempotency_key, write_context
from app.core.skills import CORE_ROLES, SKILLS
from app.modules.hackathons import service
from app.modules.hackathons.schemas import SetLookingIn

router = APIRouter(prefix="/api", tags=["hackathons"])


@router.get("/meta")
async def meta() -> dict:
    """GET /api/meta: skill taxonomy and core roles."""
    return {"skills": list(SKILLS), "core_roles": list(CORE_ROLES)}


@router.get("/hackathons")
async def list_hackathons(user_id: UUID = Depends(current_user_id)) -> list[dict]:
    """GET /api/hackathons."""
    return await service.list_hackathons()


@router.get("/hackathons/{hid}")
async def get_hackathon(hid: UUID, user_id: UUID = Depends(current_user_id)) -> dict:
    """GET /api/hackathons/{hid}."""
    return await service.get_hackathon(hid)


@router.post("/hackathons/{hid}/register")
async def register(hid: UUID, request: Request, user_id: UUID = Depends(current_user_id),
                   key: str = Depends(idempotency_key)) -> ORJSONResponse:
    """POST /api/hackathons/{hid}/register."""
    ctx = write_context(request, user_id, key, "register", {"hid": hid})
    outcome = await service.register(ctx, hid)
    return ORJSONResponse(outcome.body, status_code=outcome.status)


@router.get("/hackathons/{hid}/me")
async def my_status(hid: UUID, user_id: UUID = Depends(current_user_id)) -> dict:
    """GET /api/hackathons/{hid}/me."""
    return await service.my_status(hid, user_id)


@router.patch("/hackathons/{hid}/me")
async def set_looking(hid: UUID, body: SetLookingIn, request: Request, user_id: UUID = Depends(current_user_id),
                      key: str = Depends(idempotency_key)) -> ORJSONResponse:
    """PATCH /api/hackathons/{hid}/me."""
    ctx = write_context(request, user_id, key, "set_looking", {"hid": hid}, body.model_dump())
    outcome = await service.set_looking(ctx, hid, body.looking)
    return ORJSONResponse(outcome.body, status_code=outcome.status)
