"""Race lab experiments: real concurrent writes through run_write in the hidden lab hackathon, and their results.

Contents:
    context: Build the WriteContext a real request would carry (fresh idempotency key unless one is given).
    since: Milliseconds since t0, rounded to 0.01.
    call: Run one write like the web client: retry 503 busy with the same key; report status, code and timing.
    guarded: Check the lab is on, the size cap and the rate limits; run one experiment at a time per worker.
    lab_hackathon: Return the hidden lab hackathon id.
    new_people: Create synthetic registered participants for an experiment.
    make_team: Create a team through the real services: a leader, then members join by code until `filled` seats are
        taken.
    facts: Read the team's committed state after an experiment.
    join_call: Return a call that joins by code as one person (same key on every call when `key` is given).
    request_call: Return a call that sends one join request to a team.
    accept_call: Return a call in which the leader accepts one request.
    fire_together: Start every call at the same moment (all tasks wait on one event) and return results in call
        order.
    run_race: A team with 3 of 4 seats taken; `attempts` people join by code at the same instant. Exactly one may
        win.
    run_spam: One person clicks join `clicks` times at once: first with one key (a double click), then a new key per
        click.
    run_queue: `requests` people ask to join a 3 of 4 team at once; the leader accepts the first two in queue order.
"""

import asyncio
import random
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from app.config import get_settings
from app.core import ratelimit
from app.core.errors import Busy, DomainError, NotFound, RateLimited, ValidationFailed
from app.core.idempotency import request_hash
from app.db.pools import read_conn, write_conn
from app.db.tx import Outcome, WriteContext
from app.modules.lab import repo
from app.modules.requests import service as requests_service
from app.modules.teams import service as teams_service

LAB_IP = "lab"
MAX_BUSY_RETRIES = 8
_running = asyncio.Lock()


def context(user_id: UUID, route: str, body: Any, key: str | None = None) -> WriteContext:
    """Build the WriteContext a real request would carry (fresh idempotency key unless one is given)."""
    return WriteContext(user_id=user_id, key=key or uuid.uuid4().hex, route=route,
                        request_hash=request_hash("POST", route, {}, body), request_id=f"lab-{route}",
                        limited=False)


def since(t0: float) -> float:
    """Milliseconds since t0, rounded to 0.01."""
    return round((time.perf_counter() - t0) * 1000, 2)


async def call(run: Callable[[], Awaitable[Outcome]], t0: float) -> dict:
    """Run one write like the web client: retry 503 busy with the same key; report status, code and timing."""
    started, retries = since(t0), 0
    while True:
        try:
            outcome = await run()
            result = {"status": outcome.status, "code": None, "replayed": not outcome.store, "body": outcome.body}
            break
        except Busy:
            if retries >= MAX_BUSY_RETRIES:
                result = {"status": 503, "code": "busy", "replayed": False, "body": None}
                break
            retries += 1
            await asyncio.sleep(random.uniform(0.02, 0.08))
        except DomainError as exc:
            result = {"status": exc.status, "code": exc.code, "replayed": False, "body": None}
            break
    return {**result, "started_ms": started, "finished_ms": since(t0), "retries": retries}


async def guarded(user_id: UUID, size: int, experiment: Callable[[], Awaitable[dict]]) -> dict:
    """Check the lab is on, the size cap and the rate limits; run one experiment at a time per worker."""
    settings = get_settings()
    if not settings.lab_enabled:
        raise NotFound()
    if size > settings.lab_max_attempts:
        raise ValidationFailed(f"at most {settings.lab_max_attempts} per experiment")
    limits = ratelimit.get()
    wait = limits.lab_user.hit(str(user_id)) or limits.lab_global.hit("all")
    if wait:
        raise RateLimited(retry_after=wait)
    if _running.locked():
        raise Busy("another lab experiment is running", retry_after=2)
    async with _running:
        return await experiment()


async def lab_hackathon() -> UUID:
    """Return the hidden lab hackathon id."""
    async with write_conn() as conn:
        return await repo.ensure_lab_hackathon(conn)


async def new_people(hackathon_id: UUID, count: int, label: str) -> list[dict]:
    """Create synthetic registered participants for an experiment."""
    async with write_conn() as conn:
        rows = await repo.create_participants(conn, hackathon_id, count, label)
    return [{"id": row["id"], "name": row["display_name"]} for row in rows]


async def make_team(hackathon_id: UUID, filled: int) -> dict:
    """Create a team through the real services: a leader, then members join by code until `filled` seats are taken."""
    people = await new_people(hackathon_id, filled, "Member")
    leader = people[0]
    name = f"Lab {random.randint(1000, 9999)}"
    created = await teams_service.create_team(context(leader["id"], "create_team", {"name": name}), hackathon_id, name)
    team_id = UUID(created.body["id"])
    code = (await teams_service.get_invite(team_id, leader["id"]))["code"]
    for member in people[1:]:
        await teams_service.join_by_code(context(member["id"], "join_by_code", {"code": code}), code, LAB_IP)
    return {"id": team_id, "name": name, "code": code, "leader": leader, "members": people}


async def facts(team_id: UUID) -> dict:
    """Read the team's committed state after an experiment."""
    async with read_conn() as conn:
        row = await repo.team_facts(conn, team_id)
    if row is None:
        return {"member_count": 0, "max_size": 0, "memberships": 0, "join_events": 0}
    return {"member_count": row["member_count"], "max_size": row["max_size"],
            "memberships": row["memberships"], "join_events": row["join_events"]}


Call = Callable[[], Awaitable[dict]]


