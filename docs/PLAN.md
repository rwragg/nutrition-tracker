# Nutrition Tracker — Plan

**Status: draft, for Robert's approval.** Part 1 of the brief is not complete until this is approved.

**Provenance:** this file previously held the brief's terse step list — Parts 1–7, one paragraph each.
It has been replaced by the enriched plan below, in which every part states its own instruction from
the brief and then the detail, the tests and the criteria. The original wording is in git history at
`21f3f7c` if you would rather have it kept verbatim as an appendix.

**Scope: this project is a self-contained unit of work inside this directory.** Its source of truth is
`AGENTS.md`; this document lives in `docs/` with it. Nothing outside this directory is an input — no
earlier plan, no other project, no vault material. What follows is derived from the brief and from
reading the code that is actually here.

## Starting point — read off the repo, not assumed

Verified 2026-11-01:

- `frontend/` is a working, tested MVP: Next.js 16.4.3, React 19.3, Bootstrap 5.3.8 (CSS only, no
  Bootstrap JS), the dark palette from `AGENTS.md`, client-rendered behind a client gate.
- **55 unit and component tests** (Vitest + Testing Library) and **14 Playwright tests**, all green.
- `frontend/lib/`: `types.ts`, `seed.ts` (31 foods, 5 meals, 3 days), `store.ts` (reducer, 8 cases,
  two usage guards), `dates.ts`, `nutrition.ts`, `format.ts`, `targets.ts`, `usage.ts`.
- `frontend/components/`: 17 files — `App`, the three views, `DaySummary`, `MacroBar`, `SectionCard`,
  `EntryRow`, four dialogs, `Dialog`, `styles.ts`, `use-is-client.ts`.
- **The frontend makes no network call at all** — zero matches for `fetch(`, `axios`, `/api/`. It runs
  `useReducer(storeReducer, null, () => createSeedStore())`: state is in memory and resets on reload.
  That is exactly what Part 7 changes, and no part before Part 7 may depend on it changing.
- `backend/` and `scripts/` contain placeholder `AGENTS.md` files and nothing else. There is no `.env`,
  and the root `.gitignore` is two lines: `# IDE` and `.idea/`.

## Requirements

From `AGENTS.md`. R-numbers are assignment order, not reading order. Each is owned by a part below.

- R1 Sign-in, hardcoded to `user` / `password` for the MVP
- R2 A signed-in user sees only their own data
- R3 Registration with a telegram id and an email — **deferred**, see Q1
- R4 Log daily meals
- R5 Entries can be individual foods (e.g. "1 cup rice")
- R6 Entries can be meals — a named group of foods, e.g. "typical breakfast"
- R7 Create, read, update and delete a **food**
- R8 Create, read, update and delete a **meal**
- R9 Track days over time and dig into a day: a history to move between and open, not an archive
- R10 Each day summarised against 2,200 kcal / 140 g protein / 250 g carbs / 70 g fat, held in one place
- R11 A food or meal still in use is never silently removed — the delete is refused and the app names
  where the record is referenced. Nothing cascades
- R12 No more functionality: no archive, no search, no filter
- R13 Priority is a slick, professional UI over feature count
- R14 Opens with dummy data for a few sample days, so the history is visible on the first screen
- R15 Next.js, client-rendered, in `frontend/`
- R16 Python FastAPI backend serving the static Next.js site at `/`
- R17 Docker, `uv` for Python, SQLite created if it does not exist
- R18 Start and stop scripts for Mac, PC and Linux in `scripts/`
- R19 Popular libraries; Bootstrap; as simple as possible with an elegant UI
- R20 The palette and its per-colour assignment exactly as `AGENTS.md` documents, contrast measured
- R21 Latest library versions, no over-engineering, no defensive programming, no extra features, no
  emojis anywhere, minimal README
- R22 PEP 8 — live from Part 2 onward; there is real Python in this stage, unlike the frontend-only one
- R23 The app persists across reloads — see D1 for when this arrives

## Decisions

- **D1 — Persistence is phased, and nothing before Part 7 may assume it.** The frontend stays exactly
  as it is, in-memory and seeded on load, through Parts 2, 3 and 4. The schema is designed in Part 5,
  the API built and tested in Part 6, and the frontend moves onto the API in Part 7 — at which point
  `createSeedStore()` becomes the database's first-run seed instead of the app's state. Why: each part
  stays independently verifiable, and no early part is left depending on storage that does not exist
  yet. Consequence: the brief's "No persistence" describes the *starting point*, not the finished
  product, and has been restated in `AGENTS.md` to say so.
- **D2 — AI is out of scope.** No OpenRouter call, no chat widget, no API key. The brief's OpenRouter
  and `.env` lines are removed. Stated by Robert, 2026-11-01.
- **D3 — Docker, `uv`, SQLite.** One container; the database file is created on first run if absent.
- **D4 — Sign-in is hardcoded, the schema is not.** `user` / `password` for the MVP, but rows carry a
  user id, so R2 holds today and R3 can arrive later without a migration.
- **D5 — FastAPI serves the built frontend at `/`.** `next build` produces a static export; FastAPI
  serves it and owns `/api/*`.
- **D6 — Bootstrap CSS stays the only styling framework**, palette as custom properties bridged into
  `--bs-*`, no colour literal in any component, contrast measured rather than eyeballed.
- **D7 — The existing frontend is the starting point, not a rewrite.** Parts 2–4 add around it and do
  not disturb its tests.
