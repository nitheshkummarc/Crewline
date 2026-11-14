"""Build the caller's group, fetch candidates, rank them.

Contents:
    suggest: Return the context (team id, missing roles) and ranked candidates for the caller.
"""

from datetime import UTC, datetime
from uuid import UUID

from app.core.errors import NotFound, NotRegistered
from app.db.pools import read_conn
from app.modules.board.repo import hackathon_exists
from app.modules.suggestions import repo
from app.modules.suggestions.scoring import Group, missing_roles, rank


async def suggest(hackathon_id: UUID, user_id: UUID, limit: int) -> dict:
    """Return the context (team id, missing roles) and ranked candidates for the caller."""
    async with read_conn() as conn:
        if not await hackathon_exists(conn, hackathon_id):
            raise NotFound()
        if not await repo.is_registered(conn, hackathon_id, user_id):
            raise NotRegistered()
        team_id, members = await repo.group_members(conn, hackathon_id, user_id)
        group = Group(skills=frozenset(s for m in members for s in m["skills"]),
                      zones=tuple(m["timezone"] for m in members), solo=team_id is None)
        missing = missing_roles(group.skills)
        rows = await repo.candidates(conn, hackathon_id, [m["id"] for m in members], missing)
    cands = [{"user_id": r["user_id"], "display_name": r["display_name"], "skills": list(r["skills"]),
              "timezone": r["timezone"]} for r in rows]
    return {"context": {"team_id": team_id, "missing_roles": missing},
            "items": rank(group, cands, datetime.now(UTC), limit)}
