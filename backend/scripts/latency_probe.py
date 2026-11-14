"""Latency probe: time every endpoint (uncontended) and the board under 100 concurrent users.

Usage: python backend/scripts/latency_probe.py --base http://127.0.0.1:8000 --tokens loadtest/tokens.json
       [--server-log path]   adds server-side p50/p95/p99 per route from the JSON access log (LOG_LEVEL=INFO)
Needs a seeded database (database/seed.py --tokens ...). Client numbers include Python client overhead;
server-side numbers are the ones to compare with targets. k6 (loadtest/) is the official load test.

Contents:
    percentiles: Format n, p50, p95, p99 and max of a list of milliseconds.
    Probe: Clients for seeded users and a per-route latency record.
    Probe.client: Return a client authenticated with a seeded user's token.
    Probe.call: Send one request and record its client-side latency under a label.
    Probe.every_endpoint: Exercise each endpoint sequentially with fresh users (no contention).
    Probe.board_load: users concurrent clients loop on the teams board (70% first page, 30% follow a cursor) for
        seconds.
    server_side: Read per-route server durations (ms) from the JSON access log written after `since` (epoch
        seconds).
    run: Run both phases, print the report, and return the raw phase 2 latencies.
    main: CLI entry point.
"""

import argparse
import asyncio
import json
import random
import ssl
import statistics
import time
import uuid
from collections import defaultdict
from pathlib import Path

import httpx

TLS = ssl.create_default_context()


def percentiles(values: list[float]) -> str:
    """Format n, p50, p95, p99 and max of a list of milliseconds."""
    if not values:
        return "n=0"
    ordered = sorted(values)

    def pick(q: float) -> float:
        return ordered[min(len(ordered) - 1, int(round(q * (len(ordered) - 1))))]

    return (f"n={len(ordered):5d}  p50={pick(0.5):7.1f}  p95={pick(0.95):7.1f}  p99={pick(0.99):7.1f}  "
            f"max={ordered[-1]:7.1f} ms")


class Probe:
    """Clients for seeded users and a per-route latency record."""

    def __init__(self, base: str, data: dict) -> None:
        self.base = base
        self.hid = data["hackathon_id"]
        self.tokens = data["tokens"]
        self.codes = data["codes"]
        self.client_ms: dict[str, list[float]] = defaultdict(list)
        self.offset = 0
        self.rounds_used = 0

    def client(self, token: str) -> httpx.AsyncClient:
        """Return a client authenticated with a seeded user's token."""
        return httpx.AsyncClient(base_url=self.base, verify=TLS, timeout=30, cookies={"crewline_session": token})

    async def call(self, client: httpx.AsyncClient, label: str, method: str, path: str, body: object = None,
                   mutate: bool = False) -> httpx.Response:
        """Send one request and record its client-side latency under a label."""
        headers = {"Idempotency-Key": uuid.uuid4().hex} if mutate else None
        started = time.perf_counter()
        response = await client.request(method, path, json=body, headers=headers)
        self.client_ms[label].append((time.perf_counter() - started) * 1000)
        return response

    async def every_endpoint(self, rounds: int) -> None:
        """Exercise each endpoint sequentially with fresh users (no contention)."""
        h = self.hid
        for i in range(rounds):
            start = self.offset + 3 * i
            leader_token, joiner_token, asker_token = self.tokens[start:start + 3]
            async with self.client(leader_token) as leader, self.client(joiner_token) as joiner, \
                    self.client(asker_token) as asker:
                await leader.get("/healthz")
                await self.call(leader, "GET /api/auth/me", "GET", "/api/auth/me")
                await self.call(leader, "GET /api/hackathons/{hid}/me", "GET", f"/api/hackathons/{h}/me")
                await self.call(leader, "GET board/teams", "GET", f"/api/hackathons/{h}/board/teams")
                await self.call(leader, "GET board/people", "GET", f"/api/hackathons/{h}/board/people")
                await self.call(leader, "GET suggestions", "GET", f"/api/hackathons/{h}/suggestions")
                created = await self.call(leader, "POST create team", "POST", f"/api/hackathons/{h}/teams",
                                          {"name": f"Probe {i}"}, mutate=True)
                if created.status_code != 201:
                    raise SystemExit(f"create team returned {created.status_code}: these seeded users were used by an "
                                     "earlier run; pass a higher --offset or reseed")
                tid = created.json()["id"]
                invite = await self.call(leader, "GET team invite", "GET", f"/api/teams/{tid}/invite")
                await self.call(leader, "GET team", "GET", f"/api/teams/{tid}")
                await self.call(joiner, "POST join by code", "POST", "/api/teams/join",
                                {"code": invite.json()["code"]}, mutate=True)
                request = await self.call(asker, "POST create request", "POST", f"/api/teams/{tid}/requests", {},
                                          mutate=True)
                await self.call(leader, "GET team requests", "GET", f"/api/teams/{tid}/requests")
                await self.call(leader, "POST accept request", "POST",
                                f"/api/requests/{request.json()['id']}/accept", mutate=True)
                await self.call(leader, "PATCH update team", "PATCH", f"/api/teams/{tid}", {"name": f"Probe {i}b"},
                                mutate=True)
                await self.call(joiner, "POST leave", "POST", f"/api/teams/{tid}/leave", mutate=True)
                await self.call(leader, "GET team audit", "GET", f"/api/teams/{tid}/audit")
                await self.call(asker, "PATCH profile", "PATCH", "/api/users/me", {"skills": ["backend", "ml"]},
                                mutate=True)

    async def board_load(self, users: int, seconds: float) -> tuple[list[float], int, int]:
        """users concurrent clients loop on the teams board (70% first page, 30% follow a cursor) for seconds."""
        latencies: list[float] = []
        errors = 0
        deadline = time.perf_counter() + seconds
        first = self.offset + 3 * self.rounds_used
        clients = [self.client(token) for token in self.tokens[first:first + users]]
        await asyncio.gather(*(c.get("/healthz") for c in clients))

        async def worker(client: httpx.AsyncClient) -> None:
            nonlocal errors
            cursor = None
            while time.perf_counter() < deadline:
                url = f"/api/hackathons/{self.hid}/board/teams"
                if cursor and random.random() < 0.3:
                    url += f"?cursor={cursor}"
                started = time.perf_counter()
                response = await client.get(url)
                latencies.append((time.perf_counter() - started) * 1000)
                if response.status_code != 200:
                    errors += 1
                else:
                    cursor = response.json()["next_cursor"]

        started = time.perf_counter()
        await asyncio.gather(*(worker(c) for c in clients))
        elapsed = time.perf_counter() - started
        await asyncio.gather(*(c.aclose() for c in clients))
        return latencies, errors, int(len(latencies) / elapsed)


