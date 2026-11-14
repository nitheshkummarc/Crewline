"""Half-open database links (T-CHAOS-03, B-34): requests fail fast with 503, pools recover, streams resync.

Contents:
    FreezeProxy: TCP proxy to PostgreSQL that can silently stop forwarding on every link open at that moment.
    FreezeProxy.start: Listen on a free local port and return it.
    FreezeProxy._handle: Connect upstream and pump both directions.
    FreezeProxy._pump: Forward bytes until EOF; a frozen link swallows bytes and never sends FIN or RST.
    FreezeProxy.freeze: Make every currently open link half-open; links opened later work normally.
    FreezeProxy.close: Stop listening and close every socket.
    _via: Return db_url with its host and port replaced by the local proxy.
    test_chaos_03_half_open_links_fail_fast_and_recover: T-CHAOS-03: frozen links give 503 within the command
        timeout, then reads recover and streams resync.
"""

import asyncio
import time
from urllib.parse import urlsplit, urlunsplit

import pytest
from helpers import Users, create_team, make_hackathon
from serverctl import start_server, stop_server
from sse import SseReader

pytestmark = pytest.mark.race


class FreezeProxy:
    """TCP proxy to PostgreSQL that can silently stop forwarding on every link open at that moment."""

    def __init__(self, host: str, port: int) -> None:
        self.host, self.port = host, port
        self.links: list[dict] = []
        self.server: asyncio.Server | None = None

    async def start(self) -> int:
        """Listen on a free local port and return it."""
        self.server = await asyncio.start_server(self._handle, "127.0.0.1", 0)
        return int(self.server.sockets[0].getsockname()[1])

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        """Connect upstream and pump both directions."""
        up_reader, up_writer = await asyncio.open_connection(self.host, self.port)
        link = {"frozen": False, "writers": (writer, up_writer)}
        self.links.append(link)
        await asyncio.gather(self._pump(reader, up_writer, link), self._pump(up_reader, writer, link),
                             return_exceptions=True)

    @staticmethod
    async def _pump(src: asyncio.StreamReader, dst: asyncio.StreamWriter, link: dict) -> None:
        """Forward bytes until EOF; a frozen link swallows bytes and never sends FIN or RST."""
        while data := await src.read(65536):
            if not link["frozen"]:
                dst.write(data)
                await dst.drain()
        if not link["frozen"]:
            dst.close()

    def freeze(self) -> None:
        """Make every currently open link half-open; links opened later work normally."""
        for link in self.links:
            link["frozen"] = True

    async def close(self) -> None:
        """Stop listening and close every socket."""
        if self.server is not None:
            self.server.close()
        for link in self.links:
            for writer in link["writers"]:
                writer.close()


def _via(db_url: str, port: int) -> str:
    """Return db_url with its host and port replaced by the local proxy."""
    parts = urlsplit(db_url)
    auth = parts.netloc.rsplit("@", 1)[0] + "@" if "@" in parts.netloc else ""
    return urlunsplit(parts._replace(netloc=f"{auth}127.0.0.1:{port}"))


async def test_chaos_03_half_open_links_fail_fast_and_recover(clean_db: str, tmp_path) -> None:
    """T-CHAOS-03: frozen links give 503 within the command timeout, then reads recover and streams resync."""
    target = urlsplit(clean_db)
    proxy = FreezeProxy(target.hostname or "127.0.0.1", target.port or 5432)
    port = await proxy.start()
    proc, base = await asyncio.to_thread(start_server, _via(clean_db, port), tmp_path / "server.log",
                                         {"WRITE_POOL_MAX": "2", "READ_POOL_MAX": "2"})
    users = Users(base)
    try:
        hid = await make_hackathon(clean_db, min_size=1, max_size=4)
        (leader,) = await users.bulk(clean_db, 1, hid)
        tid, _ = await create_team(leader, hid)
        async with SseReader(leader.client, f"/api/events?hackathon_id={hid}") as stream:
            proxy.freeze()
            started = time.perf_counter()
            first = await leader.get(f"/api/teams/{tid}")
            assert first.status_code == 503, first.text
            assert first.headers["retry-after"] == "1" and time.perf_counter() - started < 8.0
            deadline = time.perf_counter() + 30
            while (await leader.get(f"/api/teams/{tid}")).status_code != 200:
                assert time.perf_counter() < deadline, "reads did not recover"
            # The listener keepalive runs every 30 s and gives up after 5 s.
            await stream.next("resync", within=45.0)
    finally:
        await users.close()
        stop_server(proc)
        await proxy.close()