def join_call(user_id: UUID, code: str, t0: float, key: str | None = None) -> Call:
    """Return a call that joins by code as one person (same key on every call when `key` is given)."""
    async def run() -> dict:
        return await call(lambda: teams_service.join_by_code(
            context(user_id, "join_by_code", {"code": code}, key), code, LAB_IP), t0)
    return run


def request_call(user_id: UUID, team_id: UUID, t0: float) -> Call:
    """Return a call that sends one join request to a team."""
    async def run() -> dict:
        return await call(lambda: requests_service.create_request(
            context(user_id, "create_request", {"message": None}), team_id, None), t0)
    return run


def accept_call(leader_id: UUID, request_id: UUID, t0: float) -> Call:
    """Return a call in which the leader accepts one request."""
    async def run() -> dict:
        return await call(lambda: requests_service.accept(
            context(leader_id, "accept_request", {"id": str(request_id)}), request_id), t0)
    return run


async def fire_together(calls: list[Callable[[], Awaitable[dict]]]) -> list[dict]:
    """Start every call at the same moment (all tasks wait on one event) and return results in call order."""
    gate = asyncio.Event()

    async def run(call_fn: Callable[[], Awaitable[dict]]) -> dict:
        await gate.wait()
        return await call_fn()

    tasks = [asyncio.create_task(run(call_fn)) for call_fn in calls]
    await asyncio.sleep(0)
    gate.set()
    return list(await asyncio.gather(*tasks))


async def run_race(attempts: int) -> dict:
    """A team with 3 of 4 seats taken; `attempts` people join by code at the same instant. Exactly one may win."""
    hid = await lab_hackathon()
    team = await make_team(hid, 3)
    racers = await new_people(hid, attempts, "Racer")
    t0 = time.perf_counter()
    results = await fire_together([join_call(racer["id"], team["code"], t0) for racer in racers])
    elapsed = since(t0)
    rows = [{"racer": racer["name"], **{k: v for k, v in result.items() if k != "body"}}
            for racer, result in zip(racers, results, strict=True)]
    final = await facts(team["id"])
    return {
        "hackathon_id": hid, "team": {"id": team["id"], "name": team["name"], "taken_before": 3, "max_size": 4},
        "attempts": rows, "elapsed_ms": elapsed, "facts": final,
        "summary": {
            "winners": sum(1 for r in rows if r["status"] == 200),
            "team_full": sum(1 for r in rows if r["code"] == "team_full"),
            "other": sum(1 for r in rows if r["status"] != 200 and r["code"] != "team_full"),
            "busy_retries": sum(r["retries"] for r in rows),
        },
    }


async def run_spam(clicks: int) -> dict:
    """One person clicks join `clicks` times at once: first with one key (a double click), then a new key per click."""
    hid = await lab_hackathon()
    team = await make_team(hid, 1)
    same_key_user, new_key_user = await new_people(hid, 2, "Clicker")
    key = uuid.uuid4().hex
    t0 = time.perf_counter()
    same = await fire_together([join_call(same_key_user["id"], team["code"], t0, key) for _ in range(clicks)])
    t1 = time.perf_counter()
    fresh = await fire_together([join_call(new_key_user["id"], team["code"], t1) for _ in range(clicks)])
    async with read_conn() as conn:
        same_facts = dict(await repo.user_facts(conn, hid, team["id"], same_key_user["id"]))
        fresh_facts = dict(await repo.user_facts(conn, hid, team["id"], new_key_user["id"]))
    first_body = next((r["body"] for r in same if r["status"] == 200), None)

    def rows(results: list[dict]) -> list[dict]:
        return [{"click": i + 1, "status": r["status"], "code": r["code"], "replayed": r["replayed"],
                 "same_body": r["body"] == first_body, "started_ms": r["started_ms"], "finished_ms": r["finished_ms"],
                 "retries": r["retries"]} for i, r in enumerate(results)]

    return {
        "hackathon_id": hid, "team": {"id": team["id"], "name": team["name"]},
        "same_key": {"user": same_key_user["name"], "clicks": rows(same), "facts": same_facts},
        "new_keys": {"user": new_key_user["name"], "clicks": rows(fresh), "facts": fresh_facts},
        "facts": await facts(team["id"]),
    }


async def run_queue(requests: int) -> dict:
    """`requests` people ask to join a 3 of 4 team at once; the leader accepts the first two in queue order."""
    hid = await lab_hackathon()
    team = await make_team(hid, 3)
    askers = await new_people(hid, requests, "Asker")
    t0 = time.perf_counter()
    created = await fire_together([request_call(asker["id"], team["id"], t0) for asker in askers])
    queue = await requests_service.list_for_team(team["id"], team["leader"]["id"])
    decisions = []
    for request in queue[:2]:
        result = await accept_call(team["leader"]["id"], request["id"], time.perf_counter())()
        decisions.append({"request_id": request["id"], "status": result["status"], "code": result["code"]})
    first_at = queue[0]["created_at"] if queue else None
    return {
        "hackathon_id": hid, "team": {"id": team["id"], "name": team["name"], "taken_before": 3, "max_size": 4},
        "created": {"ok": sum(1 for r in created if r["status"] in (200, 201)),
                    "failed": sum(1 for r in created if r["status"] not in (200, 201)),
                    "busy_retries": sum(r["retries"] for r in created)},
        "queue": [{"position": i + 1, "name": r["display_name"], "request_id": r["id"],
                   "after_first_ms": round((r["created_at"] - first_at).total_seconds() * 1000, 2) if first_at else 0}
                  for i, r in enumerate(queue)],
        "decisions": decisions, "facts": await facts(team["id"]),
    }
