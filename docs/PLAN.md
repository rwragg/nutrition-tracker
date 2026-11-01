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
  document and is left untouched; it is not an input to any part here.

## Part 1 — Plan · **in review**

The brief: enrich the step list with substeps as a checklist, tests and success criteria per part, add
an `AGENTS.md` in `frontend/` describing the existing code, and get Robert's approval.

- [x] Read the repo rather than trusting the brief's description of it
- [x] Requirements (R1–R23) and decisions (D1–D10) written down
- [x] This document, with per-part substeps, tests and success criteria
- [x] `AGENTS.md` reconciled with D1 and D2
- [ ] `frontend/AGENTS.md` describing the existing code (D9)
- [ ] **Robert approves this plan — gate: no part below starts before this**

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

- [ ] A sign-in screen, with a session cookie issued by the backend (R1)
- [ ] Log out clears the session
- [ ] Unauthenticated requests to `/` get the sign-in screen; the tracker is not served
- [ ] The session carries a user id, so R2 holds and R3 can land later (D4)

**Tests:** backend tests for the auth route — correct, incorrect and absent credentials · Playwright:
sign in, use the app, log out, and navigate to `/` while signed out.

**Success criteria:** P4.1 `user`/`password` gets in; anything else does not · P4.2 the tracker is
unreachable while signed out · P4.3 log out works and is tested · P4.4 no credentials are hardcoded in
the frontend bundle · P4.5 the frontend's existing tests still pass.

## Part 5 — Database modelling

The brief: propose a schema for the nutrition tracker, saved as JSON, documented in `docs/`, with user
sign-off.

- [ ] Propose the SQLite schema — users, foods, meals, meal ingredients, days, entries — as JSON
- [ ] Document the approach in `docs/` and get Robert's sign-off before any code depends on it
- [ ] State the delete behaviour: R11's refusal is enforced where the data lives, not only in the UI
- [ ] State what the first-run seed is, and that it runs only against an empty database

**Tests:** a schema test creating the database from empty, asserting the tables, the keys, and the
refusal to cascade.

**Success criteria:** P5.1 the schema is documented and approved · P5.2 creating the database from
nothing works and is tested · P5.3 R11's guard exists at the storage layer · P5.4 no code is written
against the schema before approval.

## Part 6 — Backend

The brief: API routes letting the backend read and change a given user's tracker data, thoroughly
tested with backend unit tests, creating the database if it does not exist.

- [ ] CRUD routes for foods and meals (R7, R8)
- [ ] Routes for days and entries, including the day's summary figures (R4–R6, R9, R10)
- [ ] Both delete guards, returning *where* the record is referenced (R11)
- [ ] Every route scoped to the signed-in user (R2)
- [ ] Database created if absent (R17)

**Tests:** `pytest` per route; each guard refusing and naming the reference; a second user unable to
see the first user's data; the day's totals computed independently of the API and compared.

**Success criteria:** P6.1 every route has tests · P6.2 both guards demonstrably refuse and name the
reference · P6.3 user isolation tested with two users · P6.4 the database is created when absent ·
P6.5 the frontend is unchanged and still green.

## Part 7 — Frontend + Backend · **persistence lands here**

The brief: the frontend actually uses the backend API, so the app is a properly persistent nutrition
tracker, tested thoroughly.

- [ ] Replace `useReducer` + `createSeedStore()` with calls to the API
- [ ] The seed becomes a first-run database seed rather than app state (D1, R14)
- [ ] Loading and error states for the calls that now exist
- [ ] Re-point the tests that assert against the pure reducer — expect the shape of three test files to
      change, not only their assertions

**Tests:** the full Playwright suite against the container · a reload test proving data survives (the
definition of R23) · both delete guards end to end · a second browser session seeing the same data.

**Success criteria:** P7.1 data survives a reload and a container restart · P7.2 all three views still
work · P7.3 both guards still refuse with the reason shown · P7.4 zero console errors · P7.5 no
in-memory store remains as a source of truth.

## Part 8 — Handover

- [ ] README accurate: start, stop, and where the database file lives
- [ ] `curl` on the served URL returns the app
- [ ] Screenshots of all three views plus the sign-in screen
- [ ] A completion report listing every success criterion above with its evidence
- [ ] Server left running and ready

**Success criteria:** P8.1 the README matches reality · P8.2 `curl` returns the app · P8.3 screenshots
captured · P8.4 every P-criterion accounted for, met or explicitly not met.

## Open questions

- **Q1 — Registration is deferred, not dropped.** `AGENTS.md` asks for registration with a telegram id
  and an email; its Limitations say the MVP has hardcoded sign-in. Part 4 satisfies R1 and leaves R3 to
  a later stage, with the schema shaped for it (D4). Confirm that reading.
- **Q2 — Configuration.** With AI out of scope there is no key to hold today. If one arrives later it
  goes in `.env` at the project root, and by then D8's ignore rule covers it.
