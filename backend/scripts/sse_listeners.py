"""Hold N server-sent event streams open during a load run and report the events each one received (scenario L-B).

Usage: python backend/scripts/sse_listeners.py --base http://127.0.0.1:8000 --tokens loadtest/tokens.json
                                               [--streams 50] [--seconds 80]
Each stream uses a different seeded user (the server caps streams per user). Exits 1 if any stream failed to open,
dropped before the end, or received no team event.

Contents:
    listen: Read one stream for `seconds`; return its status, event counts by kind, and whether it stayed open.
    run: Open all streams at once, wait for them, print a summary and return the exit code.
    main: CLI entry point; reads the tokens file.
"""

import argparse
import asyncio
import json
import sys
import time
from collections import Counter
from pathlib import Path

import httpx


async def listen(base: str, token: str, hackathon_id: str, seconds: float) -> tuple[int | None, Counter, bool]:
    """Read one stream for `seconds`; return its status, event counts by kind, and whether it stayed open."""
    kinds: Counter = Counter()
    cookies = {"crewline_session": token}
    async with httpx.AsyncClient(base_url=base, cookies=cookies, timeout=httpx.Timeout(10, read=None)) as client:
        try:
            async with client.stream("GET", f"/api/events?hackathon_id={hackathon_id}") as response:
                if response.status_code != 200:
                    return response.status_code, kinds, False
                deadline = time.monotonic() + seconds
                lines = response.aiter_lines()
                while (left := deadline - time.monotonic()) > 0:
                    try:
                        line = await asyncio.wait_for(anext(lines), timeout=left)
                    except TimeoutError:
                        break
                    if line.startswith("event:"):
                        kinds[line[6:].strip()] += 1
                return 200, kinds, True
        except (httpx.HTTPError, StopAsyncIteration):
            return 200, kinds, False


async def run(args: argparse.Namespace, data: dict) -> int:
    """Open all streams at once, wait for them, print a summary and return the exit code."""
    tokens = data["tokens"][-args.streams - 40:-40]  # Clear of the k6 readers (start) and L-B setup users (last 36).
    results = await asyncio.gather(*(listen(args.base, t, data["hackathon_id"], args.seconds) for t in tokens))
    team_events = [r[1]["team"] for r in results]
    failed = [i for i, (status, kinds, stayed) in enumerate(results)
              if status != 200 or not stayed or not kinds["team"]]
    total: Counter = sum((r[1] for r in results), Counter())
    print(f"streams {len(results)}, failed {len(failed)}, team events per stream min {min(team_events)} "
          f"max {max(team_events)}, all events by kind {dict(total)}")
    return 1 if failed else 0


def main() -> None:
    """CLI entry point; reads the tokens file."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    parser.add_argument("--tokens", default="loadtest/tokens.json")
    parser.add_argument("--streams", type=int, default=50)
    parser.add_argument("--seconds", type=float, default=80)
    args = parser.parse_args()
    data = json.loads(Path(args.tokens).read_text(encoding="utf-8"))
    sys.exit(asyncio.run(run(args, data)))


if __name__ == "__main__":
    main()
