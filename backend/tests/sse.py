"""Test helper: read a server-sent event stream in the background and wait for events by kind."""

import asyncio
import contextlib
import json
from typing import Any

import httpx


class SseReader:
    """Collect (event, data) pairs from one SSE stream; use `async with`."""

    def __init__(self, client: httpx.AsyncClient, url: str) -> None:
        self.client = client
        self.url = url
        self.events: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        self.status: int | None = None
        self._cm: Any = None
        self._task: asyncio.Task | None = None

    async def __aenter__(self) -> "SseReader":
        """Open the stream; the server has subscribed once the response headers arrive."""
        self._cm = self.client.stream("GET", self.url, timeout=httpx.Timeout(10, read=None))
        response = await self._cm.__aenter__()
        self.status = response.status_code
        if self.status == 200:
            self._task = asyncio.create_task(self._pump(response))
        return self

    async def __aexit__(self, *exc: object) -> None:
        """Stop reading and close the stream."""
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError, httpx.HTTPError):
                await self._task
        with contextlib.suppress(httpx.HTTPError, RuntimeError):
            await self._cm.__aexit__(None, None, None)

    async def _pump(self, response: httpx.Response) -> None:
        """Parse event/data lines into the queue; comment lines (heartbeats) are ignored."""
        kind, data = None, []
        async for line in response.aiter_lines():
            if line.startswith(":"):
                continue
            if line.startswith("event:"):
                kind = line[6:].strip()
            elif line.startswith("data:"):
                data.append(line[5:].strip())
            elif line == "" and kind is not None:
                await self.events.put((kind, json.loads("\n".join(data)) if data else None))
                kind, data = None, []

    async def next(self, kind: str, within: float = 3.0) -> Any:
        """Return the data of the next event of this kind, skipping others; raise TimeoutError if none arrives."""
        async def wait() -> Any:
            while True:
                got_kind, data = await self.events.get()
                if got_kind == kind:
                    return data
        return await asyncio.wait_for(wait(), within)

    async def nothing(self, kind: str, seconds: float) -> bool:
        """True if no event of this kind arrives within the given time."""
        try:
            await self.next(kind, seconds)
            return False
        except TimeoutError:
            return True
