"""Auth and profile endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response

from app.core.deps import client_ip, current_user_id, idempotency_key, write_context
from app.core.formguard import issue_form_token
from app.core.responses import JsonResponse
from app.core.security import clear_session_cookie, issue_token, set_session_cookie
from app.modules.auth import service
from app.modules.auth.schemas import LoginIn, SignupIn, UpdateMeIn

router = APIRouter(prefix="/api", tags=["auth"])


@router.get("/auth/form-token")
async def form_token() -> JsonResponse:
    """GET /api/auth/form-token."""
    return JsonResponse({"token": issue_form_token()}, headers={"Cache-Control": "no-store"})


@router.post("/auth/signup", status_code=201)
async def signup(body: SignupIn, response: Response, ip: str = Depends(client_ip)) -> dict:
    """POST /api/auth/signup."""
    user = await service.signup(body, ip)
    set_session_cookie(response, issue_token(UUID(user["id"])))
    return user


@router.post("/auth/login")
async def login(body: LoginIn, response: Response, ip: str = Depends(client_ip)) -> dict:
    """POST /api/auth/login."""
    user = await service.login(body, ip)
    set_session_cookie(response, issue_token(UUID(user["id"])))
    return user


@router.post("/auth/logout", status_code=204)
async def logout(response: Response) -> Response:
    """POST /api/auth/logout."""
    clear_session_cookie(response)
    response.status_code = 204
    return response


@router.get("/auth/me")
async def me(user_id: UUID = Depends(current_user_id)) -> dict:
    """GET /api/auth/me."""
    return await service.me(user_id)


@router.patch("/users/me")
async def update_me(body: UpdateMeIn, request: Request, user_id: UUID = Depends(current_user_id),
                    key: str = Depends(idempotency_key)) -> JsonResponse:
    """PATCH /api/users/me."""
    ctx = write_context(request, user_id, key, "update_profile", {}, body.model_dump(exclude_unset=True))
    outcome = await service.update_profile(ctx, body)
    return JsonResponse(outcome.body, status_code=outcome.status)
