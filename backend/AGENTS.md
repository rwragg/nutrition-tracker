# Backend

FastAPI app that serves the frontend's static export at `/`, owns `/api/*`, gates the API behind a
session, and keeps the data in SQLite. Parts 2–6 of `docs/PLAN.md`; the frontend moves onto this API in
Part 7.

## Layout

- `app/main.py` - wires the app together and nothing else: the lifespan that creates and seeds the
  database, the session middleware, the routers, the open health check, and the static mount. The API
  routes are declared first and the export is mounted at `/` last, so `/api/*` wins the match. `html=True`
  makes the mount serve `index.html` at `/`.
- `app/auth.py` - accounts and the guard: `POST /api/register`, `POST /api/login`, `POST /api/logout`,
  `GET /api/session`, and `current_user` - the dependency every protected route takes to get the user id
  or a 401 (R2). **A caller is either a browser session or the bot speaking for a bound chat** (R26):
  `X-Bot-Secret` proves it is the bot and `X-Telegram-Chat` says which log, with the app resolving that
  chat to an account. The connection dependency (`Connection`) and the guarded-caller alias (`User`) live
  here too, because both routers take them.
- `app/passwords.py` - how a password is stored and checked: pbkdf2-sha256 with a salt per password,
  constant-time comparison, and a value that is missing or malformed fails closed. Standard library only,
  so there is no new dependency to keep patched for calling two functions from one.
- `app/telegram.py` - linking a chat to an account (R26, D18): `POST /api/telegram/code` (signed in: the
  app shows this), `POST /api/telegram/bind` (the bot redeems it), and `GET`/`DELETE /api/telegram/link`.
  A code is six characters from an alphabet without I/L/O/0/1, lives fifteen minutes, and is single use -
  which is why it is a row rather than a signature.
- `app/api.py` - the nutrition routes. Twelve of them: foods and meals CRUD, and the dates and entries.
- `app/db.py` - the schema, the connection settings and the first-run seed. Read `docs/DATABASE.md` for
  the reasoning; `docs/schema.json` is the approved proposal, and a test asserts the two still describe
  the same tables, so the document cannot drift from what runs.

## The API

- **Payloads mirror the frontend's types** - a food carries nested `macros`, a meal carries its
  `ingredients` and its figures, an entry is `{kind: "food", foodId, quantity}` or `{kind: "meal", mealId}`
  - so Part 7 can change where the data comes from without changing its shape.
- **Every route is scoped to the signed-in user** (R2). A record belonging to someone else answers **404,
  not 403**: a 403 would confirm that it exists.
- **A day is a date, not an id** (D11). `GET /api/days` lists the dates that have entries; `GET
  /api/days/{date}` returns a date's log, and a date with nothing on it is an **empty day, not a 404**;
  `POST /api/days/{date}/entries` logs into any valid date with nothing to open first. FastAPI validates
  the date in the path, so a junk date is a 422 before it reaches the database.
- **The two delete guards check before deleting** so the refusal can name what still uses the record
  (R11), as a 409 whose detail carries both a human message and structured `usedBy` lists. The foreign key
  is the backstop. Removing an *entry* is an edit of the day, not a delete of a record, so no guard meets
  it.
- **Figures are computed in SQL** (a meal's from its ingredients, a day's from its foods and meals). The
  tests work the same numbers out in Python from the raw records, which is what makes a wrong sum fail.
- **Validation is pydantic's**: units, sections and macro bounds, and an entry is a food or a meal but
  never both and never neither - the same rule the schema enforces with a CHECK.

## Accounts, credentials and the session

- **An account is a row** (R3, R24): a generated id, a username, an email, an optional telegram id and a
  password hash. `POST /api/register` creates one and does not sign it in; signing in is its own step.
- **A password is never stored, compared as a string, logged or returned.** `app/passwords.py` is the
  only place that knows how, and a null or malformed hash fails closed rather than raising.
- **R1's hardcoded credential is superseded, not deleted.** The seeded account carries `user` /
  `password` (`db.SEED_PASSWORD`), hashed, so the app still opens the way it always did and a test pins
  it.
- **A wrong username and a wrong password get the same 401**, and the `register` refusal names the field
  that collided ("that email is already registered") because that is the thing the person has to change.
- **The session secret is generated per process**, so restarting the container signs everyone out. A
  persisted secret belongs with the database rather than in the image.
- **The session carries a user id**, which is what makes every route's scoping (R2) and the isolation
  tests in `tests/test_accounts.py` possible.
- `app/static/` - where the frontend's export lands. It holds only a `.gitkeep` in the repository; the
  image build copies `frontend/out` in here. Starlette checks a StaticFiles directory on every request,
  so the directory must exist even when it is empty - without it a request to `/` raises instead of
  404ing.
- `tests/test_app.py` - the health check, the session and the guard: unit tests, no docker needed.
- `tests/test_accounts.py` - registration, the refusals, password storage, and the isolation between two
  accounts (R24, R25): R2's promise proved against a second user, which is the only way it can be.
- `tests/test_telegram.py` - linking a chat to an account (R26): minting and spending codes, expiry, the
  one-chat-one-account rules, and the bot's door into the nutrition routes - including that an unbound
  chat reaches nothing at all and two bound chats cannot see each other's log.
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
