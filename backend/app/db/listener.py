"""Dedicated LISTEN connection with reconnect; clears the board cache and feeds the event hub."""

import asyncio
import contextlib
import logging

import asyncpg
import orjson

from app.core import cache, events

log = logging.getLogger("crewline.listener")

CHANNEL = "team_events"
CHECK_EVERY_S = 0.5
KEEPALIVE_EVERY_S = 30.0
KEEPALIVE_TIMEOUT_S = 5.0


class EventListener:
    """Owns the LISTEN connection; a supervisor task reconnects with backoff and announces resync."""

    def __init__(self, url: str) -> None:
        self.url = url
        self._conn: asyncpg.Connection | None = None
        self._task: asyncio.Task | None = None
        self.reconnects = 0

    async def start(self) -> None:
        """Connect, LISTEN, and start the supervisor."""
        await self._connect()
        self._task = asyncio.create_task(self._supervise())

    async def stop(self) -> None:
        """Stop the supervisor and close the connection."""
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        if self._conn is not None and not self._conn.is_closed():
            await self._conn.close()

    async def _connect(self) -> None:
        """Open the connection and LISTEN on the channel."""
        conn = await asyncpg.connect(self.url, server_settings={"application_name": "crewline-listen"})
        await conn.add_listener(CHANNEL, self._on_notify)
        self._conn = conn

    def _on_notify(self, conn: asyncpg.Connection, pid: int, channel: str, payload: str) -> None:
        """Clear the hackathon's board cache, then publish to the hub (cache first, so refetches are fresh)."""
        try:
            raw = orjson.loads(payload)
        except orjson.JSONDecodeError:
            log.error("bad notification payload", extra={"payload": payload[:200]})
            return
        cache.board_cache.invalidate_hackathon(str(raw["hackathon_id"]))
        events.hub.publish(raw)

    async def _supervise(self) -> None:
        """Detect a closed connection, reconnect with backoff (0.5 s doubling to 10 s), then broadcast resync."""
        since_keepalive = 0.0
        while True:
            await asyncio.sleep(CHECK_EVERY_S)
            since_keepalive += CHECK_EVERY_S
            if self._conn is not None and not self._conn.is_closed():
                if since_keepalive >= KEEPALIVE_EVERY_S:
                    since_keepalive = 0.0
                    try:
                        await asyncio.wait_for(self._conn.execute("SELECT 1"), KEEPALIVE_TIMEOUT_S)
                    except Exception:  # noqa: BLE001
                        # No answer means a dead link: drop it so the next check reconnects and resyncs (B-34).
                        self._conn.terminate()
                continue
            delay = 0.5
            while True:
                try:
                    await self._connect()
                    break
                except (OSError, asyncpg.PostgresError) as exc:
                    log.warning("listener reconnect failed", extra={"error": type(exc).__name__, "retry_in": delay})
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, 10.0)
            self.reconnects += 1
            log.error("listener reconnected; sending resync", extra={"reconnects": self.reconnects})
            # Notifications sent while disconnected are lost; clients refetch on resync.
            for key in list(cache.board_cache._entries):
                cache.board_cache.invalidate_hackathon(key[1])
            events.hub.broadcast_resync()
