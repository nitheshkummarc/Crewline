"""Test helpers: users with their own HTTP client, hackathons, keys and raw queries."""

import ssl
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import asyncpg
import httpx
import jwt

from app.db.pools import init_connection

TEST_JWT_SECRET = "test-secret-0123456789abcdef0123456789abcdef"

# One TLS context for every test client: httpx builds a new one per client by default, which loads the
# CA bundle and costs about 235 ms on Windows (50 clients per race round = 12 s).
SHARED_TLS = ssl.create_default_context()

SERVER_ENV = {
    "JWT_SECRET": TEST_JWT_SECRET,
    "COOKIE_SECURE": "false",
    "WRITE_POOL_MAX": "60",
    "READ_POOL_MAX": "10",
    "WRITE_INFLIGHT_MAX": "200",
    "RATE_SIGNUP_PER_HOUR": "1000000",
    "RATE_LOGIN_PER_MIN": "1000000",
    "RATE_MUTATIONS_PER_MIN": "1000000",
    "RATE_CODE_PER_IP_MIN": "1000000",
    "SSE_HEARTBEAT_S": "1",
    "LOG_LEVEL": "WARNING",
}


def key() -> str:
    """Return a fresh idempotency key."""
    return uuid.uuid4().hex


@dataclass
class User:
    """A signed-up user with an authenticated client."""

    client: httpx.AsyncClient
    id: str
    email: str
    name: str

    async def get(self, path: str, **kwargs: Any) -> httpx.Response:
        """GET with the session cookie."""
        return await self.client.get(path, **kwargs)

    async def send(self, method: str, path: str, json: Any = None, idem: str | None = None) -> httpx.Response:
        """Mutation with the session cookie and an Idempotency-Key (fresh unless given)."""
        headers = {"Idempotency-Key": idem or key()}
        return await self.client.request(method, path, json=json, headers=headers)

    async def post(self, path: str, json: Any = None, idem: str | None = None) -> httpx.Response:
        """POST with an Idempotency-Key."""
        return await self.send("POST", path, json, idem)

    async def patch(self, path: str, json: Any = None, idem: str | None = None) -> httpx.Response:
        """PATCH with an Idempotency-Key."""
        return await self.send("PATCH", path, json, idem)

    async def delete(self, path: str, idem: str | None = None) -> httpx.Response:
        """DELETE with an Idempotency-Key."""
        return await self.send("DELETE", path, None, idem)


@dataclass
class Users:
    """Factory that signs up users and closes their clients at teardown."""

    base: str
    clients: list[httpx.AsyncClient] = field(default_factory=list)

    def client(self) -> httpx.AsyncClient:
        """Return a new tracked client for the server."""
        client = httpx.AsyncClient(base_url=self.base, timeout=30, verify=SHARED_TLS)
        self.clients.append(client)
        return client

    async def new(self, name: str | None = None, skills: tuple[str, ...] = (), timezone: str = "UTC",
                  hackathon: str | None = None) -> User:
        """Sign up a user, optionally register them for a hackathon, and return it."""
        name = name or f"user-{uuid.uuid4().hex[:8]}"
        email = f"{name}-{uuid.uuid4().hex[:6]}@example.com"
        client = self.client()
        response = await client.post("/api/auth/signup", json={
            "email": email, "password": "correct-horse-1", "display_name": name[:60],
            "skills": list(skills), "timezone": timezone, **form_fields()})
        assert response.status_code == 201, response.text
        user = User(client=client, id=response.json()["id"], email=email, name=name)
        if hackathon:
            registered = await user.post(f"/api/hackathons/{hackathon}/register")
            assert registered.status_code == 200, registered.text
        return user

    async def bulk(self, db_url: str, count: int, hackathon: str, base: str | None = None) -> list[User]:
        """Insert registered users directly and return them with minted session cookies (fast, for races)."""
        conn = await asyncpg.connect(db_url)
        try:
            ids = await conn.fetch(
                "INSERT INTO users (email, password_hash, display_name) "
                "SELECT 'bulk-' || gen_random_uuid() || '@example.com', 'x', 'racer ' || g "
                "FROM generate_series(1, $1) g RETURNING id, email", count)
            await conn.execute(
                "INSERT INTO participants (hackathon_id, user_id) SELECT $1, unnest($2::uuid[])",
                uuid.UUID(hackathon), [row["id"] for row in ids])
        finally:
            await conn.close()
        result = []
        for row in ids:
            client = httpx.AsyncClient(base_url=base or self.base, timeout=60, verify=SHARED_TLS,
                                       cookies={"crewline_session": session_token(str(row["id"]))})
            self.clients.append(client)
            result.append(User(client=client, id=str(row["id"]), email=row["email"], name="racer"))
        return result

    async def close(self) -> None:
        """Close every client."""
        for client in self.clients:
            await client.aclose()


def form_fields(age_s: float = 3.0) -> dict:
    """Return signup/login bot-check fields: a form token rendered age_s ago and an empty honeypot."""
    issued = int((time.time() - age_s) * 1000)
    claims = {"aud": "crewline-form", "iat_ms": issued, "exp": int(time.time()) + 3600}
    return {"form_token": jwt.encode(claims, TEST_JWT_SECRET, algorithm="HS256"), "company": ""}


def session_token(user_id: str) -> str:
    """Mint a session JWT for a user with the test secret."""
    now = int(time.time())
    return jwt.encode({"sub": user_id, "iat": now, "exp": now + 3600}, TEST_JWT_SECRET, algorithm="HS256")


async def create_team(user: User, hackathon: str, name: str = "Team") -> tuple[str, str]:
    """Create a team as the user and return (team id, invite code)."""
    created = await user.post(f"/api/hackathons/{hackathon}/teams", {"name": name})
    assert created.status_code == 201, created.text
    team_id = created.json()["id"]
    invite = await user.get(f"/api/teams/{team_id}/invite")
    return team_id, invite.json()["code"]


async def join(user: User, code: str) -> httpx.Response:
    """Join a team by invite code."""
    return await user.post("/api/teams/join", {"code": code})


async def make_hackathon(db_url: str, min_size: int = 2, max_size: int = 4, ttl: str = "48 hours",
                         name: str = "Test Hack") -> str:
    """Insert a hackathon and return its id."""
    conn = await asyncpg.connect(db_url)
    try:
        hid = await conn.fetchval(
            "INSERT INTO hackathons (name, min_team_size, max_team_size, invite_ttl) "
            "VALUES ($1, $2, $3, $4::text::interval) RETURNING id", name, min_size, max_size, ttl)
        return str(hid)
    finally:
        await conn.close()


async def query(db_url: str, sql: str, *args: Any) -> list[asyncpg.Record]:
    """Run a raw query (json and jsonb decoded like the app) and return its rows."""
    conn = await asyncpg.connect(db_url)
    await init_connection(conn)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()
