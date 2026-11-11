#!/usr/bin/env bash
# Start PostgreSQL 16 in Docker on 127.0.0.1:5432 with database crewline and max_connections=300
# (the race tests run several servers at once; service containers cannot pass server flags).
set -euo pipefail

docker run -d --name crewline-pg -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=crewline \
  postgres:16 -c max_connections=300 >/dev/null

# The entrypoint's first server listens only on a socket; a TCP check passes once the real server is up.
for _ in $(seq 1 60); do
  if docker exec crewline-pg pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then
    docker exec crewline-pg psql -U postgres -tAc "SHOW max_connections"
    exit 0
  fi
  sleep 1
done
echo "postgres did not become ready" >&2
docker logs crewline-pg >&2
exit 1
