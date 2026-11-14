"""SSE hub: subscriptions per hackathon, public projection of audit notifications, fan-out.

Contents:
    public_projection: Return (kind, data, audience) for a notification; data never holds codes or emails; None if
        unknown.
    Subscriber: One SSE stream: the hackathon it watches, its user and its bounded queue.
    EventHub: Map hackathon id to subscriber queues and fan events out to them.
    EventHub.connections: Number of open streams in this worker.
    EventHub.subscribe: Register a queue; raise RateLimited past the per-user stream cap.
    EventHub.unsubscribe: Remove a subscriber (idempotent).
    EventHub._offer: Queue an event; a full queue means a slow client, which is closed so it reconnects and
        refetches.
    EventHub.publish: Project a notification and push it to the hackathon's subscribers, or only to its audience.
    EventHub.broadcast_resync: Send a resync event to every subscriber.
    configure: Replace the hub with one using the configured stream cap.
"""

import asyncio
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any

from app.core.errors import RateLimited

TEAM_ACTIONS = frozenset({
    "team_created", "team_updated", "member_joined_via_code", "request_accepted", "member_left",
    "member_removed", "leader_promoted", "team_finalized", "team_reopened", "team_deleted",
    "invite_regenerated", "member_profile_updated",
})
PEOPLE_ACTIONS = frozenset({"participant_registered", "participant_updated"})
REQUEST_ACTIONS = frozenset({"request_created", "request_declined", "request_withdrawn", "request_stale"})
QUEUE_SIZE = 100
CLOSE = ("_close", None)

Event = tuple[str, Any]


def public_projection(raw: dict) -> tuple[str, dict, frozenset[str] | None] | None:
    """Return (kind, data, audience) for a notification; data never holds codes or emails; None if unknown."""
    action, payload = raw["action"], raw.get("payload") or {}
    if action in TEAM_ACTIONS:
        team = payload.get("team")
        version = team["version"] if team else payload.get("version")
        return "team", {"seq": raw["seq"], "action": action, "team_id": raw["team_id"], "version": version,
                        "team": team}, None
    if action in PEOPLE_ACTIONS:
        return "people", {"seq": raw["seq"], "action": action}, None
    if action in REQUEST_ACTIONS:
        return "request", {"seq": raw["seq"], "action": action, "team_id": raw["team_id"],
                           "request_id": payload.get("request_id")}, frozenset(payload.get("audience") or [])
    return None


@dataclass(eq=False)
class Subscriber:
    """One SSE stream: the hackathon it watches, its user and its bounded queue."""

    hackathon_id: str
    user_id: str
    queue: asyncio.Queue[Event] = field(default_factory=lambda: asyncio.Queue(QUEUE_SIZE))


class EventHub:
    """Map hackathon id to subscriber queues and fan events out to them."""

    def __init__(self, max_streams_per_user: int = 3) -> None:
        self.max_streams_per_user = max_streams_per_user
        self._subs: dict[str, set[Subscriber]] = defaultdict(set)
        self._per_user: Counter[str] = Counter()
        self.dropped = 0

    @property
    def connections(self) -> int:
        """Number of open streams in this worker."""
        return sum(len(s) for s in self._subs.values())

    def subscribe(self, hackathon_id: str, user_id: str) -> Subscriber:
        """Register a queue; raise RateLimited past the per-user stream cap."""
        if self._per_user[user_id] >= self.max_streams_per_user:
            raise RateLimited("Too many open event streams", retry_after=5)
        sub = Subscriber(hackathon_id, user_id)
        self._subs[hackathon_id].add(sub)
        self._per_user[user_id] += 1
        return sub

    def unsubscribe(self, sub: Subscriber) -> None:
        """Remove a subscriber (idempotent)."""
        subs = self._subs.get(sub.hackathon_id)
        if subs is not None and sub in subs:
            subs.discard(sub)
            self._per_user[sub.user_id] -= 1
            if not subs:
                self._subs.pop(sub.hackathon_id, None)

    def _offer(self, sub: Subscriber, event: Event) -> None:
        """Queue an event; a full queue means a slow client, which is closed so it reconnects and refetches."""
        try:
            sub.queue.put_nowait(event)
        except asyncio.QueueFull:
            self.dropped += 1
            self.unsubscribe(sub)
            while not sub.queue.empty():
                sub.queue.get_nowait()
            sub.queue.put_nowait(CLOSE)

    def publish(self, raw: dict) -> None:
        """Project a notification and push it to the hackathon's subscribers, or only to its audience."""
        projected = public_projection(raw)
        if projected is None:
            return
        kind, data, audience = projected
        for sub in list(self._subs.get(str(raw["hackathon_id"]), ())):
            if audience is None or sub.user_id in audience:
                self._offer(sub, (kind, data))

    def broadcast_resync(self) -> None:
        """Send a resync event to every subscriber."""
        for subs in list(self._subs.values()):
            for sub in list(subs):
                self._offer(sub, ("resync", {}))


hub = EventHub()


def configure(max_streams_per_user: int) -> EventHub:
    """Replace the hub with one using the configured stream cap."""
    global hub
    hub = EventHub(max_streams_per_user)
    return hub
