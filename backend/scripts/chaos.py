"""Chaos test (T-CHAOS-01): hard-kill the API mid-workload, restart it, and prove nothing is lost or duplicated.

Usage: python backend/scripts/chaos.py [--server-url postgresql://postgres@127.0.0.1:54330/postgres]
       [--users 200] [--teams 20] [--seconds 60] [--kills 3]
Creates database `crewline_chaos`, runs uvicorn as a subprocess, and kills it with Popen.kill()
(SIGKILL on Linux, TerminateProcess on Windows). Clients retry network errors and 503 with the same
idempotency key. Exit code 1 on any violation.
"""

import argparse
import asyncio
import os
import random
import ssl
import subprocess
import sys
import time
import uuid
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import asyncpg
import httpx
import jwt
import orjson

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "database")]

from invariants import run_checks  # noqa: E402
from migrate import apply_migrations  # noqa: E402

from app.core.invite_codes import generate_code  # noqa: E402

SECRET = "chaos-secret-0123456789abcdef0123456789abcdef"
TLS = ssl.create_default_context()


@dataclass
class Action:
    """One logical client action with its fixed idempotency key and final response."""

    method: str
    path: str
    body: object
    key: str = field(default_factory=lambda: uuid.uuid4().hex)
    status: int | None = None
    content: bytes = b""
    attempts: int = 0


class Api:
    """The API subprocess: start, wait for readiness, hard-kill."""

    def __init__(self, db_url: str, port: int, log_path: Path) -> None:
        self.env = {**os.environ, "DATABASE_URL": db_url, "JWT_SECRET": SECRET, "COOKIE_SECURE": "false",
                    "LOG_LEVEL": "WARNING", "RATE_MUTATIONS_PER_MIN": "1000000", "WRITE_POOL_MAX": "20"}
        self.port = port
        self.log_path = log_path
        self.proc: subprocess.Popen | None = None

    def start(self) -> None:
        """Start uvicorn and wait until /readyz answers."""
        log = open(self.log_path, "ab")  # noqa: SIM115
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "--factory", "app.main:create_app", "--app-dir", str(ROOT / "backend"),
             "--host", "127.0.0.1", "--port", str(self.port), "--log-level", "warning", "--no-proxy-headers"],
            env=self.env, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        deadline = time.time() + 40
        while time.time() < deadline:
            try:
                if httpx.get(f"http://127.0.0.1:{self.port}/readyz", timeout=1).status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            time.sleep(0.2)
        raise RuntimeError(f"API did not start, see {self.log_path}")

    def kill(self) -> None:
        """Hard-kill the process: no shutdown hooks run."""
        if self.proc is not None:
            self.proc.kill()
            self.proc.wait()


async def setup(server_url: str, users: int, teams: int) -> tuple[str, str, list[str], list[str]]:
    """Create the chaos database: one hackathon, teams with 3 of 4 seats taken, and free users."""
    admin = await asyncpg.connect(server_url)
    try:
        await admin.execute("DROP DATABASE IF EXISTS crewline_chaos WITH (FORCE)")
        await admin.execute("CREATE DATABASE crewline_chaos")
    finally:
        await admin.close()
    db_url = server_url.rsplit("/", 1)[0] + "/crewline_chaos"
    await apply_migrations(db_url)
    conn = await asyncpg.connect(db_url)
    try:
        hid = await conn.fetchval(
            "INSERT INTO hackathons (name, min_team_size, max_team_size) VALUES ('chaos', 1, 4) RETURNING id")
        ids = [r["id"] for r in await conn.fetch(
            "INSERT INTO users (email, password_hash, display_name) SELECT 'chaos-' || g || '@x.io', 'x', 'c' || g "
            "FROM generate_series(1, $1) g RETURNING id", users + teams * 3)]
        await conn.execute("INSERT INTO participants (hackathon_id, user_id) SELECT $1, unnest($2::uuid[])", hid, ids)
        codes = []
        for t in range(teams):
            members = ids[users + t * 3:users + t * 3 + 3]
            code = generate_code()
            tid = await conn.fetchval(
                "INSERT INTO teams (hackathon_id, name, leader_id, member_count, min_size, max_size, invite_code, "
                "invite_expires_at) VALUES ($1, $2, $3, 3, 1, 4, $4, now() + interval '1 day') RETURNING id",
                hid, f"chaos {t}", members[0], code)
            for uid in members:
                await conn.execute("INSERT INTO memberships (team_id, hackathon_id, user_id) VALUES ($1, $2, $3)",
                                   tid, hid, uid)
                await conn.execute(
                    "INSERT INTO audit_events (hackathon_id, team_id, action, payload) "
                    "VALUES ($1, $2, 'member_joined_via_code', jsonb_build_object('user_id', $3::text))",
                    hid, tid, str(uid))
            codes.append(code)
    finally:
        await conn.close()
    return db_url, str(hid), [str(i) for i in ids[:users]], codes