- **D8 — Harden `.gitignore` as Part 2's first substep**, before anything can write a secret or a
  database. The root file currently ignores only `.idea/`, so an untracked `.env` or `*.db` would be
  staged by `git add -A`.
- **D9 — `frontend/AGENTS.md` keeps Next's generated block.** `next dev` writes and re-adds a "This is
  NOT the Next.js you know" block at the top of that file; our description of the code is added around
  it, and the generated block is committed as-is — deleting it only recreates an uncommitted change.
- **D10 — Planning documents live in `docs/`.** The `PLAN.md` at the project root predates this
  document and is left untouched; it is not an input to any part here. *(It now carries a superseded
  banner pointing here, because it is a trap for anyone who reads it as current.)*
- **D11 — A day is a column, not a table.** Decided in Part 6, at Robert's question, after the schema
  had been approved and built with a `days` table. An entry carries its own `date` (and its own
  `user_id`). A day of the log is the entries sharing a date; a date with nothing on it reads as an
  empty day rather than a 404; no row has to be created before anything can be logged. The cost is a
  stored empty day and a home for day-level facts, neither of which any requirement asks for, and both
  recoverable later with a side table joined on the date. The schema version went 1 to 2.
- **D12 — The browser holds a copy, never the truth.** Part 7 made the frontend a client of the API:
  one module talks to the network, one hook reads the records and re-reads them after every write, and
  nothing is edited locally and hoped for. The visible consequence is that a food edit moves every day
  that logs it without the client knowing which days those are, and that a refused delete is an answer
  the dialog renders rather than a rule the client predicts. The day chips show the server's figure;
  the summary and section subtotals are the app's own arithmetic over what it fetched, and a test
  asserts both so a disagreement fails instead of being hidden.

## Part 1 — Plan · **complete**

The brief: enrich the step list with substeps as a checklist, tests and success criteria per part, add
an `AGENTS.md` in `frontend/` describing the existing code, and get Robert's approval.

- [x] Read the repo rather than trusting the brief's description of it
- [x] Requirements (R1–R23) and decisions (D1–D10) written down
- [x] This document, with per-part substeps, tests and success criteria
- [x] `AGENTS.md` reconciled with D1 and D2
- [x] `frontend/AGENTS.md` describing the existing code (D9) — delivered in `de729f9`; the box was left
      unticked at the time and is ticked here
- [x] **Robert approves this plan — gate: no part below starts before this** — approved in session, and
      Parts 2–7 each ran only after the go-ahead at their own gate. Recorded at close-out on
      2026-11-01, which is late: the heading said "in review" for the whole build even though the
      approval had been given and acted on.

**Success criteria:** P1.1 every requirement in `AGENTS.md` appears as a numbered R with an owning part ·
P1.2 every part states its substeps, tests and success criteria · P1.3 the persistence sequencing is
explicit and no part before Part 7 depends on storage · P1.4 approval recorded.

## Part 2 — Scaffolding: Docker, FastAPI, scripts

The brief: stand up Docker, the FastAPI backend in `backend/`, and start/stop scripts in `scripts/`;
serve a hello-world page and make an API call to prove it runs locally.

- [x] Harden `.gitignore` first (D8): `node_modules/`, `.next/`, `out/`, `*.db`, `.env*`, `__pycache__/`, `.venv/`
- [x] `backend/` FastAPI app on `uv`: `pyproject.toml`, a health route, one example `/api/` route
- [x] `Dockerfile` plus a compose file (or a documented `docker run`) building the backend
- [x] `scripts/`: `start` and `stop` for Mac/Linux plus Windows `.bat`, all driving the same container
- [x] A static hello-world page served at `/`, and the example API route answering
- [x] `backend/AGENTS.md` and `scripts/AGENTS.md` filled in: purpose, layout, how to run
- [x] README updated: how to start and stop the stack

**Tests:** `pytest` unit tests for the routes through FastAPI's test client · one integration test that
builds the image, starts the container, and asserts both `/` and the API route answer · `docker build`
is part of the test run.

**Success criteria:** P2.1 `docker build` exits 0 · P2.2 one script starts it, one stops it · P2.3 `/`
returns the hello-world page · P2.4 the API route returns 200 with a JSON body · P2.5 backend tests
green · P2.6 after a run, `git status` shows no build output, database file or `.env` staged.

### Status — Part 2, complete 2026-11-01

All six criteria met, each verified by running it rather than by reading the code:

- **P2.1** `docker build` exits 0; the image has the expected layers (`uv sync --frozen --no-dev`,
  `COPY app`, the uvicorn `CMD`).
- **P2.2** `scripts/start.sh` exits 0 in 2.6s — it builds, starts, waits for the health check and
  prints the URL; `scripts/stop.sh` exits 0 and the container is gone afterwards. Both scripts exit 1
  with a message when docker is unreachable, which was tested by running them while it was.
- **P2.3** `/` returns 200, `text/html`, with the page's title — from inside the container and through
  the published port.
- **P2.4** `/api/health` and `/api/hello` return 200 with JSON; an unknown path returns 404.
- **P2.5** `uv run pytest` → **7 passed**: 5 unit tests, and 2 that build the image, run the container,
  check it answers and remove it afterwards.
- **P2.6** after a full build and run, `git status` shows nothing but intended edits, and there are no
  stray database files.

**Two things learned here, worth keeping:**

