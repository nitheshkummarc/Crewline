"""Race lab walkthrough: trace the SQL of one real join (success, retry, full team) and report measured latency."""

import re
import time
import uuid

from app.core import metrics
from app.db import pools as db_pools
from app.db import tx
from app.db.trace import tracing
from app.modules.lab.service import LAB_IP, call, context, lab_hackathon, make_team, new_people
from app.modules.teams import service as teams_service

# What each statement on the join path is for, matched on its SQL text (first match wins).
STEP_NOTES: list[tuple[str, str, str]] = [
    (r"^BEGIN", "Start the transaction", "READ COMMITTED, one write-pool connection"),
    (r"FROM idempotency_keys", "Look up this key",
     "A retry of a committed click returns the stored response without new work"),
    (r"^INSERT INTO idempotency_keys", "Claim the idempotency key",
     "First statement. A second request with the same key waits on this row, then replays the stored answer"),
    (r"^UPDATE teams SET member_count", "Take the seat (conditional UPDATE)",
     "WHERE member_count < max_size AND status = 'forming'. The row lock makes racers queue; each re-checks the "
     "committed row, so only one can take the last seat"),
    (r"^INSERT INTO memberships", "Add the membership",
     "UNIQUE (hackathon_id, user_id): a person can never be in two teams, whatever the timing"),
    (r"^INSERT INTO audit_events|^WITH .*audit_events", "Write the audit event",
     "Who, what, when; its trigger calls pg_notify, which is delivered only if the transaction commits"),
    (r"^UPDATE idempotency_keys", "Store the response with the key",
     "Same commit as the seat, so a retry can never join twice"),
    (r"^COMMIT", "Commit", "Seat, membership, audit and stored response become visible together"),
    (r"^ROLLBACK", "Roll back", "The guard matched 0 rows: nothing changed, the key claim is undone too"),
    (r"team_snapshot", "Read the team for the response",
     "The answer the client receives, built inside the transaction"),
    (r"invite_code = \$1", "Explain the failure",
     "Read why the seat UPDATE matched nothing: full, finalized or expired"),
    (r"FROM memberships", "Explain: already in a team?",
     "A person already in this team gets 200; in another team, 409"),
]


def describe(sql: str) -> tuple[str, str]:
    """Return a short label and the guarantee for one SQL statement."""
    text = re.sub(r"^/\*.*?\*/\s*", "", sql)
    for pattern, label, why in STEP_NOTES:
        if re.search(pattern, text, re.IGNORECASE | re.DOTALL):
            return label, why
    return "Other statement", ""


async def traced_join(user_id: uuid.UUID, code: str, key: str) -> dict:
    """Run one real join by code with statement tracing; return the outcome and each statement with its time."""
    with tracing() as trace:
        t0 = time.perf_counter()
        result = await call(lambda: teams_service.join_by_code(
            context(user_id, "join_by_code", {"code": code}, key), code, LAB_IP), t0)
    steps, previous = [], 0.0
    for step in trace.steps:
        label, why = describe(step.sql)
        # asyncpg times statements with time.monotonic(), which ticks every 15.6 ms on Windows and reads 0 here;
        # the gap between perf_counter marks (statement plus the little Python work before it) is what we report.
        steps.append({"label": label, "why": why, "sql": step.sql[:400], "pool": step.pool,
                      "at_ms": step.at_ms, "gap_ms": round(step.at_ms - previous, 3), "error": step.error})
        previous = step.at_ms
    return {"status": result["status"], "code": result["code"], "replayed": result["replayed"],
            "server_ms": result["finished_ms"], "steps": steps}


async def run_walkthrough() -> dict:
    """Trace three real joins: a free seat, the same click retried with its key, and a team that is already full."""
    hid = await lab_hackathon()
    open_team = await make_team(hid, 2)
    full_team = await make_team(hid, 4)
    joiner, late = await new_people(hid, 2, "Joiner")
    key = uuid.uuid4().hex
    return {
        "hackathon_id": hid,
        "team": {"id": open_team["id"], "name": open_team["name"], "taken_before": 2, "max_size": 4},
        "join": await traced_join(joiner["id"], open_team["code"], key),
        "retry": await traced_join(joiner["id"], open_team["code"], key),
        "full": {"team": {"id": full_team["id"], "name": full_team["name"]},
                 **await traced_join(late["id"], full_team["code"], uuid.uuid4().hex)},
    }


def latency() -> dict:
    """Measured server-side latency per route over its last requests, plus pool and transaction counters."""
    pools = db_pools._pools
    pool_rows = [] if pools is None else [
        {"pool": name, "size": getattr(pools, name).get_size(), "idle": getattr(pools, name).get_idle_size()}
        for name in ("read", "write")]
    return {"routes": metrics.latency_summary(), "window": metrics.RECENT_LIMIT, "pools": pool_rows,
            "transactions": dict(tx.stats)}
