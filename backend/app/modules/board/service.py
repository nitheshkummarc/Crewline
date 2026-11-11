"""Board pages through the micro-cache, rendered once to bytes."""

from uuid import UUID

import orjson

from app.core import cache
from app.core.errors import NotFound
from app.db.pools import read_conn
from app.modules.board import repo
from app.modules.board.cursor import decode_cursor, encode_cursor


def _page(items: list, limit: int, next_key: tuple | None) -> bytes:
    """Serialize a board page with its next cursor."""
    cursor = encode_cursor(*next_key) if next_key and len(items) > limit else None
    return orjson.dumps({"items": items[:limit], "next_cursor": cursor}, default=str)


async def teams_page(hackathon_id: UUID, limit: int, cursor: str | None) -> tuple[str, bytes]:
    """Return (etag, bytes) for a teams board page."""
    after = decode_cursor(cursor) if cursor else None

    async def load() -> bytes:
        async with read_conn() as conn:
            teams = await repo.teams_page(conn, hackathon_id, after, limit)
            if not teams and not await repo.hackathon_exists(conn, hackathon_id):
                raise NotFound()
        last = teams[limit - 1] if len(teams) > limit else None
        return _page(teams, limit, (last["created_at"], last["id"]) if last else None)

    return await cache.board_cache.get_or_load(("teams", str(hackathon_id), cursor or "", limit), load)


async def people_page(hackathon_id: UUID, limit: int, cursor: str | None) -> tuple[str, bytes]:
    """Return (etag, bytes) for a people board page."""
    after = decode_cursor(cursor) if cursor else None

    async def load() -> bytes:
        async with read_conn() as conn:
            rows = await repo.people_page(conn, hackathon_id, after, limit)
            if not rows and not await repo.hackathon_exists(conn, hackathon_id):
                raise NotFound()
        people = [{"user_id": r["user_id"], "display_name": r["display_name"], "skills": r["skills"],
                   "timezone": r["timezone"]} for r in rows]
        last = rows[limit - 1] if len(rows) > limit else None
        return _page(people, limit, (last["registered_at"], last["user_id"]) if last else None)

    return await cache.board_cache.get_or_load(("people", str(hackathon_id), cursor or "", limit), load)