- **Docker access on this machine needed an ACL, not group membership.** The docker snap's daemon is
  started with `--group docker`, but the socket still comes up `root:root`, and with `linger` enabled a
  logout does not refresh the group list the gateway runs under. An ACL for the user's own uid works
  immediately and is narrower than the group would be. The socket is recreated whenever the daemon
  restarts, so the ACL is re-applied by a oneshot `docker-socket-acl.service` ordered after the snap's
  unit — which should also carry `PartOf=snap.docker.dockerd.service` so a docker snap refresh does not
  leave the ACL behind.
- **A readiness loop must catch `OSError`, not `URLError`.** Docker's port proxy accepts connections as
  soon as the port is published and resets them until the app inside is listening, so an early attempt
  fails with `ConnectionResetError` — which is not a `URLError`. That bug made the container tests error
  on their first run against a container that was in fact healthy.

## Part 3 — Add in the frontend

The brief: the frontend is statically built and served so the tracker appears at `/`, with
comprehensive unit and integration tests.

- [x] Configure the Next app for static export and build it inside the image
- [x] FastAPI serves the exported assets at `/`, client routes still resolving
- [x] Confirm the palette and all three views survive being served from a different origin than `next start`

**Tests:** the existing 55 unit/component tests and 14 Playwright tests keep passing · Playwright now
runs against the container rather than `next start` · a test asserting `/` returns the app's HTML and
not a directory listing.

**Success criteria:** P3.1 the tracker renders at `http://localhost:<port>/` from the container ·
P3.2 all three views work · P3.3 zero console errors · P3.4 the frontend's own suites are still green ·
P3.5 no change to the frontend's state handling (D1).

### Status — Part 3, complete 2026-11-01

All five criteria met:

- **P3.1** `/` returns 200 `text/html` (8,765 bytes) with `<title>Nutrition Tracker</title>` and the
  layout's shell class, and the hashed `_next` bundles it references all return 200 with the right
  content types — HTML alone would prove nothing, so the bundle check is a test of its own.
- **P3.2** all three views render from the container: the Day view shows the seeded day's 2,208 kcal,
  Foods lists the 31 seeded foods, Meals lists the 5 seeded meals; checked in a browser against the
  container rather than against `next start`.
- **P3.3** zero console errors — the existing e2e spec attaches console and pageerror listeners to
  every test, so this is asserted 14 times over.
- **P3.4** 55 unit and component tests, and **14 Playwright tests, all passing against the container**;
  backend suite 7 passed.
- **P3.5** the frontend's only changes this part are `next.config.ts` and `playwright.config.ts` —
  `components/` and `lib/` are untouched, so the in-memory store is exactly as Part 2 left it.

**Three things learned here:**

- **Export mode rules out PPR, and the error is not obvious.** `output: "export"` fails the build with
  *"Invariant: PPR cannot be enabled in export mode"*. The cause was `partialPrefetching: true`, and
  then `cacheComponents: true` (which enables the same machinery). Both were dropped: the app holds its
  data in memory and uses no `use cache` directives, so neither was load-bearing.
- **`check_dir=False` does not make StaticFiles tolerate a missing directory.** Starlette re-checks the
  directory on every request, so a bare checkout would have raised a 500 rather than answering 404. The
  fix is to keep the directory itself in the repository with a `.gitkeep`. The unit test caught this.
- **A browser suite that manages its own stack collides with one already running.** `reuseExistingServer`
  is now false only in CI: locally the browser tests use the stack that is up, and CI builds fresh so
  the committed source is what gets tested.

## Part 4 — Fake sign-in

The brief: hitting `/` requires the dummy credentials `user` / `password` to see the tracker, and you
can log out.

- [x] A sign-in screen, with a session cookie issued by the backend (R1)
- [x] Log out clears the session
- [x] While signed out the app shows the sign-in screen and **every `/api` route refuses**
      (restatement of the original wording — see the note under this part's criteria)
- [x] The session carries a user id, so R2 holds and R3 can land later (D4)

**Tests:** backend tests for the auth route — correct, incorrect and absent credentials · a test that
each protected route refuses without a session · Playwright: sign in, use the app, log out, and a
direct navigation to `/` while signed out.

**Success criteria:** P4.1 `user`/`password` gets in; anything else does not · P4.2 while signed out the
app renders the sign-in screen and every `/api` route returns 401 — **the data is unreachable, not the
markup** (see below) · P4.3 log out works and is tested · P4.4 no credentials are hardcoded in the
frontend bundle · P4.5 the frontend's existing tests still pass.

**On P4.2, stated precisely.** As first written this read "the tracker is unreachable while signed
out". A static export cannot promise that: the HTML shell and the JavaScript are served by the static
mount, and no server-side gate can hide a file that the browser must download. What *can* be protected
is the data — so the promise is that while signed out the app renders the sign-in screen, **every
`/api` route refuses without a session**, and by Part 7 the tracker's data only ever arrives through
those routes. A container test asserts the restated behaviour so it stays a decision rather than an
accident.

### Status — Part 4, complete 2026-11-01

All five criteria met, and the restatement above is what was built:

- **P4.1** `user` / `password` signs in; a wrong password, an unknown user and a malformed body are all
  refused (401, 401, 422), asserted in the backend suite; the browser tests sign in for real over HTTP
  with a cookie jar.
- **P4.2** while signed out the app renders the sign-in screen and **both protected routes return 401**
  (`/api/session`, `/api/hello`), asserted in the unit suite, in the container tests against the running
  image, and in the browser. The e2e suite also asserts *by name* that the shell is public, so the
  restatement stays a decision rather than drifting into an accident.
- **P4.3** logging out clears the session: `/api/session` and `/api/hello` both go back to 401, and the
  app returns to the sign-in screen — covered in the unit suite, the browser suite and the API tests.
- **P4.4** the credentials exist in exactly one place, `backend/app/main.py`. Checked rather than
  assumed: no credential literal appears anywhere in the frontend source, and the only `password`
  strings in the served bundles are React's own input-type handling (verified against the chunks the
  container actually serves). The one frontend reference is in `test/fetch-stub.ts`, which never ships.
