"""System guarantees through real servers: overload fails fast (T-GUAR-01), per-user limits (T-GUAR-02),
all-or-nothing transactions under an injected failure (T-GUAR-03, 04)."""

import asyncio
import time
import uuid
from collections import Counter
from collections.abc import Iterator

import asyncpg
import pytest
from barrier import fire_together, keyed, warm
from helpers import Users, create_team, form_fields, join, key, make_hackathon, query
from invariants import run_checks
from serverctl import create_database, start_server, stop_server

pytestmark = pytest.mark.race

FAULT_DB = "crewline_faults"
FAULT_SQL = """
CREATE TABLE fault_users (user_id uuid PRIMARY KEY);
CREATE FUNCTION inject_fault() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM fault_users WHERE user_id = (NEW.payload->>'user_id')::uuid) THEN
    RAISE EXCEPTION 'injected fault for %', NEW.payload->>'user_id';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_events_fault BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION inject_fault();
"""


@pytest.fixture(scope="module")
def tight_server(db_url: str, tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    """A server with a 2-connection write pool, 0.2 s acquire timeout and an in-flight cap of 4."""
    proc, base = start_server(db_url, tmp_path_factory.mktemp("tight") / "server.log", {
        "WRITE_POOL_MAX": "2", "READ_POOL_MAX": "2", "POOL_ACQUIRE_TIMEOUT_S": "0.2", "WRITE_INFLIGHT_MAX": "4"})
    yield base
    stop_server(proc)


@pytest.fixture(scope="module")
def limited_server(db_url: str, tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    """A server with production-like small rate limits."""
    proc, base = start_server(db_url, tmp_path_factory.mktemp("limited") / "server.log", {
        "RATE_MUTATIONS_PER_MIN": "5", "RATE_LOGIN_PER_MIN": "3", "RATE_SIGNUP_PER_HOUR": "2"})
    yield base
    stop_server(proc)


@pytest.fixture(scope="module")
def fault_db(server_url: str) -> str:
    """A database whose audit insert fails for users listed in fault_users."""
    async def setup() -> str:
        url = await create_database(server_url, FAULT_DB)
        conn = await asyncpg.connect(url)
        try:
            await conn.execute(FAULT_SQL)
        finally:
            await conn.close()
        return url
    return asyncio.run(setup())


@pytest.fixture(scope="module")
def fault_server(fault_db: str, tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    """A server on the fault database."""
    proc, base = start_server(fault_db, tmp_path_factory.mktemp("fault") / "server.log")
    yield base
    stop_server(proc)


async def test_guar_01_overload_fails_fast_and_stays_correct(tight_server: str, clean_db: str) -> None:
    """T-GUAR-01: a burst over the pool and in-flight cap gets fast 503s, never 500; retries keep one winner."""
    hid = await make_hackathon(clean_db, min_size=1, max_size=4)
    users = Users(tight_server)
    try:
        leader, m1, m2 = await users.bulk(clean_db, 3, hid)
        tid, code = await create_team(leader, hid)
        for member in (m1, m2):
            assert (await join(member, code)).status_code == 200
        racers = await users.bulk(clean_db, 40, hid)
        await warm(racers)

        async def once(user):
            started = time.perf_counter()
            response = await user.post("/api/teams/join", {"code": code})
            return response, time.perf_counter() - started

        first_pass = await fire_together([lambda u=u: once(u) for u in racers])
        statuses = Counter(r.status_code for r, _ in first_pass)
        assert 500 not in statuses and statuses[503] > 0, statuses
        busy = [r for r, _ in first_pass if r.status_code == 503]
        assert all(r.json()["error"]["code"] == "busy" and r.headers["retry-after"] == "1" for r in busy)
        assert max(elapsed for r, elapsed in first_pass if r.status_code == 503) < 2.0
        assert statuses[200] <= 1

        retried = await fire_together([keyed(u, "POST", "/api/teams/join", {"code": code}) for u in racers])
        final = Counter(r.status_code for r in retried)
        assert 500 not in final and 503 not in final, final
        rows = await query(clean_db, "SELECT member_count, (SELECT count(*) FROM memberships WHERE team_id = $1) AS n "
                                     "FROM teams WHERE id = $1", uuid.UUID(tid))
        assert (rows[0]["member_count"], rows[0]["n"]) == (4, 4)
    finally:
        await users.close()


async def test_guar_02_per_user_limits(limited_server: str, users: Users, clean_db: str) -> None:
    """T-GUAR-02: 6th mutation in a minute is 429 for that user only; login and signup limits also apply."""
    hid = await make_hackathon(clean_db)
    limited = Users(limited_server)
    try:
        heavy, light = await limited.bulk(clean_db, 2, hid)
        statuses = [(await heavy.patch(f"/api/hackathons/{hid}/me", {"looking": i % 2 == 0})).status_code
                    for i in range(6)]
        assert statuses[:5] == [200] * 5 and statuses[5] == 429
        blocked = await heavy.patch(f"/api/hackathons/{hid}/me", {"looking": True})
        assert blocked.json()["error"]["code"] == "rate_limited" and int(blocked.headers["retry-after"]) >= 1
        assert (await light.patch(f"/api/hackathons/{hid}/me", {"looking": False})).status_code == 200

        known = await users.new("login-target")
        client = limited.client()
        wrong = {"email": known.email, "password": "wrong-pass-1", **form_fields()}
        logins = [(await client.post("/api/auth/login", json=wrong)).status_code for _ in range(4)]
        assert logins == [401, 401, 401, 429]

        signups = [(await client.post("/api/auth/signup", json={
            "email": f"s{i}-{uuid.uuid4().hex[:6]}@example.com", "password": "long-enough-1",
            "display_name": "S", **form_fields()})).status_code for i in range(3)]
        assert signups == [201, 201, 429]
    finally:
        await limited.close()


async def test_guar_03_join_is_all_or_nothing(fault_server: str, fault_db: str) -> None:
    """T-GUAR-03: a failure at the last statement of a join leaves no seat, no member and no stored key."""
    hid = await make_hackathon(fault_db, min_size=1, max_size=4)
    users = Users(fault_server)
    try:
        leader, victim = await users.bulk(fault_db, 2, hid)
        tid, code = await create_team(leader, hid)
        await query(fault_db, "INSERT INTO fault_users VALUES ($1)", uuid.UUID(victim.id))
        idem = key()
        failed = await victim.post("/api/teams/join", {"code": code}, idem=idem)
        assert failed.status_code == 500 and failed.json()["error"]["code"] == "internal_error"
        team = await query(fault_db, "SELECT member_count FROM teams WHERE id = $1", uuid.UUID(tid))
        members = await query(fault_db, "SELECT 1 FROM memberships WHERE user_id = $1", uuid.UUID(victim.id))
        keys = await query(fault_db, "SELECT 1 FROM idempotency_keys WHERE key = $1", idem)
        assert team[0]["member_count"] == 1 and members == [] and keys == []

        await query(fault_db, "DELETE FROM fault_users")
        retried = await victim.post("/api/teams/join", {"code": code}, idem=idem)
        assert retried.status_code == 200 and retried.json()["member_count"] == 2
        assert await run_checks(fault_db) == {}
    finally:
        await users.close()


async def test_guar_04_accept_is_all_or_nothing(fault_server: str, fault_db: str) -> None:
    """T-GUAR-04: a failure at the last statement of an accept leaves the request pending and the count unchanged."""
    hid = await make_hackathon(fault_db, min_size=1, max_size=4)
    users = Users(fault_server)
    try:
        leader, asker = await users.bulk(fault_db, 2, hid)
        tid, _ = await create_team(leader, hid)
        rid = (await asker.post(f"/api/teams/{tid}/requests", {})).json()["id"]
        await query(fault_db, "INSERT INTO fault_users VALUES ($1)", uuid.UUID(asker.id))
        failed = await leader.post(f"/api/requests/{rid}/accept")
        assert failed.status_code == 500
        request = await query(fault_db, "SELECT status FROM join_requests WHERE id = $1", uuid.UUID(rid))
        team = await query(fault_db, "SELECT member_count FROM teams WHERE id = $1", uuid.UUID(tid))
        assert request[0]["status"] == "pending" and team[0]["member_count"] == 1
        await query(fault_db, "DELETE FROM fault_users")
        assert (await leader.post(f"/api/requests/{rid}/accept")).status_code == 200
        assert await run_checks(fault_db) == {}
    finally:
        await users.close()