def server_side(log_path: Path, since: float) -> dict[str, list[float]]:
    """Read per-route server durations (ms) from the JSON access log written after `since` (epoch seconds)."""
    routes: dict[str, list[float]] = defaultdict(list)
    for line in log_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        try:
            record = json.loads(line)
        except ValueError:
            continue
        if record.get("msg") == "request" and record.get("route") not in ("/healthz", "/metrics"):
            routes[f"{record['method']} {record['route']}"].append(record["duration_ms"])
    return routes


async def run(args: argparse.Namespace, data: dict) -> list[float]:
    """Run both phases, print the report, and return the raw phase 2 latencies."""
    probe = Probe(args.base, data)
    probe.offset = args.offset
    if args.rounds:
        print(f"phase 1: every endpoint, {args.rounds} rounds, sequential")
        await probe.every_endpoint(args.rounds)
        probe.rounds_used = args.rounds
        for label, values in probe.client_ms.items():
            print(f"  client  {label:28} {percentiles(values)}")
    print(f"phase 2: teams board, {args.users} concurrent users, {args.seconds:.0f} s, no think time")
    cpu_before = time.process_time()
    latencies, errors, rps = await probe.board_load(args.users, args.seconds)
    print(f"  client  board under load             {percentiles(latencies)}  errors={errors}  {rps} req/s")
    print(f"  client process CPU during phase 2: {time.process_time() - cpu_before:.1f} s")
    if args.server_log:
        print("server-side (from access log, all phases):")
        routes = await asyncio.to_thread(server_side, Path(args.server_log), 0)
        for route, values in sorted(routes.items()):
            print(f"  server  {route:52} {percentiles(values)}")
    print(f"mean client latency phase 2: {statistics.mean(latencies):.1f} ms")
    return latencies


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    parser.add_argument("--tokens", default="loadtest/tokens.json")
    parser.add_argument("--rounds", type=int, default=40)
    parser.add_argument("--users", type=int, default=100)
    parser.add_argument("--seconds", type=float, default=30)
    parser.add_argument("--server-log", default=None)
    parser.add_argument("--offset", type=int, default=0, help="use tokens starting at this index (parallel runs)")
    parser.add_argument("--dump", default=None, help="write raw phase 2 latencies (ms) to this JSON file")
    args = parser.parse_args()
    data = json.loads(Path(args.tokens).read_text(encoding="utf-8"))
    latencies = asyncio.run(run(args, data))
    if args.dump:
        Path(args.dump).write_text(json.dumps(latencies), encoding="utf-8")


if __name__ == "__main__":
    main()