- **P4.5** 59 unit and component tests pass (55 before, 4 new for the gate) and 19 Playwright tests pass
  against the container (14 existing, now signing in first, plus 5 for the gate).

**Four things learned here:**

- **A 401 is logged as a console error by the browser.** The suite's "no console errors" assertion failed
  on the session probe's own 401 — the app working, not failing. The fix was to make the assertion
  *precise* (ignore the 401 from `/api/session` and `/api/login` only) rather than to drop it.
- **Next.js ships its own `role="alert"` route announcer.** `getByRole("alert")` matched two elements and
  failed in strict mode while the app was behaving correctly. Scope such selectors to the panel.
- **`replace_all` can rewrite the helper you just added.** Replacing every `page.goto("/")` with a call to
  the new `openTracker()` also rewrote the one inside `openTracker` itself, making it recurse. The diff
  showed it; nothing else would have.
- **A session check changes the timing of every existing frontend test.** The app no longer renders the
  tracker synchronously, so the 14 component tests now await the session, and every browser test signs in
  first.

## Part 5 — Database modelling

The brief: propose a schema for the nutrition tracker, saved as JSON, documented in `docs/`, with user
sign-off.

- [x] Propose the SQLite schema — users, foods, meals, meal ingredients, days, entries — as JSON
- [x] Document the approach in `docs/` and get Robert's sign-off before any code depends on it
- [x] State the delete behaviour: R11's refusal is enforced where the data lives, not only in the UI
- [x] State what the first-run seed is, and that it runs only against an empty database

**Tests:** a schema test creating the database from empty, asserting the tables, the keys, and the
refusal to cascade.

**Success criteria:** P5.1 the schema is documented and approved · P5.2 creating the database from
nothing works and is tested · P5.3 R11's guard exists at the storage layer · P5.4 no code is written
against the schema before approval.

### Status — Part 5, complete 2026-11-01

Approved as proposed (all four decisions at the end of `docs/DATABASE.md`), then implemented and
verified:

- **P5.1** the schema is documented (`docs/schema.json`, `docs/DATABASE.md`) and approved.
- **P5.2** creating the database from nothing works: a missing file becomes all seven tables and all
  seven indexes, the version row is written, and the seed fills it — 31 foods, 5 meals, 19 meal
  ingredients, 3 days, 17 entries, dated today and the two days before. Opening it again re-seeds
  nothing. *(Revised 2026-11-01: the `days` table was dropped — a day is the date on an entry. Six
  tables now, and the seed's three days are the three dates its entries fall on. See Part 6's status
  and `docs/DATABASE.md`.)*
- **P5.3** R11's guard exists at the storage layer: with `PRAGMA foreign_keys = ON`, deleting a food a
  meal uses, a food a day logs, or a meal a day logs each raise; deleting a food nothing references is
  allowed. Asserted directly against the database, with nothing above it checking.
- **P5.4** no code was written against the schema before approval — the proposal was committed
  (`9bc9cae`) and the implementation came after.

**Verified in the running container, not only in tests:** the image creates and seeds `/data/nutrition.db`
on startup (98304 bytes, schema version 1, 31 foods, 3 days); the guard refuses inside it; a marker row
I wrote survived a full `compose down` + image rebuild + restart; and the seed did **not** re-run across
that rebuild (32 foods with the marker, not 63; 3 days, not 6; 17 entries, not 34). That is the volume
decision and the seed-once rule both proven on the artifact.

**One thing this part found:** the schema test that compares `db.py` with `docs/schema.json` is the
reason to keep the proposal in the repository — the two are now checked against each other, so the
document cannot quietly drift from what runs.

## Part 6 — Backend

The brief: API routes letting the backend read and change a given user's tracker data, thoroughly
tested with backend unit tests, creating the database if it does not exist.

- [x] CRUD routes for foods and meals (R7, R8)
- [x] Routes for days and entries, including the day's summary figures (R4–R6, R9, R10)
- [x] Both delete guards, returning *where* the record is referenced (R11)
- [x] Every route scoped to the signed-in user (R2)
- [x] Database created if absent (R17)

**Tests:** `pytest` per route; each guard refusing and naming the reference; a second user unable to
see the first user's data; the day's totals computed independently of the API and compared.

**Success criteria:** P6.1 every route has tests · P6.2 both guards demonstrably refuse and name the
reference · P6.3 user isolation tested with two users · P6.4 the database is created when absent ·
P6.5 the frontend is unchanged and still green.

### Status — Part 6, complete 2026-11-01

Implemented in `app/api.py` (the routes), `app/auth.py` (sign-in and the guard, moved out of
`main.py`) and `main.py` (which now only wires the app together).

- **P6.1** all thirteen routes have tests: `GET/POST /api/foods`, `PUT/DELETE /api/foods/{id}`,
  `GET/POST /api/meals`, `PUT/DELETE /api/meals/{id}`, `GET /api/days`, `POST /api/days`,
  `GET /api/days/{id}`, `POST /api/days/{id}/entries`, `DELETE /api/days/{id}/entries/{id}`.
