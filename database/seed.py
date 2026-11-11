"""Bulk seed data with COPY: users, participants, teams, memberships, audit rows, and a k6 tokens file.

Usage: python database/seed.py --users 10000 --teams 2000 [--url URL] [--tokens loadtest/tokens.json]
Every invariant holds on the result (counts, leaders, finalized sizes, creating audit events).
Seeded users share the password given by --password (default: crewline-demo-1).
"""

import argparse
import asyncio
import json
import os
import random
import sys
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import asyncpg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.invite_codes import generate_code
from app.core.skills import SKILLS

ZONES = ["Asia/Kolkata", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York",
         "America/Los_Angeles", "America/Sao_Paulo", "Africa/Lagos", "Asia/Tokyo", "Australia/Sydney"]


def build(users: int, teams: int, max_size: int, min_size: int, rng: random.Random) -> dict:
    """Build all rows in memory: team sizes sum to at most half the users so the people board stays populated."""
    now = datetime.now(UTC)
    hackathon_id = uuid.uuid4()
    user_ids = [uuid.uuid4() for _ in range(users)]
    user_rows = [(uid, f"user{i:05d}@crewline.test", f"User {i:05d}",
                  rng.sample(SKILLS, rng.randint(1, 4)), rng.choice(ZONES), now - timedelta(minutes=users - i))
                 for i, uid in enumerate(user_ids)]
    participants = [(hackathon_id, uid, True, now - timedelta(minutes=users - i)) for i, uid in enumerate(user_ids)]
    pool = user_ids[:]
    rng.shuffle(pool)
    team_rows, member_rows, audit_rows = [], [], []
    cursor = 0
    for t in range(teams):
        size = rng.choices(range(1, max_size + 1), weights=[max_size - k + 1 for k in range(1, max_size + 1)])[0]
        members = pool[cursor:cursor + size]
        cursor += size
        if len(members) < size:
            break
        team_id = uuid.uuid4()
        created = now - timedelta(seconds=(teams - t) * 7)
        finalized = size >= min_size and size == max_size and rng.random() < 0.3
        team_rows.append((team_id, hackathon_id, f"Team {t:04d}", members[0], size, min_size, max_size,
                          "finalized" if finalized else "forming", True, generate_code(), now + timedelta(days=2),
                          1 + size, created))
        for position, uid in enumerate(members):
            member_rows.append((team_id, hackathon_id, uid, created + timedelta(milliseconds=position)))
            action = "team_created" if position == 0 else "member_joined_via_code"
            audit_rows.append((hackathon_id, team_id, uid, action, json.dumps({"user_id": str(uid), "seed": True}),
                               created + timedelta(milliseconds=position)))
    return {"hackathon_id": hackathon_id, "users": user_rows, "participants": participants, "teams": team_rows,
            "members": member_rows, "audit": audit_rows, "user_ids": user_ids}


async def seed(url: str, users: int, teams: int, max_size: int, min_size: int, password_hash: str,
               rng_seed: int) -> dict:
    """Insert one hackathon and all rows with COPY in a single transaction; return the built data."""
    data = build(users, teams, max_size, min_size, random.Random(rng_seed))
    conn = await asyncpg.connect(url)
    try:
        async with conn.transaction():
            await conn.execute(
                "INSERT INTO hackathons (id, name, min_team_size, max_team_size) VALUES ($1, 'Seeded Hack', $2, $3)",
                data["hackathon_id"], min_size, max_size)
            await conn.copy_records_to_table(
                "users", columns=["id", "email", "password_hash", "display_name", "skills", "timezone", "created_at"],
                records=[(u[0], u[1], password_hash, u[2], u[3], u[4], u[5]) for u in data["users"]])
            await conn.copy_records_to_table(
                "participants", columns=["hackathon_id", "user_id", "looking", "registered_at"],
                records=data["participants"])
            await conn.copy_records_to_table(
                "teams", columns=["id", "hackathon_id", "name", "leader_id", "member_count", "min_size", "max_size",
                                  "status", "looking", "invite_code", "invite_expires_at", "version", "created_at"],
                records=data["teams"])
            await conn.copy_records_to_table(
                "memberships", columns=["team_id", "hackathon_id", "user_id", "joined_at"], records=data["members"])
            # The audit trigger sends pg_notify per row; disable it for the bulk load only.
            await conn.execute("ALTER TABLE audit_events DISABLE TRIGGER audit_events_notify")
            await conn.copy_records_to_table(
                "audit_events", columns=["hackathon_id", "team_id", "actor_id", "action", "payload", "created_at"],
                records=data["audit"])
            await conn.execute("ALTER TABLE audit_events ENABLE TRIGGER audit_events_notify")
        await conn.execute("ANALYZE")
    finally:
        await conn.close()
    return data


def write_tokens(path: Path, user_ids: list[uuid.UUID], hackathon_id: uuid.UUID, secret: str, count: int,
                 team_codes: list[str]) -> None:
    """Write pre-minted session JWTs and the hackathon id for k6."""
    import jwt

    now = int(time.time())
    tokens = [jwt.encode({"sub": str(uid), "iat": now, "exp": now + 6 * 3600}, secret, algorithm="HS256")
              for uid in user_ids[-count:]]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"hackathon_id": str(hackathon_id), "tokens": tokens, "codes": team_codes}),
                    encoding="utf-8")


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--users", type=int, default=10000)
    parser.add_argument("--teams", type=int, default=2000)
    parser.add_argument("--max-size", type=int, default=4)
    parser.add_argument("--min-size", type=int, default=2)
    parser.add_argument("--password", default="crewline-demo-1")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--tokens", type=Path, default=None, help="write k6 tokens to this file")
    parser.add_argument("--token-count", type=int, default=2000)
    parser.add_argument("--secret", default=os.environ.get("JWT_SECRET"))
    args = parser.parse_args()
    if not args.url:
        raise SystemExit("set DATABASE_URL or pass --url")
    from argon2 import PasswordHasher

    started = time.perf_counter()
    data = asyncio.run(seed(args.url, args.users, args.teams, args.max_size, args.min_size,
                            PasswordHasher().hash(args.password), args.seed))
    elapsed = time.perf_counter() - started
    print(f"seeded hackathon {data['hackathon_id']}: {len(data['users'])} users, {len(data['teams'])} teams, "
          f"{len(data['members'])} memberships in {elapsed:.1f} s")
    if args.tokens:
        if not args.secret:
            raise SystemExit("set JWT_SECRET or pass --secret to mint tokens")
        open_codes = [t[9] for t in data["teams"] if t[7] == "forming" and t[4] < t[6]][:200]
        team_member_ids = {m[2] for m in data["members"]}
        free = [uid for uid in data["user_ids"] if uid not in team_member_ids]
        write_tokens(args.tokens, free, data["hackathon_id"], args.secret, args.token_count, open_codes)
        print(f"wrote {min(args.token_count, len(free))} tokens of users without a team to {args.tokens}")


if __name__ == "__main__":
    main()
