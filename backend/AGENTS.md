# Backend

FastAPI app that serves the frontend's static export at `/`, owns `/api/*`, and gates the API behind a
session. Parts 2–4 of `docs/PLAN.md`; the nutrition routes arrive in Part 6.

## Layout

- `app/main.py` - the FastAPI app: the session middleware, the sign-in routes, the guard, and the static
  mount. The API routes are declared first and the export is mounted at `/` last, so `/api/*` wins the
  match. `html=True` makes the mount serve `index.html` at `/`.
- **The routes.** `/api/health` is open on purpose (the container healthcheck and the start scripts call
  it). `/api/login` and `/api/logout` start and end a session. `/api/session` says who is signed in, and
  `/api/hello` is the Part 2 example route now behind the guard. `current_user` is the dependency every
  protected route takes: it returns the user id from the session or raises 401 (R2), and it is where
  Part 6 will scope rows by user.
- **The credentials.** `CREDENTIALS` at the top of `main.py` is the only place they exist (R1). The
  frontend sends what is typed and renders what the backend decides.
- **The session secret is generated per process**, so restarting the container signs everyone out. A
  persisted secret belongs with the database in Part 5/6 rather than in the image.
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