- **P6.2** both guards refuse and name the reference: 409 with a human message *and* structured
  `usedBy` lists, naming the meals that use a food and the dates that log a food or a meal.
- **P6.3** isolation is tested with a second user's records in the same database: invisible in every
  list, 404 rather than 403 on direct access, and unwritable. There is one credential (R1), so the
  second user's rows are written straight to the database — the API cannot create them, and that is
  the point.
- **P6.4** the database is created and seeded by the app's startup, so every one of these tests runs
  against a database that did not exist a moment earlier.
- **P6.5** the frontend is unchanged apart from one line in its e2e suite, which pointed at a route
  this part retired.

**Figures are checked by a second implementation.** Every expected number in the tests is worked out
in Python from the raw records — a meal's figures from its ingredients, a day's from its foods and
ingredients — never from the API's own arithmetic. The arithmetic under test is SQL joins; Python is
the independent check.

**One requirement this part had to add, and one it then removed.** The plan's substeps had no way to
create a day, and the seed can only make the days it was seeded with, so a day later there was no day
for *today* and R4 — log your meals — would have been impossible. `POST /api/days` was added to open a
day on demand. Then Robert asked whether a day should just be a column, and the answer was yes: the
`days` table was dropped, the date moved onto the entry, and with it `POST /api/days` disappeared
entirely. A day is now the entries sharing a date, an empty date reads as an empty day rather than a
404, and logging any date needs nothing opened first. See `docs/DATABASE.md` for the full reasoning and
what it cost. The schema version went 1 to 2 with the change, so an existing file is refused rather than
misread.

**Two routes carry deliberate choices worth knowing.** `/api/hello` (the Part 2 demonstration route)
is retired now that real routes exist; another user's record answers 404, not 403, because a 403
would confirm that the record exists.

**Verified in the running container over HTTP**, not only in the unit suite: signed out the API
refuses; signed in it lists 31 foods, 5 meals and the 3 seeded dates; a food logged for 2 cups moved the
day by exactly 200 kcal and 20 g protein and the lunch section with it; deleting the food while the day
used it gave 409 naming the date; removing the entry gave the food back and the day back to its earlier
figure; a date with nothing on it read as an empty day and then accepted an entry; and signing out
closed the API again.

## Part 7 — Frontend + Backend · **persistence lands here**

The brief: the frontend actually uses the backend API, so the app is a properly persistent nutrition
tracker, tested thoroughly.

- [x] Replace `useReducer` + `createSeedStore()` with calls to the API
- [x] The seed becomes a first-run database seed rather than app state (D1, R14)
- [x] Loading and error states for the calls that now exist
- [x] Re-point the tests that assert against the pure reducer — expect the shape of three test files to
      change, not only their assertions

**Tests:** the full Playwright suite against the container · a reload test proving data survives (the
definition of R23) · both delete guards end to end · a second browser session seeing the same data.

**The flakiness carried in from Part 6 is fixed here, twice over.** The suite ran `fullyParallel` with
unbounded workers against one container and threw a different timeout every few runs. Two causes, both
addressed: the tests now share a real database, so it runs **one worker**; and the e2e helper signed in
through the form, which raced the app's own session probe — `isVisible` does not wait — so it now signs
in through the page's request context, which shares its cookie jar. Three consecutive runs of the whole
suite came back 22/22.

**Success criteria:** P7.1 data survives a reload and a container restart · P7.2 all three views still
work · P7.3 both guards still refuse with the reason shown · P7.4 zero console errors · P7.5 no
in-memory store remains as a source of truth.

### Status — Part 7, complete 2026-11-01

The frontend is the API's client. `lib/api.ts` is the only code that touches the network;
`lib/use-tracker.ts` reads the records, writes through the API, and re-reads after every write, so what
is on screen is what was last reported. `lib/store.ts` (the reducer), `lib/seed.ts` and the reducer's
test file are **deleted** — the seed is the backend's first-run job and there is no client-side store
left to be a source of truth.

- **P7.1** data survives a reload — the Playwright test *the log survives a reload* logs a food, reloads
  the page and finds it there — **and a container restart**: a script wrote a food and an entry through
  the API, stopped the stack, rebuilt the image, started it again, and read them back, with the seed
  correctly not re-running (32 foods, not 63).
- **P7.2** all three views work against the API: the screenshots in `docs/screenshots/` are of the
  running app, and the suite asserts each view's figures.
- **P7.3** both guards refuse with the reason shown: the dialogs no longer predict the rule at all —
  they ask, and render the server's refusal. The client's formatting keeps the app's own day labels
  ("Today"), which is what the structured `usedBy` was for.
- **P7.4** zero console errors, with two deliberate exceptions spelled out in the test that asks for
  them: the 401 from the session probe when signed out, and the 409 from a refused delete. Both are the
  app working; the browser logs any 4xx as a console error, so they are counted out by status rather
  than dropped.
- **P7.5** nothing in the browser is a source of truth. The day chips show the server's figure for each
  date, and the summary and section subtotals are the app's arithmetic over the entries it fetched —
  a test asserts both, so if they ever disagree it fails rather than silently picking one.