async def perform(client: httpx.AsyncClient, action: Action, stats: Counter) -> Action:
    """Send an action until it gets a final status, retrying network errors and 503 with the same key."""
    while True:
        action.attempts += 1
        try:
            response = await client.request(action.method, action.path, json=action.body,
                                            headers={"Idempotency-Key": action.key})
        except httpx.HTTPError:
            stats["network_retry"] += 1
            await asyncio.sleep(0.2 + random.random() * 0.3)
            continue
        if response.status_code == 503:
            stats["busy_retry"] += 1
            await asyncio.sleep(0.1 + random.random() * 0.2)
            continue
        action.status, action.content = response.status_code, response.content
        return action


async def user_loop(base: str, user_id: str, codes: list[str], deadline: float, done: list[Action],
                    stats: Counter) -> None:
    """Join a random team; if it worked, leave again shortly after; repeat until the deadline."""
    now = int(time.time())
    token = jwt.encode({"sub": user_id, "iat": now, "exp": now + 3600}, SECRET, algorithm="HS256")
    async with httpx.AsyncClient(base_url=base, verify=TLS, timeout=10, cookies={"crewline_session": token}) as client:
        while time.time() < deadline:
            joined = await perform(client, Action("POST", "/api/teams/join", {"code": random.choice(codes)}), stats)
            done.append(joined)
            if joined.status == 200:
                await asyncio.sleep(random.random() * 0.5)
                tid = orjson.loads(joined.content)["id"]
                done.append(await perform(client, Action("POST", f"/api/teams/{tid}/leave", None), stats))
            await asyncio.sleep(random.random() * 0.3)


async def replay_all(base: str, actions: list[Action], user_of: dict[str, str]) -> int:
    """Re-send every 200 action with its key; count responses that differ from the original bytes."""
    mismatches = 0
    tokens: dict[str, httpx.AsyncClient] = {}
    try:
        for action in actions:
            if action.status != 200:
                continue
            uid = user_of[action.key]
            if uid not in tokens:
                now = int(time.time())
                token = jwt.encode({"sub": uid, "iat": now, "exp": now + 3600}, SECRET, algorithm="HS256")
                tokens[uid] = httpx.AsyncClient(base_url=base, verify=TLS, timeout=10,
                                                cookies={"crewline_session": token})
            response = await tokens[uid].request(action.method, action.path, json=action.body,
                                                 headers={"Idempotency-Key": action.key})
            if response.status_code != 200 or response.content != action.content:
                mismatches += 1
    finally:
        await asyncio.gather(*(c.aclose() for c in tokens.values()))
    return mismatches


async def run_chaos(args: argparse.Namespace) -> bool:
    """Run the workload, kill and restart the API, then verify invariants, statuses and replays."""
    db_url, _, users, codes = await setup(args.server_url, args.users, args.teams)
    port = 8890
    base = f"http://127.0.0.1:{port}"
    api = Api(db_url, port, ROOT / ".devdb" / "chaos-api.log")
    await asyncio.to_thread(api.start)
    stats: Counter = Counter()
    per_user: dict[str, list[Action]] = {uid: [] for uid in users}
    deadline = time.time() + args.seconds
    workload = asyncio.gather(*(user_loop(base, uid, codes, deadline, per_user[uid], stats) for uid in users))
    interval = args.seconds / (args.kills + 1)
    for kill in range(args.kills):
        await asyncio.sleep(interval)
        await asyncio.to_thread(api.kill)
        print(f"kill {kill + 1} at {time.time() - (deadline - args.seconds):.1f} s")
        await asyncio.sleep(2)
        await asyncio.to_thread(api.start)
    await workload
    actions = [a for acts in per_user.values() for a in acts]
    user_of = {a.key: uid for uid, acts in per_user.items() for a in acts}
    statuses = Counter(a.status for a in actions)
    mismatches = await replay_all(base, actions, user_of)
    await asyncio.to_thread(api.kill)
    violations = await run_checks(db_url)
    conn = await asyncpg.connect(db_url)
    try:
        over = await conn.fetchval("SELECT count(*) FROM teams WHERE member_count > max_size")
        null_keys = await conn.fetchval("SELECT count(*) FROM idempotency_keys WHERE response_status IS NULL")
    finally:
        await conn.close()
    print(f"actions: {len(actions)}, statuses: {dict(statuses)}, retries: {dict(stats)}")
    print(f"replay mismatches: {mismatches}, teams over capacity: {over}, keys without response: {null_keys}")
    print(f"invariant violations: {violations or 'none'}")
    ok = (500 not in statuses and mismatches == 0 and over == 0 and null_keys == 0 and not violations
          and stats["network_retry"] > 0)
    print("CHAOS RESULT:", "PASS" if ok else "FAIL")
    return ok


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--server-url", default="postgresql://postgres@127.0.0.1:54330/postgres")
    parser.add_argument("--users", type=int, default=200)
    parser.add_argument("--teams", type=int, default=20)
    parser.add_argument("--seconds", type=float, default=60)
    parser.add_argument("--kills", type=int, default=3)
    ok = asyncio.run(run_chaos(parser.parse_args()))
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
