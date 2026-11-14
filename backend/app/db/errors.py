"""Map PostgreSQL errors to domain errors by constraint name and SQLSTATE.

Contents:
    constraint_of: Return the constraint name carried by an integrity error, if any.
    to_domain_error: Convert an asyncpg integrity error to a DomainError, or return None.
    is_retryable: True for 40P01 and 40001.
    is_busy: True for timeouts, connection exhaustion and lost connections anywhere in the cause chain.
"""

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
    # A valid session whose user row no longer exists (database reset or reseed) (B-40).
    "participants_user_id_fkey": e.Unauthenticated,
    "teams_leader_id_fkey": e.Unauthenticated,
}

RETRYABLE = (asyncpg.exceptions.DeadlockDetectedError, asyncpg.exceptions.SerializationError)
BUSY = (
    asyncpg.exceptions.LockNotAvailableError,
    asyncpg.exceptions.QueryCanceledError,
    asyncpg.exceptions.TooManyConnectionsError,
    asyncio.TimeoutError,
    # Killed backend (57P01), restart (57P03), lost or half-open socket: retrying the same key is safe.
    asyncpg.exceptions.OperatorInterventionError,
    asyncpg.exceptions.PostgresConnectionError,
    asyncpg.exceptions.InternalClientError,
    OSError,
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
    """True for timeouts, connection exhaustion and lost connections anywhere in the cause chain."""
    # A connection lost inside a transaction block surfaces as InterfaceError; the real error is its context.
    seen: BaseException | None = exc
    while seen is not None:
        if isinstance(seen, BUSY):
            return True
        seen = seen.__cause__ or seen.__context__
    return False
