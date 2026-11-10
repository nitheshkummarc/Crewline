"""Map PostgreSQL errors to domain errors by constraint name and SQLSTATE."""

import asyncio
import logging

import asyncpg

from app.core import errors as e

log = logging.getLogger("crewline.db")

CONSTRAINT_ERRORS: dict[str, type[e.DomainError]] = {
    "memberships_one_team_per_hackathon": e.AlreadyInTeam,
    "memberships_pkey": e.AlreadyInTeam,
    "memberships_participant_fk": e.NotRegistered,
    "join_requests_participant_fk": e.NotRegistered,
    "memberships_team_fk": e.NotFound,
    "join_requests_team_fk": e.NotFound,
    "teams_cap": e.TeamFull,
    "teams_min_when_finalized": e.BelowMinSize,
    "users_email_unique": e.EmailTaken,
}

RETRYABLE = (asyncpg.exceptions.DeadlockDetectedError, asyncpg.exceptions.SerializationError)
BUSY = (
    asyncpg.exceptions.LockNotAvailableError,
    asyncpg.exceptions.QueryCanceledError,
    asyncpg.exceptions.TooManyConnectionsError,
    asyncio.TimeoutError,
)


def constraint_of(exc: BaseException) -> str | None:
    """Return the constraint name carried by an integrity error, if any."""
    return getattr(exc, "constraint_name", None)


def to_domain_error(exc: BaseException) -> e.DomainError | None:
    """Convert an asyncpg integrity error to a DomainError, or return None."""
    name = constraint_of(exc)
    if name is None:
        return None
    if name == "teams_cap":
        log.error("capacity backstop triggered", extra={"constraint": name})
    cls = CONSTRAINT_ERRORS.get(name)
    return cls() if cls else None


def is_retryable(exc: BaseException) -> bool:
    """True for 40P01 and 40001."""
    return isinstance(exc, RETRYABLE)


def is_busy(exc: BaseException) -> bool:
    """True for lock timeouts, statement timeouts and connection exhaustion."""
    return isinstance(exc, BUSY)
