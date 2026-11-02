# syntax=docker/dockerfile:1

# 1. Build the frontend into a static export.
FROM node:26-bookworm-slim AS frontend

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# 2. The Python runtime, with the export copied in.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

# Dependencies first, so editing the app does not re-resolve them.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend/app ./app
COPY --from=frontend /frontend/out ./app/static

# Where the database lives. A named volume is mounted here in docker-compose.yml, so the
# log survives a rebuild; creating it in the image means a bare `docker run` works too.
RUN mkdir -p /data

EXPOSE 8000

CMD ["uv", "run", "--no-sync", "--no-dev", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
