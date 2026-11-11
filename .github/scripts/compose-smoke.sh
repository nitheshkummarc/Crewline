#!/usr/bin/env bash
# Smoke test of `docker compose up`: /readyz, seed inside the API container, then signup, register and create a team.
set -euo pipefail

BASE=http://127.0.0.1:8000
JAR=$(mktemp)
json() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }
key() { python3 -c "import uuid; print(uuid.uuid4().hex)"; }

for _ in $(seq 1 90); do
  if curl -fsS "$BASE/readyz" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "$BASE/readyz"; echo

docker compose exec -T api python database/seed.py --users 50 --teams 5

# Signup: the form token must be at least 2 s old (bot check, ADR-037).
token=$(curl -fsS "$BASE/api/auth/form-token" | json "['token']")
sleep 2.5
curl -fsS -c "$JAR" -b "$JAR" -H 'Content-Type: application/json' -o /dev/null -w 'signup %{http_code}\n' \
  -d "{\"email\":\"smoke@example.com\",\"password\":\"compose-smoke-1\",\"display_name\":\"Smoke\",\"form_token\":\"$token\"}" \
  "$BASE/api/auth/signup"

hid=$(curl -fsS -b "$JAR" "$BASE/api/hackathons" | json "[0]['id']")
curl -fsS -b "$JAR" -X POST -H "Idempotency-Key: $(key)" -o /dev/null -w 'register %{http_code}\n' \
  "$BASE/api/hackathons/$hid/register"
code=$(curl -sS -b "$JAR" -H 'Content-Type: application/json' -H "Idempotency-Key: $(key)" -o /dev/null -w '%{http_code}' \
  -d '{"name":"Compose smoke"}' "$BASE/api/hackathons/$hid/teams")
echo "create team $code"
[ "$code" = "201" ]

# The built web app is served at / by the same container.
curl -fsS "$BASE/" | grep -q '<div id="root">' && echo "web app served"
