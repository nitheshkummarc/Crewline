"""Negative control: T-RACE-02 (naive join over-fills) and T-RACE-03 (real join holds on the same weak schema).

Contents:
    weak_db: A separate database with the full schema minus the teams_cap CHECK.
    weak_server: A second real API server running against the weak database.
    weak_conn: A connection to the weak database with a fresh hackathon id stored on it.
    _hackathon: Insert a hackathon with max team size 4 and return its id.
    test_race_02_naive_join_overfills: T-RACE-02: the naive check-then-insert join lets more than one of 50 racers
        take the last seat.
    test_race_03_real_join_on_weak_schema: T-RACE-03: on the same weak schema, the real join still admits exactly
        one of 50 racers.
"""

import asyncio
import os
from collections import Counter
from collections.abc import AsyncIterator, Iterator

import asyncpg
import pytest
from barrier import close, fire_together, keyed, warm
from helpers import Users
from naive import naive_join, seed_team, weaken_schema
from serverctl import create_database, start_server, stop_server

ITERATIONS = int(os.environ.get("RACE_ITERATIONS", "20"))
WEAK_DB = "crewline_weak"
pytestmark = pytest.mark.race


@pytest.fixture(scope="module")
def weak_db(server_url: str) -> str:
    """A separate database with the full schema minus the teams_cap CHECK."""
    async def setup() -> str:
        url = await create_database(server_url, WEAK_DB)
        conn = await asyncpg.connect(url)
        try:
            await weaken_schema(conn)
        finally:
            await conn.close()
        return url
    return asyncio.run(setup())


@pytest.fixture(scope="module")
def weak_server(weak_db: str, tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    """A second real API server running against the weak database."""
    proc, base = start_server(weak_db, tmp_path_factory.mktemp("weak") / "server.log")
    yield base
    stop_server(proc)


@pytest.fixture
async def weak_conn(weak_db: str) -> AsyncIterator[asyncpg.Connection]:
    """A connection to the weak database with a fresh hackathon id stored on it."""
    conn = await asyncpg.connect(weak_db)
    yield conn
    await conn.close()


async def _hackathon(conn: asyncpg.Connection) -> object:
    """Insert a hackathon with max team size 4 and return its id."""
    return await conn.fetchval(
        "INSERT INTO hackathons (name, min_team_size, max_team_size) VALUES ('weak', 1, 4) RETURNING id")


async def test_race_02_naive_join_overfills(weak_db: str, weak_conn: asyncpg.Connection) -> None:
    """T-RACE-02: the naive check-then-insert join lets more than one of 50 racers take the last seat."""
    hid = await _hackathon(weak_conn)
    pool = await asyncpg.create_pool(weak_db, min_size=50, max_size=50)
    winners = []
    try:
        for _ in range(max(ITERATIONS // 4, 3)):
            tid, _, racers = await seed_team(weak_conn, hid, members=3, max_size=4, racers=50)
            results = await fire_together([lambda u=u, t=tid: naive_join(pool, t, hid, u, 0.015) for u in racers])
            winners.append(sum(results))
    finally:
        await pool.close()
    assert max(winners) > 1, f"naive join never over-filled: {winners}"


async def test_race_03_real_join_on_weak_schema(weak_server: str, weak_db: str, weak_conn: asyncpg.Connection) -> None:
    """T-RACE-03: on the same weak schema, the real join still admits exactly one of 50 racers."""
    hid = await _hackathon(weak_conn)
    users = Users(weak_server)
    try:
        for i in range(ITERATIONS):
            tid, code, _ = await seed_team(weak_conn, hid, members=3, max_size=4, racers=0)
            racers = await users.bulk(weak_db, 50, str(hid))
            await warm(racers)
            responses = await fire_together([keyed(u, "POST", "/api/teams/join", {"code": code}) for u in racers])
            statuses = Counter(r.status_code for r in responses)
            assert statuses == Counter({200: 1, 409: 49}), f"iteration {i}: {statuses}"
            count = await weak_conn.fetchval("SELECT member_count FROM teams WHERE id = $1", tid)
            assert count == 4
            await close(racers)
    finally:
        await users.close()
