# Backend

FastAPI app that serves the frontend's static export at `/` and owns `/api/*`. Part 2 and Part 3 of
`docs/PLAN.md`; the nutrition routes arrive in Part 6.

## Layout

- `app/main.py` - the FastAPI app. The API routes are declared first and the static export is mounted
  at `/` last, so `/api/*` wins the match. `html=True` makes the mount serve `index.html` at `/`.
- `app/static/` - where the frontend's export lands. It holds only a `.gitkeep` in the repository; the
  image build copies `frontend/out` in here. Starlette checks a StaticFiles directory on every request,
  so the directory must exist even when it is empty - without it a request to `/` raises instead of
  404ing.
- `tests/test_app.py` - unit tests, no docker needed.
- `tests/test_container.py` - integration: builds the image, runs the container, checks that `/` serves
  the app and that the hashed bundles load. Skipped when the docker daemon is unreachable.
- `pyproject.toml` and `uv.lock` - dependencies, managed with uv.
- `Dockerfile` - two stages: `node:26-bookworm-slim` builds the frontend, then the official uv image
  installs the backend and copies the export in. **The build context is the project root, not this
  directory**, because the frontend is part of the build: `docker build -f backend/Dockerfile .`

## Running

```
uv sync
uv run uvicorn app.main:app --reload --port 8000
uv run pytest
```

## Conventions

- Dependencies are named without versions in `pyproject.toml`; `uv.lock` holds what resolved. That
  keeps "latest versions" true without pinning by hand.
- PEP 8, type hints on the route handlers, and a docstring on each route.
- No emojis.