**A real bug this part found, which no unit test could have.** The API's per-request database
dependency closed its connection in FastAPI's dependency cleanup, which runs on a *different threadpool
thread* from the route body — so `sqlite3` raised `ProgrammingError` and the request answered 500,
intermittently, under a real server. The 80 backend tests never saw it because `TestClient` runs on one
thread; the browser suite hit it within minutes. Fixed once, in `db.connect`, with the reasoning written
down there.

**Two things the frontend tests taught the suite.** The component tests now run against a stand-in
server (`test/fetch-stub.ts`) over a small world written out by hand (`test/fixture.ts`) — the sample
data is the backend's, so the frontend tests no longer derive from it, and the fixture's figures are
computed independently, which is what makes comparing them to the app's maths mean anything. And the
browser suite builds **its own stack** — its own compose project, volume and port, thrown away before
every run — so it always starts from a freshly seeded database without touching the developer's.

**Suites:** 80 backend · 35 unit and component · 22 Playwright, three runs in a row · tsc and lint clean.

*(Corrected at close-out, 2026-11-01: the unit and component figure was 35 as this part left it.
Commit `a5b62a9` then closed the coverage gaps the failure paths were hiding and took that suite to
**74**, so 35 is the figure at Part 7's end and 74 is the figure now. The README carried the stale one
until Part 8.)*

## Part 8 — Handover

- [x] README accurate: start, stop, and where the database file lives
- [x] `curl` on the served URL returns the app
- [x] Screenshots of all three views plus the sign-in screen
- [x] A completion report listing every success criterion above with its evidence
- [x] Server left running and ready

**Success criteria:** P8.1 the README matches reality · P8.2 `curl` returns the app · P8.3 screenshots
captured · P8.4 every P-criterion accounted for, met or explicitly not met.

### Status — Part 8, complete 2026-11-01

The report is `docs/COMPLETION-REPORT.md`, which carries all of P1.1 to P8.4 with the evidence for each
and states plainly where any was met differently. The short version:

- **P8.1** the README was already true about starting, stopping, the port, the credentials and the
  database file in its volume — checked against the running stack rather than re-read. One number was
  stale: it claimed 35 unit and component tests where `a5b62a9` had taken the suite to 74. Corrected,
  and corrected here rather than quietly.
- **P8.2** run, not described: `/` returns `200 text/html`, 8,765 bytes, with the app's title; the
  health route answers 200 and a protected route answers 401 signed out.
- **P8.3** the four screenshots were already in `docs/screenshots/` and are of the running app.
- **P8.4** every criterion is accounted for in the report; none was dropped.

**Re-verified at close-out, on this machine:** 80 backend tests, 74 unit and component, lint and `tsc`
clean, 22 browser tests, container healthy on `http://localhost:8000`.

**Two things the browser suite was hiding, both now written down in the report.** Across 29 runs today,
4 failed a single test, and neither cause is the app:

- **A rare transport failure.** 3 runs failed on `net::ERR_NETWORK_CHANGED` in the console, a different
  test each time — the browser failing to fetch while docker rebuilt the network around the run. Left as
  a stated decision; the narrow fix is Robert's to call.
- **An unsound test, now fixed.** *logs a meal and expands it into its foods* added a meal the sample's
  Dinner already held and then asserted on the whole section, so it passed by asserting against the
  seeded row before the app's re-read, and failed on a strict-mode violation when the re-read won. Its
  cleanup also removed the seed's own dinner, so later tests read a day the seed never wrote. It now
  picks a meal the day does not hold, waits for the `POST` and asserts inside `entry-<created id>`, and
  deletes only what it wrote. Six consecutive full runs green afterwards; a six-test run leaves today at
  the seed's own 2,207.5 kcal.

## Part 9 — Telegram skeleton · **the front end, in a chat**

The brief: "use telegram for any user to adjust their foods, meals etc." — restated for the first
cut, because the full reading is a product and this is a slice of it. Robert's word: *"build the
skeleton"*.

**What a skeleton means here:** the thinnest thing that runs end to end and can be measured. Two
commands, one each way, against the API that already exists — and the one domain change that the
whole chat direction depends on, because the app could not express a weighed portion.

- [x] The gram basis: `g` as a unit, end to end (type, API literal, CHECK constraint, frontend)
- [x] The first migration, 2 → 3, so a file written before `g` is carried forward rather than refused
- [x] A bot service in the repo: long polling, no public URL, no webhook, no new dependency
- [x] `/today` — read the day back, sums only
- [x] `/log <food> <quantity> <unit> [section]` — write one entry
- [x] Opt-in behind a compose profile, so a missing token cannot take the app down
- [x] Tests for both commands, the refusals, the migration and the start-up path
- [x] Documented: this part, the README, `docs/DATABASE.md`, `.env.example`

**Tests:** the bot's parsing, name resolution and both commands through a stub client · the
migration, from a real version-2 file, asserting every row survives and the guards still bite · a
live check that the volume migrates in place and that grams log correctly through the API · the
bot's start-up path, run in the container with no token.

**Success criteria:** P9.1 a weighed portion can be recorded and totals correctly · P9.2 a version-2
file migrates with no row lost · P9.3 `/today` reports what the app holds, not a copy of it · P9.4
`/log` writes an entry the web app then shows · P9.5 every refusal names what to do instead, and
nothing is written when one fires · P9.6 the bot cannot be started without a token, and says why ·
P9.7 the app, its scripts and its browser suite are unaffected by the bot's existence.

**Decisions taken (D13–D15):**

