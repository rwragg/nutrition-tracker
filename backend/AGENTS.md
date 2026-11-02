# Backend

FastAPI app that serves the frontend's static export at `/`, owns `/api/*`, gates the API behind a
session, and keeps the data in SQLite. Parts 2–6 of `docs/PLAN.md`; the frontend moves onto this API in
Part 7.

## Layout

- `app/main.py` - wires the app together and nothing else: the lifespan that creates and seeds the
  database, the session middleware, the routers, the open health check, and the static mount. The API
  routes are declared first and the export is mounted at `/` last, so `/api/*` wins the match. `html=True`
  makes the mount serve `index.html` at `/`.
- `app/auth.py` - sign-in and the guard: `CREDENTIALS`, the session secret, `POST /api/login`,
  `POST /api/logout`, `GET /api/session`, and `current_user` - the dependency every protected route takes
  to get the user id or a 401 (R2).
- `app/api.py` - the nutrition routes. Thirteen of them: foods and meals CRUD, the days, and the entries.
- `app/db.py` - the schema, the connection settings and the first-run seed. Read `docs/DATABASE.md` for
  the reasoning; `docs/schema.json` is the approved proposal, and a test asserts the two still describe
  the same tables, so the document cannot drift from what runs.

## The API

- **Payloads mirror the frontend's types** - a food carries nested `macros`, a meal carries its
  `ingredients` and its figures, an entry is `{kind: "food", foodId, quantity}` or `{kind: "meal", mealId}`
  - so Part 7 can change where the data comes from without changing its shape.
- **Every route is scoped to the signed-in user** (R2). A record belonging to someone else answers **404,
  not 403**: a 403 would confirm that it exists.
- **`POST /api/days` opens the day for a date**, creating it the first time. The seed can only make the
  days it was seeded with, so without this there is no day for *today* a day later and nowhere to log
  (R4). Idempotent.
- **The two delete guards check before deleting** so the refusal can name what still uses the record
  (R11), as a 409 whose detail carries both a human message and structured `usedBy` lists. The foreign key
  is the backstop. Removing an *entry* is an edit of the day, not a delete of a record, so no guard meets
  it.
- **Figures are computed in SQL** (a meal's from its ingredients, a day's from its foods and meals). The
  tests work the same numbers out in Python from the raw records, which is what makes a wrong sum fail.
- **Validation is pydantic's**: units, sections and macro bounds, and an entry is a food or a meal but
  never both and never neither - the same rule the schema enforces with a CHECK.

## The credentials and the session

- `CREDENTIALS` at the top of `auth.py` is the only place they exist (R1). The frontend sends what is
  typed and renders what the backend decides.
- **The session secret is generated per process**, so restarting the container signs everyone out. A
  persisted secret belongs with the database rather than in the image.
- The session carries a user id, so the registration R3 defers can arrive without a migration.
- `app/static/` - where the frontend's export lands. It holds only a `.gitkeep` in the repository; the
  image build copies `frontend/out` in here. Starlette checks a StaticFiles directory on every request,
  so the directory must exist even when it is empty - without it a request to `/` raises instead of
  404ing.
- `tests/test_app.py` - the health check, the session and the guard: unit tests, no docker needed.
- `tests/test_api.py` - the nutrition routes: each one, both guards, and user isolation. Every expected
  figure is computed here in Python from the raw records.
- `tests/test_db.py` - the schema, the seed and the storage-level guards, straight against the database.
- `tests/test_container.py` - integration: builds the image, runs the container, checks that `/` serves
  the app, that the hashed bundles load, and that the guard refuses without a session. Skipped when the
  docker daemon is unreachable.
- `tests/conftest.py` - points `NUTRITION_DB` at a temporary file for every test, so no test can reach
  the real database or need a writable `/data`.
- `pyproject.toml` and `uv.lock` - dependencies, managed with uv.
- `Dockerfile` - two stages: `node:26-bookworm-slim` builds the frontend, then the official uv image
  installs the backend and copies the export in. **The build context is the project root, not this
  directory**, because the frontend is part of the build: `docker build -f backend/Dockerfile .`

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
