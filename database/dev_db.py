"""Local PostgreSQL 16 without Docker, using the pgserver package.

Usage:
  python database/dev_db.py start [--name dev]   start (or reuse) and print DATABASE_URL
  python database/dev_db.py stop  [--name dev]   stop the server
Data lives in .devdb/<name>/ (git-ignored).
"""

import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def data_dir(name: str) -> Path:
    """Return the data directory for a named dev database."""
    return ROOT / ".devdb" / name


def start(name: str) -> str:
    """Start or reuse the server and return its connection URL."""
    import pgserver

    path = data_dir(name)
    path.mkdir(parents=True, exist_ok=True)
    server = pgserver.get_server(path, cleanup_mode=None)
    return server.get_uri()


def stop(name: str) -> None:
    """Stop the server with pg_ctl."""
    import pgserver

    pg_ctl = Path(pgserver.__file__).parent / "pginstall" / "bin" / "pg_ctl"
    subprocess.run([str(pg_ctl), "stop", "-D", str(data_dir(name)), "-m", "fast"], check=False)


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("action", choices=["start", "stop"])
    parser.add_argument("--name", default="dev")
    args = parser.parse_args()
    if args.action == "start":
        print(start(args.name))
    else:
        stop(args.name)


if __name__ == "__main__":
    main()
