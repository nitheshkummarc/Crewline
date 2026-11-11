"""In-process sliding-window rate limiter (per worker; abuse protection, not correctness)."""

import time
from collections import defaultdict, deque
from dataclasses import dataclass

from app.config import Settings


class SlidingWindowLimiter:
    """Count events per key within a time window."""

    def __init__(self, limit: int, window_s: float) -> None:
        self.limit = limit
        self.window_s = window_s
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def _trim(self, key: str, now: float) -> deque[float]:
        """Drop events older than the window and return the remaining ones."""
        events = self._events[key]
        while events and events[0] <= now - self.window_s:
            events.popleft()
        return events

    def check(self, key: str) -> int:
        """Return seconds to wait without recording, 0 if under the limit."""
        now = time.monotonic()
        events = self._trim(key, now)
        if len(events) < self.limit:
            return 0
        return max(1, int(events[0] + self.window_s - now) + 1)

    def hit(self, key: str) -> int:
        """Record an event; return seconds to wait if over the limit, else 0."""
        wait = self.check(key)
        if wait == 0:
            self._events[key].append(time.monotonic())
        return wait


@dataclass
class Limiters:
    """Configured limiter instances."""

    code_user: SlidingWindowLimiter
    code_ip: SlidingWindowLimiter
    login: SlidingWindowLimiter
    signup: SlidingWindowLimiter
    mutations: SlidingWindowLimiter
    lab_user: SlidingWindowLimiter
    lab_global: SlidingWindowLimiter


limiters: Limiters | None = None


def configure(settings: Settings) -> Limiters:
    """Create the limiters from settings."""
    global limiters
    limiters = Limiters(
        code_user=SlidingWindowLimiter(settings.rate_code_per_user_min, 60),
        code_ip=SlidingWindowLimiter(settings.rate_code_per_ip_min, 60),
        login=SlidingWindowLimiter(settings.rate_login_per_min, 60),
        signup=SlidingWindowLimiter(settings.rate_signup_per_hour, 3600),
        mutations=SlidingWindowLimiter(settings.rate_mutations_per_min, 60),
        lab_user=SlidingWindowLimiter(settings.rate_lab_per_min, 60),
        lab_global=SlidingWindowLimiter(settings.rate_lab_global_per_hour, 3600),
    )
    return limiters


def get() -> Limiters:
    """Return the configured limiters."""
    if limiters is None:
        raise RuntimeError("rate limiters are not configured")
    return limiters
