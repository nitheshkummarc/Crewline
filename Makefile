# Task shortcuts; the raw commands are listed in README (Windows users run those directly).
UV ?= uv
K6 ?= k6
PY := $(UV) run --project backend python

.PHONY: up down devdb migrate api web test race invariants seed load-a load-b load-c chaos lint

up:               ## PostgreSQL 16 and the API (serving the web app) on http://localhost:8000
	docker compose up -d --build

down:             ## Stop the Compose stack (data stays in the pgdata volume)
	docker compose down

devdb:            ## Local PostgreSQL 16 without Docker; prints DATABASE_URL
	$(PY) database/dev_db.py start

migrate:          ## Apply SQL migrations to $$DATABASE_URL
	$(PY) database/migrate.py

api:              ## API dev server on :8000
	$(UV) run --project backend uvicorn --factory app.main:create_app --reload --app-dir backend

web:              ## Web dev server (proxies /api to :8000)
	npm --prefix frontend run dev

test:             ## All backend tests (API, unit, races, guarantees)
	$(UV) run --project backend pytest backend/tests

race:             ## Race and guarantee tests only
	$(UV) run --project backend pytest backend/tests/concurrency -q

invariants:       ## Invariant checker on $$DATABASE_URL
	$(PY) database/invariants.py

seed:             ## 10k users, 2k teams and k6 tokens (needs DATABASE_URL and JWT_SECRET)
	$(PY) database/seed.py --users 10000 --teams 2000 --tokens loadtest/tokens.json

load-a:           ## k6 scenario L-A (board)
	$(K6) run loadtest/board.js

load-b:           ## k6 scenario L-B (board, stampedes, churn)
	$(K6) run loadtest/mixed.js

load-c:           ## k6 scenario L-C (10-minute soak)
	$(K6) run loadtest/soak.js

chaos:            ## Kill the API three times under a join workload, then check invariants
	$(PY) backend/scripts/chaos.py

lint:             ## ruff, mypy, eslint
	$(UV) run --project backend ruff check backend database
	cd backend && $(UV) run mypy app
	npm --prefix frontend run lint
