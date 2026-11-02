# Backend

FastAPI app that serves the frontend's static export at `/`, owns `/api/*`, gates the API behind a
session, and keeps the data in SQLite. Parts 2–5 of `docs/PLAN.md`; the nutrition routes arrive in Part 6.

## Layout

- `app/main.py` - the FastAPI app: the lifespan that creates and seeds the database, the session
  middleware, the sign-in routes, the guard, and the static mount. The API routes are declared first and
  the export is mounted at `/` last, so `/api/*` wins the match. `html=True` makes the mount serve
  `index.html` at `/`.
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
  the app, that the hashed bundles load, and that the guard refuses without a session. Skipped when the
  docker daemon is unreachable.
- `tests/conftest.py` - points `NUTRITION_DB` at a temporary file for every test, so no test can reach
  the real database or need a writable `/data`.
- `pyproject.toml` and `uv.lock` - dependencies, managed with uv.
- `Dockerfile` - two stages: `node:26-bookworm-slim` builds the frontend, then the official uv image
  installs the backend and copies the export in. **The build context is the project root, not this
  directory**, because the frontend is part of the build: `docker build -f backend/Dockerfile .`
- `app/db.py` - the schema, the connection settings and the first-run seed. Read `docs/DATABASE.md` for
  the reasoning; `docs/schema.json` is the approved proposal, and a test asserts the two still describe
  the same tables, so the document cannot drift from what runs.

## The database

- **The file is `/data/nutrition.db`**, overridable with `NUTRITION_DB` (which is how the tests get their
  own). `docker-compose.yml` mounts the named volume `nutrition-data` there, so `compose up --build`
  does not wipe the log.
- **Created if it does not exist**, at app startup, and seeded **only when it has never been seeded** —
  the check is whether `users` is empty, made before anything is inserted, so a restart or a rebuild can
  never duplicate the sample (R14).
- **Every connection sets `PRAGMA foreign_keys = ON`.** SQLite defaults it off, and every delete guard is
  a foreign key, so without it the storage-level half of R11 does not exist — silently. `db.connect()` is
  the only place connections are made for that reason.
- **Nothing cascades.** `ON DELETE RESTRICT` everywhere. The API checks first so the refusal can name
  what still uses the record; the constraint is the backstop.
- **A version row** in `meta` means a file written by a different version of the schema is refused with a
  message rather than misbehaving.

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
