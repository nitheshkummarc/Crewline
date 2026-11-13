"""Domain error types and the HTTP error envelope."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.responses import JsonResponse

log = logging.getLogger("crewline.errors")


class DomainError(Exception):
    """Base error with status, code and message; rendered as the error envelope."""

    status = 400
    code = "bad_request"
    message = "Bad request"

    def __init__(self, message: str | None = None, retry_after: int | None = None) -> None:
        super().__init__(message or self.message)
        self.message = message or self.message
        self.retry_after = retry_after


class ValidationFailed(DomainError):
    status, code, message = 400, "validation_error", "Invalid input"


class IdempotencyKeyRequired(DomainError):
    status, code, message = 400, "idempotency_key_required", "Idempotency-Key header is required"


class BotCheckFailed(DomainError):
    status, code, message = 400, "bot_check_failed", "Form check failed. Wait a moment and submit again"


class Unauthenticated(DomainError):
    status, code, message = 401, "unauthenticated", "Log in to continue"


class InvalidCredentials(DomainError):
    status, code, message = 401, "invalid_credentials", "Wrong email or password"


class NotLeader(DomainError):
    status, code, message = 403, "not_leader", "Only the team leader can do this"


class MembersOnly(DomainError):
    status, code, message = 403, "members_only", "Only team members can see this"


class NotFound(DomainError):
    status, code, message = 404, "not_found", "Not found"


class InviteInvalid(DomainError):
    status, code, message = 404, "invite_invalid", "Invite code is invalid or expired"


class EmailTaken(DomainError):
    status, code, message = 409, "email_taken", "Email is already registered"


class NotRegistered(DomainError):
    status, code, message = 409, "not_registered", "Register for this hackathon first"


class AlreadyInTeam(DomainError):
    status, code, message = 409, "already_in_team", "You are already in a team in this hackathon"


class TeamFull(DomainError):
    status, code, message = 409, "team_full", "Team is full"


class TeamFinalized(DomainError):
    status, code, message = 409, "team_finalized", "Team is finalized"


class NotFinalized(DomainError):
    status, code, message = 409, "not_finalized", "Team is not finalized"


class BelowMinSize(DomainError):
    status, code, message = 409, "below_min_size", "Team is below the minimum size"


class RequestNotPending(DomainError):
    status, code, message = 409, "request_not_pending", "Request is no longer pending"


class NotAMember(DomainError):
    status, code, message = 409, "not_a_member", "User is not a member of this team"


class CannotRemoveSelf(DomainError):
    status, code, message = 409, "cannot_remove_self", "Use leave to remove yourself"


class TooManyPendingRequests(DomainError):
    status, code, message = 409, "too_many_pending_requests", "You already have 5 pending requests"


class IdempotencyKeyMismatch(DomainError):
    status, code, message = 422, "idempotency_key_mismatch", "Idempotency-Key was used for a different request"


class RateLimited(DomainError):
    status, code, message = 429, "rate_limited", "Too many requests"


class Busy(DomainError):
    status, code, message = 503, "busy", "Server is busy, retry shortly"

    def __init__(self, message: str | None = None, retry_after: int | None = 1) -> None:
        super().__init__(message, retry_after)


def error_response(request: Request, status: int, code: str, message: str,
                   retry_after: int | None = None) -> JsonResponse:
    """Build the error envelope response with the request id."""
    request_id = getattr(request.state, "request_id", None)
    headers = {"Retry-After": str(retry_after)} if retry_after else None
    return JsonResponse(
        {"error": {"code": code, "message": message, "request_id": request_id}},
        status_code=status, headers=headers)


def install_error_handlers(app: FastAPI) -> None:
    """Register handlers that render DomainError as the envelope and validation errors as 400."""
    # Imported here: app.db.errors imports this module at load time.
    from app.db.errors import is_busy

    @app.exception_handler(DomainError)
    async def _domain(request: Request, exc: DomainError) -> JsonResponse:
        return error_response(request, exc.status, exc.code, exc.message, exc.retry_after)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JsonResponse:
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(p) for p in first.get("loc", ()) if p != "body")
        message = f"{where}: {first.get('msg', 'invalid')}" if where else "Invalid input"
        return error_response(request, 400, "validation_error", message)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JsonResponse:
        code = "not_found" if exc.status_code == 404 else "http_error"
        return error_response(request, exc.status_code, code, str(exc.detail))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JsonResponse:
        # Backstop for a transient error outside read_conn and run_write (B-35).
        if is_busy(exc):
            log.warning("transient database error", extra={"error": type(exc).__name__})
            return error_response(request, 503, "busy", "Server is busy, retry shortly", 1)
        log.exception("unhandled error", extra={"request_id": getattr(request.state, "request_id", None)})
        return error_response(request, 500, "internal_error", "Internal error")
