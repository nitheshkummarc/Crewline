"""Helpers to release many requests at the same instant and retry 503s with the same key.

Contents:
    fire_together: Await all calls behind one asyncio.Event barrier so they start together.
    retry_busy: Repeat a call until it is not 503 (the caller keeps the same idempotency key).
    keyed: Return a call that sends one logical request, retrying 503 with one fixed key.
    warm: Open each user's HTTP connection before a race so connection setup does not serialize it.
    close: Close the clients of users that are no longer needed.
"""

import asyncio
import random
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

import httpx
from helpers import User, key

T = TypeVar("T")


async def fire_together(calls: list[Callable[[], Awaitable[T]]]) -> list[T]:
    """Await all calls behind one asyncio.Event barrier so they start together."""
    gate = asyncio.Event()

    async def run(call: Callable[[], Awaitable[T]]) -> T:
        await gate.wait()
        return await call()

    tasks = [asyncio.create_task(run(call)) for call in calls]
    await asyncio.sleep(0.05)
    gate.set()
    return await asyncio.gather(*tasks)


async def retry_busy(send: Callable[[], Awaitable[httpx.Response]], attempts: int = 60) -> httpx.Response:
    """Repeat a call until it is not 503 (the caller keeps the same idempotency key)."""
    response = await send()
    for _ in range(attempts):
        if response.status_code != 503:
            return response
        await asyncio.sleep(0.05 + random.random() * 0.05)
        response = await send()
    return response


def keyed(user: User, method: str, path: str, body: Any = None, idem: str | None = None
          ) -> Callable[[], Awaitable[httpx.Response]]:
    """Return a call that sends one logical request, retrying 503 with one fixed key."""
    fixed = idem or key()
    return lambda: retry_busy(lambda: user.send(method, path, body, idem=fixed))


async def warm(users: list[User]) -> None:
    """Open each user's HTTP connection before a race so connection setup does not serialize it."""
    await asyncio.gather(*(user.get("/healthz") for user in users))


async def close(users: list[User]) -> None:
    """Close the clients of users that are no longer needed."""
    await asyncio.gather(*(user.client.aclose() for user in users))
