# Completion report

Every success criterion in `docs/PLAN.md`, from P1.1 to P8.4, with the evidence that it was met.
The per-part detail lives in the Status sections of `docs/PLAN.md`; this gathers the verdicts in one
place and says plainly where anything was met differently or not at all.

Written 2026-11-01 at the close of Part 8, on the finished MVP.

## What was built

A nutrition tracker: a Next.js 16 frontend and a FastAPI backend in one Docker container, serving the
static export at `/` and the API at `/api/*`, with the log in SQLite at `/data/nutrition.db` in a named
volume so it survives a rebuild. Sign-in is hardcoded (`user` / `password`); the schema carries a user
id so more users work later. Three views — Day, Foods, Meals — read and write the API. Nothing in the
browser is a source of truth.

## Verification run at close-out

Re-run today, on this machine, against the finished tree (HEAD `0f714a9`, working tree clean):

| Check | Result |
| --- | --- |
| `cd backend && uv run pytest -q` | **80 passed** in 6.13s |
| `cd frontend && npm test` | **74 passed** (8 files) |
| `npm run lint` | clean |
| `npx tsc --noEmit` | clean |
| `npm run test:e2e` | **22 passed**, 12 of 14 runs; 2 runs hit a browser-level flake — see below |
| `curl http://localhost:8000/` | `200 text/html`, 8,765 bytes, `<title>Nutrition Tracker</title>` |
| `/api/health` · `/api/foods` signed out | `200` · `401` |
| container | `nutrition-backend-1` up, healthy |

## Part 1 — Plan

- **P1.1** every requirement in `AGENTS.md` appears as a numbered R with an owning part — **met.** R1–R23
  are listed under Requirements in `docs/PLAN.md`, each traceable to the `AGENTS.md` line it came from,
  and each owned by the part whose substeps name it (Part 4 owns R1, Part 6 owns R4–R11, and so on).
  The one requirement not built is R3, and it is marked deferred with a reason (Q1).
- **P1.2** every part states its substeps, tests and success criteria — **met.** Parts 1–8 each carry a
  substep checklist, a Tests line and a Success criteria line.
- **P1.3** the persistence sequencing is explicit and no part before Part 7 depends on storage —
  **met.** D1 states it, and Parts 2–4 were built and verified with the frontend still in memory.
- **P1.4** approval recorded — **met, recorded late.** Robert approved each part at its gate, which is
  why Parts 2–7 ran; but the two boxes in Part 1 stayed unticked and the heading still read "in review"
  until this close-out. Ticked now, with the note in the part. Nothing was ever built before a gate.

## Part 2 — Scaffolding: Docker, FastAPI, scripts

- **P2.1** `docker build` exits 0 — **met**; image carries the expected layers.
- **P2.2** one script starts it, one stops it — **met**; `scripts/start.sh` exits 0 in 2.6s after the
  health check, `scripts/stop.sh` exits 0, and both exit 1 with a message when docker is unreachable.
- **P2.3** `/` returns the hello-world page — **met**, from inside the container and through the
  published port.
- **P2.4** the API route returns 200 with a JSON body — **met**; unknown paths 404.
- **P2.5** backend tests green — **met**; 7 passed then, 80 now.
- **P2.6** after a run, `git status` shows no build output, database file or `.env` staged — **met**,
  re-checked today: `git status --short` is empty, there is no `.env`, and no `.db` file is in the tree.

## Part 3 — Frontend in the container

- **P3.1** the tracker renders at `http://localhost:<port>/` from the container — **met**; `/` returns
  200 `text/html` with the app's title and shell, and every hashed `_next` bundle it references returns
  200 with the right content type. Re-verified today: 200, 8,765 bytes.
- **P3.2** all three views work — **met**; Day showed the seeded 2,208 kcal, Foods the 31 foods, Meals
  the 5 meals, checked in a browser against the container.
- **P3.3** zero console errors — **met**, with the deliberate exceptions described in P4.2 and P7.4.
- **P3.4** the frontend's own suites are still green — **met**; 55 + 14 then, 74 + 22 now.
- **P3.5** no change to the frontend's state handling — **met**; only `next.config.ts` and
  `playwright.config.ts` changed.

## Part 4 — Fake sign-in

- **P4.1** `user`/`password` gets in; anything else does not — **met**; wrong password 401, unknown user
  401, malformed body 422, asserted in the backend suite and over HTTP in the browser suite.
- **P4.2** while signed out the app renders the sign-in screen and every `/api` route returns 401 —
  **met as restated, not as first written.** The original wording asked that the *tracker* be
  unreachable, which a static export cannot promise: the shell and its JavaScript must be downloadable.
  The promise was narrowed to the data, and the e2e suite asserts by name that the shell is public so
  the narrowing stays a decision rather than an accident. This is the one criterion whose wording
  changed, and it is called out in `docs/PLAN.md` under the part.
- **P4.3** log out works and is tested — **met**; `/api/session` and `/api/hello` both return to 401 and
  the app returns to the sign-in screen.
- **P4.4** no credentials are hardcoded in the frontend bundle — **met**, checked against the chunks the
  container actually serves; the only `password` strings are React's own input-type handling.
- **P4.5** the frontend's existing tests still pass — **met**.

## Part 5 — Database modelling

