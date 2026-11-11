"""Micro-cache with single-flight loading for board pages (per worker; never a source of truth)."""

import asyncio
import hashlib
import time
from collections.abc import Awaitable, Callable

CacheKey = tuple[str, str, str, int]  # (kind, hackathon_id, cursor, limit)
Entry = tuple[str, bytes]  # (etag, body)


class MicroCache:
    """Hold (etag, bytes) per key for a short TTL; concurrent misses for one key share one load."""

    def __init__(self, ttl_ms: int) -> None:
        self.ttl = ttl_ms / 1000
        self._entries: dict[CacheKey, tuple[float, Entry]] = {}
        self._inflight: dict[CacheKey, asyncio.Future[Entry]] = {}
        self.hits = 0
        self.misses = 0

    async def get_or_load(self, key: CacheKey, loader: Callable[[], Awaitable[bytes]]) -> Entry:
        """Return a cached entry or run one loader for all concurrent callers of the same key."""
        cached = self._entries.get(key)
        if cached is not None and cached[0] > time.monotonic():
            self.hits += 1
            return cached[1]
        pending = self._inflight.get(key)
        if pending is not None:
            self.hits += 1
            return await asyncio.shield(pending)
        self.misses += 1
        future: asyncio.Future[Entry] = asyncio.get_running_loop().create_future()
        self._inflight[key] = future
        try:
            body = await loader()
            entry = (f'"{hashlib.sha1(body).hexdigest()}"', body)
            self._entries[key] = (time.monotonic() + self.ttl, entry)
            future.set_result(entry)
            return entry
        except BaseException as exc:
            future.set_exception(exc)
            future.exception()  # mark retrieved so an unawaited failure is not logged
            raise
        finally:
            self._inflight.pop(key, None)

    def invalidate_hackathon(self, hackathon_id: str) -> None:
        """Drop every entry for one hackathon."""
        for key in [k for k in self._entries if k[1] == hackathon_id]:
            self._entries.pop(key, None)


board_cache = MicroCache(1000)


def configure(ttl_ms: int) -> MicroCache:
    """Replace the board cache with one using the configured TTL."""
    global board_cache
    board_cache = MicroCache(ttl_ms)
    return board_cache
