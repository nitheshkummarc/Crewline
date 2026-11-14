"""Local PostgreSQL 16 without Docker, using the binaries bundled in the pgserver package.

Usage:
  python database/dev_db.py start [--name dev]   initialize if needed, start, print DATABASE_URL
  python database/dev_db.py stop  [--name dev]   stop the server
Data lives in .devdb/<name>/ (git-ignored). Each name has a fixed port: dev 54329, test 54330.

Contents:
    data_dir: Return the data directory for a named dev database.
    _bin: Return the path of a bundled PostgreSQL binary.
    _run: Run a PostgreSQL tool without pipes (a started server would inherit them and keep them open).
    _port: Return the fixed port for a named instance.
    start: Initialize the data directory if needed, start the server and return its connection URL.
    stop: Stop the server with pg_ctl.
    main: CLI entry point.
"""

import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORTS = {"dev": 54329, "test": 54330}
MAX_CONNECTIONS = 300


def data_dir(name: str) -> Path:
    """Return the data directory for a named dev database."""
    return ROOT / ".devdb" / name


def _bin(tool: str) -> str:
    """Return the path of a bundled PostgreSQL binary."""
    import pgserver

    return str(Path(pgserver.__file__).parent / "pginstall" / "bin" / tool)


def _run(args: list[str]) -> subprocess.CompletedProcess:
    """Run a PostgreSQL tool without pipes (a started server would inherit them and keep them open)."""
    return subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                          check=False)


def _port(name: str) -> int:
    """Return the fixed port for a named instance."""
    return PORTS.get(name, 54331)


def start(name: str) -> str:
    """Initialize the data directory if needed, start the server and return its connection URL."""
    path = data_dir(name)
    port = _port(name)
    if not (path / "PG_VERSION").exists():
        path.mkdir(parents=True, exist_ok=True)
        initdb = _run([_bin("initdb"), "-D", str(path), "-U", "postgres", "--auth=trust", "-E", "UTF8"])
        if initdb.returncode != 0:
            raise SystemExit(f"initdb failed for {path}")
        with open(path / "postgresql.auto.conf", "a", encoding="utf-8") as conf:
            conf.write(f"max_connections = {MAX_CONNECTIONS}\n")
    if _run([_bin("pg_ctl"), "status", "-D", str(path)]).returncode != 0:
        started = _run([_bin("pg_ctl"), "start", "-D", str(path), "-w", "-l", str(path / "server.log"),
                        "-o", f"-h 127.0.0.1 -p {port}"])
        if started.returncode != 0:
            raise SystemExit(f"pg_ctl start failed, see {path / 'server.log'}")
    return f"postgresql://postgres@127.0.0.1:{port}/postgres"


def stop(name: str) -> None:
    """Stop the server with pg_ctl."""
    _run([_bin("pg_ctl"), "stop", "-D", str(data_dir(name)), "-m", "fast", "-w"])


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
