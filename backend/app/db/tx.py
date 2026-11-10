"""Write-transaction wrapper: idempotency claim, timeouts, retries, rollback on any error."""

import asyncio
import logging
import random
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import asyncpg
import orjson

from app.core import idempotency
from app.core.errors import Busy, IdempotencyKeyMismatch
from app.db.errors import is_busy, is_retryable, to_domain_error
from app.db.pools import read_conn, write_conn

log = logging.getLogger("crewline.tx")

MAX_ATTEMPTS = 3


@dataclass(frozen=True)
class WriteContext:
    """User id, idempotency key, request hash, request id and route name for one write."""

    user_id: UUID
    key: str
    request_hash: str
    request_id: str | None
    route: str


@dataclass
class Outcome:
    """Status and JSON body of a write; store=False means nothing changed and nothing is stored."""

    status: int
    body: Any
    store: bool = True


class GuardFailed(Exception):
    """A guarded statement matched 0 rows; the transaction rolls back and the explanation runs."""

    def __init__(self, info: Any = None) -> None:
        super().__init__("guard failed")
        self.info = info


class StateChanged(Exception):
    """The explanation found no reason for a failed guard; run_write retries the transaction."""


class _Rollback(Exception):
    """Carries an outcome out of a transaction that must not commit."""

    def __init__(self, outcome: Outcome) -> None:
        super().__init__("rollback")
        self.outcome = outcome


Body = Callable[[asyncpg.Connection], Awaitable[Outcome]]
Explain = Callable[[BaseException], Awaitable[Outcome]]

_inflight = 0
_inflight_max = 30
stats = {"deadlock_retries": 0, "state_retries": 0, "busy": 0}


def configure(inflight_max: int) -> None:
    """Set the per-worker in-flight write cap."""
    global _inflight_max
    _inflight_max = inflight_max


def _json(body: Any) -> Any:
    """Normalize a body to plain JSON types so first responses and replays are identical."""
    return orjson.loads(orjson.dumps(body, default=str))


def _replay(row: asyncpg.Record | None, ctx: WriteContext) -> Outcome:
    """Return the stored response for a key, or raise 422 if the request hash differs."""
    if row is None or row["response_status"] is None:
        raise StateChanged()
    if row["request_hash"] != ctx.request_hash:
        raise IdempotencyKeyMismatch()
    return Outcome(row["response_status"], orjson.loads(row["response_body"]), store=False)


async def replay_fast_path(ctx: WriteContext) -> Outcome | None:
    """Return a committed stored response for the key, or None; never decides business outcomes."""
    async with read_conn() as conn:
        row = await idempotency.lookup(conn, ctx.user_id, ctx.key)
    if row is None or row["response_status"] is None:
        return None
    return _replay(row, ctx)


async def _attempt(ctx: WriteContext, body: Body) -> Outcome:
    """Run one transaction: claim the key, run the body, store the response, commit."""
    async with write_conn() as conn:
        async with conn.transaction():
            if not await idempotency.claim(conn, ctx.user_id, ctx.key, ctx.request_hash):
                row = await idempotency.lookup(conn, ctx.user_id, ctx.key)
                raise _Rollback(_replay(row, ctx))
            outcome = await body(conn)
            outcome.body = _json(outcome.body)
            if not outcome.store:
                raise _Rollback(outcome)
            await idempotency.store(conn, ctx.user_id, ctx.key, outcome.status, outcome.body)
    return outcome


async def run_write(ctx: WriteContext, body: Body, explain: Explain | None = None) -> Outcome:
    """Run body in one transaction after claiming the key; store the response; retry deadlocks and StateChanged."""
    global _inflight
    if _inflight >= _inflight_max:
        stats["busy"] += 1
        raise Busy()
    _inflight += 1
    try:
        fast = await replay_fast_path(ctx)
        if fast is not None:
            return fast
        for _ in range(MAX_ATTEMPTS):
            try:
                return await _attempt(ctx, body)
            except _Rollback as rollback:
                return rollback.outcome
            except (GuardFailed, asyncpg.IntegrityConstraintViolationError) as exc:
                if explain is None:
                    mapped = to_domain_error(exc)
                    if mapped is not None:
                        raise mapped from exc
                    raise
                try:
                    outcome = await explain(exc)
                    outcome.body = _json(outcome.body)
                    return outcome
                except StateChanged:
                    stats["state_retries"] += 1
            except StateChanged:
                stats["state_retries"] += 1
            except Exception as exc:
                if is_retryable(exc):
                    stats["deadlock_retries"] += 1
                    log.warning("retrying transaction", extra={"route": ctx.route, "error": type(exc).__name__})
                elif is_busy(exc):
                    stats["busy"] += 1
                    raise Busy() from exc
                else:
                    raise
            await asyncio.sleep(random.uniform(0.01, 0.05))
        stats["busy"] += 1
        raise Busy()
    finally:
        _inflight -= 1


async def run_plain_write(body: Callable[[asyncpg.Connection], Awaitable[Any]]) -> Any:
    """Run a small transaction without an idempotency claim (stale marking)."""
    for _ in range(MAX_ATTEMPTS):
        try:
            async with write_conn() as conn:
                async with conn.transaction():
                    return await body(conn)
        except Exception as exc:
            if is_retryable(exc):
                stats["deadlock_retries"] += 1
                await asyncio.sleep(random.uniform(0.01, 0.05))
                continue
            if is_busy(exc):
                raise Busy() from exc
            raise
    raise Busy()
