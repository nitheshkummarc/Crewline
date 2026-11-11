#!/usr/bin/env bash
# Start the API in the background (log in api.log) and wait until /readyz answers 200.
# Needs DATABASE_URL and JWT_SECRET; other settings come from the environment.
set -euo pipefail

nohup backend/.venv/bin/python -m uvicorn --factory app.main:create_app --app-dir backend \
  --host 127.0.0.1 --port 8000 > api.log 2>&1 &

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8000/readyz >/dev/null 2>&1; then
    echo "api ready"
    exit 0
  fi
  sleep 1
done
echo "api did not become ready" >&2
cat api.log >&2
exit 1
