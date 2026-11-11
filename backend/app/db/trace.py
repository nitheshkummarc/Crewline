"""Statement tracing for the Race lab: records each SQL statement a traced call runs, in order, with its time."""

import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass

import asyncpg
from asyncpg.connection import LoggedQuery


@dataclass
class Step:
    """One executed statement: when it ended (ms after the trace started), pool, SQL, duration, error."""

    at_ms: float
    pool: str
    sql: str
    elapsed_ms: float
    error: str | None


@dataclass
class Trace:
    """Statements recorded for one traced call."""

    started: float
    steps: list[Step]


_current: ContextVar[Trace | None] = ContextVar("crewline_trace", default=None)


@contextmanager
def tracing() -> Iterator[Trace]:
    """Record every statement run by connections acquired inside this block (same asyncio task only)."""
    trace = Trace(started=time.perf_counter(), steps=[])
    token = _current.set(trace)
    try:
        yield trace
    finally:
        _current.reset(token)


def attach(conn: asyncpg.Connection, pool: str) -> Callable[[LoggedQuery], None] | None:
    """Add a query logger to a connection when a trace is active; return it so it can be removed."""
    trace = _current.get()
    if trace is None:
        return None

    def log(query: LoggedQuery) -> None:
        trace.steps.append(Step(
            at_ms=round((time.perf_counter() - trace.started) * 1000, 3), pool=pool,
            sql=" ".join(query.query.split()), elapsed_ms=round(query.elapsed * 1000, 3),
            error=type(query.exception).__name__ if query.exception else None))

    conn.add_query_logger(log)
    return log


def detach(conn: asyncpg.Connection, logger: Callable[[LoggedQuery], None] | None) -> None:
    """Remove a query logger added by attach."""
    if logger is not None:
        conn.remove_query_logger(logger)
