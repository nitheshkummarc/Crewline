"""Prometheus metrics: request durations per route plus pool, transaction, cache and SSE gauges read at scrape."""

from prometheus_client import CollectorRegistry, Gauge, Histogram, generate_latest
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


def observe_request(method: str, route: str, status: int, seconds: float) -> None:
    """Record one request duration (status grouped as 2xx, 4xx, 5xx)."""
    REQUEST_DURATION.labels(method, route, f"{status // 100}xx").observe(seconds)


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
