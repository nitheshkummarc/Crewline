"""Print a GitHub Actions notice with the board latency (and stampede and busy-retry counts) from a k6 summary export.

Usage: python3 .github/scripts/k6_notice.py <k6-summary.json> <title>
"""

import json
import subprocess
import sys


def summary_line(metrics: dict) -> str:
    """Return one line: board p50/p95/p99/max, request rate and count, plus stampede winners and busy retries if any."""
    board, reqs = metrics["http_req_duration{route:board_teams}"], metrics["http_reqs"]
    parts = [f"board p50 {board['med']:.1f} ms", f"p95 {board['p(95)']:.1f} ms", f"p99 {board['p(99)']:.1f} ms",
             f"max {board['max']:.1f} ms", f"{reqs['rate']:.0f} req/s", f"{reqs['count']} requests"]
    winners = sorted((int(k.split(":")[1].rstrip("}")), v["count"]) for k, v in metrics.items()
                     if k.startswith("stampede_wins{"))
    if winners:
        parts.append(f"stampedes {len(winners)} with winners {[count for _, count in winners]}")
    if "busy_retries" in metrics:
        parts.append(f"busy retries {metrics['busy_retries']['count']}")
    return ", ".join(parts)


def main() -> None:
    """CLI entry point."""
    path, title = sys.argv[1], sys.argv[2]
    version = subprocess.run(["k6", "version"], capture_output=True, text=True).stdout.split()[1]
    metrics = json.load(open(path, encoding="utf-8"))["metrics"]
    # Workflow commands split the title at commas, so it must not contain any.
    print(f"::notice title=k6 {version} {title.replace(',', ' ')}::{summary_line(metrics)}")


if __name__ == "__main__":
    main()
