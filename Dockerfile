# Multi-stage image: build the web app, install the API with uv, then run migrations and uvicorn.

# Stage 1: web build (index.html gets the absolute site URL for og:url and og:image).
FROM node:22-slim AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ARG CREWLINE_PUBLIC_URL=http://localhost:8000
ENV CREWLINE_PUBLIC_URL=${CREWLINE_PUBLIC_URL}
RUN npm run build

# Stage 2: API runtime with the locked dependencies (no dev group).
FROM python:3.11-slim AS api
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH=/opt/venv/bin:$PATH
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock backend/
RUN pip install --no-cache-dir uv==0.13.7 \
    && uv sync --project backend --locked --no-dev --no-cache \
    && pip uninstall -y uv
COPY backend/app backend/app
COPY database database
COPY --from=web /src/frontend/dist frontend/dist
RUN useradd --system --uid 10001 --no-create-home crewline
USER crewline

# PORT is set by the host (Render sets it); WEB_CONCURRENCY sets the uvicorn worker count (default 1).
ENV PORT=8000 WEB_DIST_DIR=/app/frontend/dist
EXPOSE 8000
CMD ["sh", "-c", "python database/migrate.py && exec uvicorn --factory app.main:create_app --app-dir backend --host 0.0.0.0 --port ${PORT}"]