- **P5.1** the schema is documented and approved — **met**; `docs/schema.json` and `docs/DATABASE.md`,
  approved as proposed, and `docs/schema.json` is compared against the running `db.py` by a test so the
  document cannot drift.
- **P5.2** creating the database from nothing works and is tested — **met**; a missing file becomes the
  tables and indexes, the version row is written, the seed fills it, and opening it again re-seeds
  nothing. Six tables since D11 dropped `days`.
- **P5.3** R11's guard exists at the storage layer — **met**; with `PRAGMA foreign_keys = ON`, deleting a
  referenced food or meal raises, deleting an unreferenced one is allowed, asserted directly against the
  database with nothing above it checking.
- **P5.4** no code is written against the schema before approval — **met**; the proposal was committed
  as `9bc9cae` and the implementation came after.

## Part 6 — Backend

- **P6.1** every route has tests — **met**; all thirteen routes covered, and every expected figure is
  computed independently in Python from the raw records rather than from the API's own arithmetic.
- **P6.2** both guards demonstrably refuse and name the reference — **met**; 409 with a human message and
  structured `usedBy` lists naming the meals that use a food and the dates that log either.
- **P6.3** user isolation tested with two users — **met**; a second user's rows, written straight to the
  database, are invisible in every list, 404 rather than 403 on direct access, and unwritable.
- **P6.4** the database is created when absent — **met**; startup creates and seeds it, so every one of
  those tests runs against a database that did not exist a moment earlier.
- **P6.5** the frontend is unchanged and still green — **met**; one line of its e2e suite moved off a
  route this part retired.

## Part 7 — Frontend on the API

- **P7.1** data survives a reload and a container restart — **met**; a Playwright test reloads and finds
  the entry, and a script wrote a food and an entry through the API, stopped the stack, rebuilt the image
  and read them back, with the seed correctly not re-running (32 foods, not 63).
- **P7.2** all three views still work — **met**; the screenshots are of the running app and the suite
  asserts each view's figures.
- **P7.3** both guards still refuse with the reason shown — **met**; the dialogs no longer predict the
  rule, they render the server's refusal.
- **P7.4** zero console errors — **met**, with the 401 from the session probe and the 409 from a refused
  delete counted out by status, both spelled out in the test that asks for them.
- **P7.5** no in-memory store remains as a source of truth — **met**; `lib/store.ts`, `lib/seed.ts` and
  the reducer's tests are deleted, `lib/api.ts` is the only module that touches the network, and a test
  asserts the day chips carry the server's figure while the summary is the app's arithmetic over what it
  fetched.

## Part 8 — Handover

- **P8.1** the README matches reality — **met after one correction.** Start, stop, port, credentials and
  the database file's location and volume were all already true and were checked against the running
  stack. One number was stale: the README claimed **35** unit and component tests, which was the count
  when Part 7 wrote it — commit `a5b62a9` closed the coverage gaps and took the suite to **74**. Fixed
  in the README, and noted in Part 7's status rather than silently rewritten.
- **P8.2** `curl` returns the app — **met**; run, not described: `200`, `text/html`, 8,765 bytes,
  `<title>Nutrition Tracker</title>`.
- **P8.3** screenshots captured — **met**; `docs/screenshots/day.png`, `foods.png`, `meals.png` and
  `sign-in.png`, all taken from the running stack.
- **P8.4** every P-criterion accounted for, met or explicitly not met — **met by this document.** Every
  criterion P1.1–P8.4 appears above. None was dropped. Two are qualified rather than plain: **P4.2** was
  restated before it was built (the data is protected, not the markup), and **P1.4** was recorded late.
  Nothing was met differently in a way that weakens what was promised.

**Server left running and ready** — `nutrition-backend-1` is up and healthy and answers on
`http://localhost:8000`.

## Known flake in the browser suite, stated plainly

Across 14 runs of `npm run test:e2e` today, 12 passed 22/22 and 2 failed a single test. Both failures
were **browser-level network errors**, not the app: the console carried
`Failed to load resource: net::ERR_NETWORK_CHANGED`.

- One surfaced in the console-quiet assertion at the end of *opens on the newest day*.
- The other surfaced as a failed assertion in *logs a meal and expands it into its foods*.

`expectQuiet` asserts the console is completely empty, which means a resource the browser could not
fetch — for a reason that has nothing to do with the app — fails the run. On this host the docker
network is rebuilt for every run and the stack is torn down and brought up again around it, which is
the likely source. It is a rare, environmental failure with a rerun as the remedy, and it is recorded
here rather than left for the next person to discover.

If it is worth removing, the narrow fix is to count `net::` failures out by the same rule the 401 and
the 409 are already counted out by — turning it into a stated decision instead of a surprise. Not done:
it changes what the suite asserts, and that is Robert's call, not the handover's.

## Verifying this yourself

```bash
cd ~/hermes_workspace/nutrition
./scripts/start.sh                 # build and start; exits 0 once the health check answers
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:8000/   # 200 text/html

cd backend && uv run pytest -q     # 80 passed
cd ../frontend && npm install
npm test                           # 74 passed
npm run lint && npx tsc --noEmit   # clean
npm run test:e2e                   # 22 passed; builds its own stack on :8100 and throws it away
```

Open `http://localhost:8000/`, sign in as `user` / `password`, and the day opens on today with the
sample log: 31 foods, 5 meals, three days of entries.