- **D13 — `g` is a per-gram basis, not "per 100 g".** A food recorded in grams carries its macros
  per gram, so 183 g of yogurt at 0.61 kcal/g logs 111.63 kcal. The alternative — a "per 100 g"
  unit — reads more like a label but makes every quantity a division, and the arithmetic here is
  exact either way. This is the decision to revisit if the catalogue is ever imported from USDA
  rows, which are per 100 g.
- **D14 — the bot is a client, not a second implementation.** It holds no records and computes no
  macros; it asks the API. That is why a food edited in the web app moves what the bot reports, and
  why the bot cannot disagree with the app. It signs in with the MVP credential, so it writes the
  one log that exists — per-user accounts are R3 and are not built.
- **D15 — no natural-language parsing yet, and the targets stay in the frontend.** Turning "a cup of
  rice and a banana" into entries needs a model or a grammar, and AI is out of scope by the brief's
  own decision (D2). Text that is not a command gets a hint rather than a guess. The bot reports
  sums and applies no target, because R10 puts the targets in one place — `frontend/lib/targets.ts` —
  and the API returns sums rather than judgements.

### Status — Part 9, complete 2026-11-02

Every criterion met, each verified by running it rather than by reading the code.

- **P9.1** a weighed portion records and totals correctly: a food created through the live API at
  0.61 kcal/g logged 183 g as **111.63 kcal / 18.3 g protein**, and the day moved by exactly that.
  The food and the entry were then deleted, leaving the log at its own 2,207.5 kcal and 31 foods.
- **P9.2** a version-2 file migrates with nothing lost: the **real** database from the pre-change
  snapshot was migrated in place — version 2 → 3, 31 foods / 5 meals / 19 meal ingredients / 17
  entries all present afterwards, `PRAGMA foreign_keys` back on, the seeded entries still resolving
  to their foods, the delete guard still refusing, and an unknown unit still a 422.
- **P9.3** `/today` reports what the app holds: it asks `/api/days/<today>` and formats the answer;
  the only thing it computes is the display.
- **P9.4** `/log` writes an entry the web app shows: the entry was posted to the API, read back
  through a second request, and the section total came back with it.
