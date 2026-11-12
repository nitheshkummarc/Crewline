"""Prometheus metrics: request durations per route plus pool, transaction, cache and SSE gauges read at scrape."""

import math
from collections import defaultdict, deque

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, generate_latest
from prometheus_client.exposition import CONTENT_TYPE_LATEST

registry = CollectorRegistry()

REQUEST_DURATION = Histogram(
    "crewline_request_duration_seconds", "HTTP request duration by route and status class",
    ["method", "route", "status"], registry=registry,
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1.0, 2.5))
POOL_SIZE = Gauge("crewline_pool_size", "Open connections per pool", ["pool"], registry=registry)
POOL_IDLE = Gauge("crewline_pool_idle", "Idle connections per pool", ["pool"], registry=registry)
TX_EVENTS = Gauge("crewline_tx_events", "Write transaction counters (deadlock and state retries, busy)", ["kind"],
                  registry=registry)
CACHE = Gauge("crewline_board_cache", "Board cache hits and misses", ["result"], registry=registry)
SSE_CONNECTIONS = Gauge("crewline_sse_connections", "Open SSE streams in this worker", registry=registry)
SSE_DROPPED = Gauge("crewline_sse_dropped", "SSE streams closed because the client was too slow", registry=registry)
LISTENER_RECONNECTS = Gauge("crewline_listener_reconnects", "LISTEN connection reconnects", registry=registry)
CLIENT_IP_SOURCE = Counter("crewline_client_ip_source", "Where the rate-limit client IP came from (header or peer)",
                           ["source"], registry=registry)


RECENT_LIMIT = 1000
# Last durations per route for exact percentiles in the Race lab (the histogram buckets are too coarse).
_recent: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=RECENT_LIMIT))


def observe_request(method: str, route: str, status: int, seconds: float) -> None:
    """Record one request duration (status grouped as 2xx, 4xx, 5xx) and keep it for percentiles."""
    REQUEST_DURATION.labels(method, route, f"{status // 100}xx").observe(seconds)
    if route.startswith("/api/") and route not in ("/api/events",):
        _recent[f"{method} {route}"].append(seconds * 1000)


def percentile(sorted_ms: list[float], fraction: float) -> float:
    """Return the nearest-rank percentile of sorted values."""
    if not sorted_ms:
        return 0.0
    rank = max(1, math.ceil(fraction * len(sorted_ms)))
    return sorted_ms[rank - 1]


def latency_summary() -> list[dict]:
    """Return count, p50, p95, p99 and max in ms per route over its last requests, busiest route first."""
    rows = []
    for route, values in _recent.items():
        ordered = sorted(values)
        rows.append({"route": route, "count": len(ordered), "p50_ms": round(percentile(ordered, 0.50), 2),
                     "p95_ms": round(percentile(ordered, 0.95), 2), "p99_ms": round(percentile(ordered, 0.99), 2),
                     "max_ms": round(ordered[-1], 2) if ordered else 0.0})
    return sorted(rows, key=lambda row: -row["count"])


def collect(pools: object | None, tx_stats: dict, cache: object, hub: object, listener: object | None) -> None:
    """Update the gauges from live objects right before a scrape."""
    if pools is not None:
        for name in ("read", "write"):
            pool = getattr(pools, name)
            POOL_SIZE.labels(name).set(pool.get_size())
            POOL_IDLE.labels(name).set(pool.get_idle_size())
    for kind, value in tx_stats.items():
        TX_EVENTS.labels(kind).set(value)
    CACHE.labels("hit").set(getattr(cache, "hits", 0))
    CACHE.labels("miss").set(getattr(cache, "misses", 0))
    SSE_CONNECTIONS.set(getattr(hub, "connections", 0))
    SSE_DROPPED.set(getattr(hub, "dropped", 0))
    LISTENER_RECONNECTS.set(getattr(listener, "reconnects", 0))


def render() -> tuple[bytes, str]:
    """Return the Prometheus text exposition and its content type."""
    return generate_latest(registry), CONTENT_TYPE_LATEST
