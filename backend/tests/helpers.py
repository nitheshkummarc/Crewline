"""Test helpers: users with their own HTTP client, hackathons, keys and raw queries."""

import uuid
from dataclasses import dataclass, field
from typing import Any

import asyncpg
import httpx

TEST_JWT_SECRET = "test-secret-0123456789abcdef0123456789abcdef"

SERVER_ENV = {
    "JWT_SECRET": TEST_JWT_SECRET,
    "COOKIE_SECURE": "false",
    "WRITE_POOL_MAX": "60",
    "READ_POOL_MAX": "10",
    "WRITE_INFLIGHT_MAX": "200",
    "RATE_SIGNUP_PER_HOUR": "1000000",
    "RATE_LOGIN_PER_MIN": "1000000",
    "RATE_MUTATIONS_PER_MIN": "1000000",
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
        client = httpx.AsyncClient(base_url=self.base, timeout=30)
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
            "skills": list(skills), "timezone": timezone})
        assert response.status_code == 201, response.text
        user = User(client=client, id=response.json()["id"], email=email, name=name)
        if hackathon:
            registered = await user.post(f"/api/hackathons/{hackathon}/register")
            assert registered.status_code == 200, registered.text
        return user

    async def close(self) -> None:
        """Close every client."""
        for client in self.clients:
            await client.aclose()


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
    """Run a raw query and return its rows."""
    conn = await asyncpg.connect(db_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()