- **P9.5** every refusal names what to do instead, and writes nothing: an unknown food ("add it in
  the app first"), an ambiguous name (the candidates are listed), a unit that disagrees with the
  food's own ("recorded in g, not cup"), a malformed command (the usage), a 4xx from the app
  ("nothing was logged"), and an unreachable app. Each is asserted, and each asserts that no entry
  was posted.
- **P9.6** the bot cannot start without a token: run in the container with none, it prints
  `TELEGRAM_BOT_TOKEN is not set; the bot has nothing to listen on.` and exits **1**.
- **P9.7** the app is unaffected: `docker compose config` still resolves, `docker compose up` still
  starts the backend alone (the bot is behind the `bot` profile), `./scripts/start.sh` still exits 0
  after the health check, and the backend suite is **124 passed** — the 80 it had, plus 39 for the
  bot and 5 for the migration and the units.

**Two things learned in the building, worth keeping:**

- **A second definition of a function silently wins.** Repairing the migration, an old
  `create_schema` was left in the file below the new one, so the *older* body was what ran — Python
  takes the last definition. It was caught by reading the file rather than by a test, which is the
  argument for reading a diff you have just written.
- **The tests found three things the parser did not do.** `cups` for `cup` (people type plurals), a
  dictated name without the comma in a stored one ("greek yogurt weighed" against "Greek yogurt,
  weighed"), and a two-token command with no food. All three are now handled in code — the tests
  were right and the parser was wrong, which is the order to fix them in.

**Not in this part, stated so it is not mistaken for done:** natural-language dictation, voice,
photo meals, per-user accounts, and anything that changes a food or a meal from the chat. The
skeleton logs and reads; it does not edit.

## Part 10 — other people · **draft for approval, nothing built**

Robert's constraint, 2026-11-02: *"If I let other people use, I don't want them to need hermes."*

**What that turned out to mean.** Nothing has to be removed. The application and the bot contain no
reference to Hermes, the vault or Obsidian — and no dependency on any of them. The check, so it is
repeatable rather than remembered: `git grep -niE "hermes|obsidian|vault" -- ':!*package-lock.json'`
over the repository matches **only documentation** — this plan, the completion report and the resume,
each quoting a workspace path like `~/hermes_workspace` — and it matched one comment in `.env.example`
that pointed at a script in `~/.hermes`, **now removed**, because a file a stranger copies should not
describe Robert's machine. Without that lockfile exclusion it also matches `hermes-parser`, a Meta npm
package unrelated to any of this. Nothing under `backend/`, `frontend/app|components|lib`, the
`Dockerfile` or the compose file matches at all, and `grep -rl` over `/app` inside the built image
finds nothing either.

Hermes is a front end *Robert* uses for *his* own logging, into the vault, which is a different log from
the app's database. So Part 10 is not "take Hermes out"; it is **make R3 real**, so the app can hold more
than one person and each of them reaches it with nothing but a browser or a chat.

**Why this is small on the data side.** Every route already scopes by `user_id` (R2), every table carries
it, and `users` exists — D4 shaped the schema for R3 in Part 5 precisely so it would need no migration.
The only single-user thing in the application is `CREDENTIALS = {"user": "password"}` in
`backend/app/auth.py`, one constant in one file. The work is identity, not structure.

**Requirements (R24 onward — these are proposals, not yet requirements):**

- **R24 — Anyone can make their own account**, with a Telegram id and an email as R3 asks, without an
  operator touching the database or a file. *Check:* register two accounts through the API alone, sign
  in as each, and get a session back; nothing in the path requires shell access.
- **R25 — Two accounts cannot see or touch each other's log.** *Check:* as account A, reading B's day,
  editing B's food and deleting B's entry each fail and write nothing; A's own day still totals what it
  did. This is R2 restated as the test that proves it, because R2 has never been tested against a
  second user — there has only ever been one.
- **R26 — The bot knows who it is talking to.** A chat is bound to exactly one account, and an unbound
  chat is refused with how to bind, rather than being refused vaguely or silently served someone else's
  log. *Check:* an unbound chat gets a refusal and no entry is written; once bound, `/log` writes into
  that account's day and `/today` reads back that account's figures, not another's.
- **R27 — No user needs Hermes, the vault, Obsidian, or any agent runtime.** *Check:* a test that scans
  what actually ships — `backend/`, `frontend/app|components|lib`, the `Dockerfile`, the compose file,
  and every file in the built image — for those names, and fails if it finds one. Scoped deliberately:
  scanning the whole repository would fail on this plan and on a lockfile entry called `hermes-parser`,
  neither of which any user ever runs, and a check that cries wolf gets switched off. Plus a documented
  run from a clean host with nothing but Docker.
- **R28 — A voice note is transcribed by the bot itself.** The transcript is then treated exactly as
  typed text — the same commands, the same refusals, the same nothing-written-when-a-refusal-fires.
  *Check:* a fixture voice note through the API produces the entry the same words would have.
- **R29 — A person can leave.** Their account and its log can be removed by them, and the deletion
  names what it would take with it. *Check:* delete an account, then assert it is gone and no row
  refers to it. R11's `RESTRICT` makes this a decision rather than a line of code: something must
  decide what "delete my account" means for the foods a meal still uses.
- **R30 — It runs somewhere other than Robert's machine**, reachable over TLS, with the token and the
  session secret in the environment rather than in the image. *Check:* the app answers on a host that
  is not this one, and a rebuild there keeps the log.

**Decisions to take before building (these are the real content of this draft):**

- **D16 — what transcribes a voice note.** Local whisper.cpp baked into the image (no key, no per-use
  cost, a bigger image, CPU time per note) or a cloud STT call (a key in `.env`, per-use cost, no image
  weight). Robert already runs whisper.cpp locally with `medium.en`, so the local option is proven on
  this machine — the question is whether it belongs in a stranger's container. **This one also decides
  whether D2 still holds**: D2 banned AI as an OpenRouter call, key and chat widget, and a local
  transcription model is none of those three but is still a model. Answer that honestly rather than by
  looking for the loophole.
- **D17 — what the email in R3 is for.** Telegram is the identity a chat arrives with. If email is the
  login and Telegram is linked to it, there are two things to verify and one to recover; if Telegram is
  the identity and email is a contact address, there is one. R3 asks for both without saying which is
  which, and this draft should not guess.
- **D18 — how a chat binds to an account.** A code the app shows and the chat redeems, or a `/login`
  in the chat with credentials typed into Telegram. The second puts a password into a chat history,
  which is reason enough to prefer the first.

**Open questions this draft raises rather than answers:**

- **R12 says no search and no filter.** With one person and 31 seeded foods that is a discipline; with
  strangers and their own foods it may be a wall — a catalogue you cannot search is a catalogue you
  cannot use. Reversing R12 is allowed (it has been done before, in writing) but it should be reversed
  deliberately, not discovered in the middle of building a catalogue.
- **Whose log is the log?** If the app becomes Robert's own, the `vault-logging` pipeline and the daily
  summary would be retired in favour of it — a change to his own habit, his vault's history and his
  cron, and therefore his decision. Nothing in R24–R30 requires it, and this draft assumes neither
  way.
- **What is "other people" in numbers?** Two friends and two hundred are different builds: the first is
  accounts and a VPS, the second is backups, rate limits, abuse handling and a way to answer a support
  question. Worth naming before the first line of code.

**Order, if approved — each step gated, none started:**

1. Accounts and registration (R24), with the isolation tests (R25) written first, as the part that
   proves the schema was right.
2. The bot's binding (R26), which is what makes a second person's chat safe rather than shared.
3. Voice (R28), gated on D16 — it is the only genuinely new machinery here, and the only capability
   Hermes is quietly lending Robert today.
4. Leaving (R29) and hosting (R30), gated on D17, D18 and the numbers question.

**Size, honestly.** The app's own calibration: Part 9 — a bot with two commands, a new unit through four
layers, the first migration and 44 tests — took about a day. On that basis this is roughly **4 to 6 days
of building**, with the calendar set by the decisions above (D16 and R12 are the two that can change the
work) rather than by the code. Nothing here is research; it is all work whose shape is known.

**Staged inert.** No code, no schema change, no bot change, no new file outside this plan. Robert
approves, amends or drops it before anything is built, and if it is approved it is built one numbered
step at a time, each stopping for approval as every part before it has.

## Open questions

- **Q1 — Registration is deferred, not dropped.** `AGENTS.md` asks for registration with a telegram id
  and an email; its Limitations say the MVP has hardcoded sign-in. Part 4 satisfies R1 and leaves R3 to
  a later stage, with the schema shaped for it (D4). Confirm that reading.
- **Q2 — Configuration.** With AI out of scope there is no key to hold today. If one arrives later it
  goes in `.env` at the project root, and by then D8's ignore rule covers it.
