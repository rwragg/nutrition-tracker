# Picking this up again

Everything needed to resume without re-reading a long conversation. Written 2026-11-01, when Parts 1–7
were complete and Part 8 had not started; **updated the same day when Part 8 was closed out.**

## Where it stands

**All eight parts of `docs/PLAN.md` are done.** The build is finished and handed over, and
`docs/COMPLETION-REPORT.md` carries every success criterion from P1.1 to P8.4 with its evidence. Nothing
is in flight; what remains is the list of open items at the bottom, none of which blocks the MVP.

The app is finished: a Next.js 16 frontend served by a FastAPI backend in one container, the log in
SQLite, sign-in gated, all three views reading and writing the API, tested at three levels.

## Verify the state before doing anything

```bash
cd ~/hermes_workspace/nutrition && git log --oneline -3 && git status --short   # clean
cd backend && uv run pytest -q          # 80 passed
cd ../frontend && npm test              # 74 passed
npm run lint && npx tsc --noEmit        # clean
npm run test:e2e                        # 22 passed, builds its own stack on :8100
./scripts/e2e-persistence.sh            # writes via the API, rebuilds the image, reads it back
```

Current commits: this repository is HEAD here (Part 8's handover commit, 2026-11-01), hermes-home
`f45c214`, hermes-skills `f531172`, hermes-notes
`c6ec8f4`, pm `ae223d6`. `spring-llm-agent` has one local commit (`b9aa8e6`) that GitHub refuses with
403 — the token has no write on that repo (see Open items).

## What Part 8 did

Closed out on 2026-11-01. The substance was `docs/COMPLETION-REPORT.md` — every criterion P1.1 … P8.4
with its evidence, including the one met as restated (P4.2: the *data* is protected, not the markup) and
the one recorded late (P1.4, approval). Everything else on the list was already in place: the README
(true except one stale test count, now 74), `curl` on the served URL, the four screenshots, and the
container left running.

Part 1's heading still said "in review" and two of its boxes were unticked for the whole build; both are
fixed now, with a note saying the approval was given at the time and written down at close-out.

## How to run it

```bash
./scripts/start.sh     # build and start; exits 0 once the health check answers
./scripts/stop.sh      # stop
```

On Windows, `scripts\start.bat` and `scripts\stop.bat` do the same.

The app is at http://localhost:8000, sign-in `user` / `password` (dummy credentials for the MVP, defined
in `backend/app/auth.py`). The database file is
`/data/nutrition.db` inside the named volume `nutrition-data`, so a rebuild does not wipe the log. The
first run seeds a sample log once, into the empty database.

`npm run test:e2e` runs against a **separate stack of its own** — compose project `nutrition-e2e`, port
8100, its own volume — which it takes down before and after the run, so it never touches the stack above
and always starts from a freshly seeded database.

To measure coverage without adding anything to the repo:

```bash
cd backend && uv run --with pytest-cov pytest -q --ignore=tests/test_container.py --cov=app --cov-branch
cd frontend && npm i --no-save @vitest/coverage-v8 && npx vitest run --coverage --coverage.reportsDirectory=/tmp/cov
```

Backend: 100% statements and branches. Frontend: 96.1% statements, 82.5% branches.

## Rules that must not drift

- **AI is out of scope.** No OpenRouter, no keys, no `.env` lines for it. The brief says so plainly.
- **No Tailwind anywhere**, in code or in docs. The brief mentions it once and was told to ignore it.
- **Bootstrap 5.3.8, CSS only** — no Bootstrap JavaScript. The palette lives as custom properties in
  `app/globals.css`, bridged into `--bs-*`; no component hardcodes a colour. Contrast is measured, and a
  solid accent fill carries ink text (white on the violet commit button fails at 2.7:1).
- **No emojis anywhere**, minimal README, no unnecessary defensive programming, no over-engineering.
- **A day is a column, not a table** (D11). An entry carries its own `date` and `user_id`. A date with
  nothing on it reads as an empty day, not a 404. Do not reintroduce a `days` table.
- **The browser holds a copy, never the truth** (D12). `lib/api.ts` is the only code that talks to the
  network; `lib/use-tracker.ts` reads and re-reads after every write. Writes return their refusal rather
  than predicting the rule.
- **Nothing cascades.** `ON DELETE RESTRICT` everywhere, and the API checks first so the refusal can name
  what is in the way.
- **Gates.** Each part of the plan stops for Robert's approval. Do not run two parts together.
- **Never put sensitive personal context** (depression, confidence, the immigration separation) in
  anything resume- or job-facing, or in the repo.

## Traps that cost time here — do not rediscover them

- **`TestClient` runs on one thread; a real server does not.** A per-request SQLite connection closed in
  a FastAPI dependency finalises on a different threadpool thread, so it raises `ProgrammingError` and
  answers 500 intermittently. Fixed with `check_same_thread=False` in `db.connect`. The 80 backend tests
  never saw it; the browser suite found it in minutes.
- **The container's clock dates the seed; the browser decides what today is.** Fixed by setting `TZ` on
  the compose service. Without it a fresh sample lands a day ahead and the app opens on a different day
  than the seeded newest.
- **The version check must run before the DDL.** With it after, an old file dies on `no such column:
  user_id` from a `CREATE INDEX` and the clear message never appears. There is a test pinning the order.
- **A `CHECK` that evaluates to NULL passes in SQLite.** Date guards need `IS date`, not `= date`.
- **Playwright checks the webServer URL before running its command**, so a stack left by an earlier run
  fails the run before anything can clean it up. Take the e2e stack down from the npm script, not from
  `webServer.command`.
- **Any non-2xx is logged by the browser as a console error**, so the "no console errors" assertion must
  count out the 403/409 a test deliberately provoked — by status, not by dropping the assertion.
- **Do not sign in through the form in an e2e helper.** `isVisible()` does not wait and races the app's
  own session probe; sign in through `page.request`, which shares the cookie jar.
- **Newer FastAPI keeps included routers as wrapper objects.** Iterating `app.routes` shows none of the
  api routes and looks like a wiring failure; count them on the router instead.
- **`write_file` refuses to overwrite what this session has not fully read.** Read the file whole, or
  `rm` it and write fresh.
- **Assertions must be derived, never recalled.** Four separate wrong guesses here (which food a form
  defaults to, "1 foods" vs "1 food", `0.3 cups` vs `0.3 cup`, which day the app opens on).

## Open items, honestly

- **`spring-llm-agent` cannot be pushed from here.** `Permission to rwragg/spring-llm-agent.git denied to
  rwragg` (403). The fine-grained token has no write on that repo. Either add it on GitHub (Contents:
  read+write) or push it from a shell with Robert's own credentials. One commit is waiting: `b9aa8e6`.
- **The frontend's remaining coverage gaps** are the dialogs' empty-state branches (`AddFoodDialog`'s "no
  foods yet" panel is most of its 57% branch figure) and a couple of defensive fallbacks in
  `use-tracker`. The failure paths — the ones that mattered — are now all covered. Offered, not done.
- **The root `PLAN.md`** is the superseded v2 plan. It carries a banner pointing at `docs/PLAN.md`, which
  is a stopgap: Robert may prefer it archived or deleted.
- **Vault book notes:** chapters 1–3 of *Breaking the Habit of Being Yourself* are reconstructions, not
  built from the book's text, and are flagged as such. Chapters 4–10 are source-verified. Offered to
  rebuild 1–3 properly.
- **A "granola" knock-on** was noted in an earlier session and never chased.
- **The dev volume's sample dates are a day ahead of the wall clock.** The newest day the log holds is
  `2026-11-02` while the machine says 1 Nov, so the app opens on a day the header dates rather than on the
  chip labelled "Today". The volume was first seeded before the `TZ` fix landed (under UTC, in the evening
  of 1 Nov), and the seed only ever writes once, so the offset sticks. A fresh volume is right, which is
  why the browser suite never sees it. Fix, not run here because it throws the log away:
  `docker compose down -v && ./scripts/start.sh`.
- **The browser suite still has one rare transport failure, which is not the app.** Across 29 runs on
  2026-11-01, 3 failed a test with `Failed to load resource: net::ERR_NETWORK_CHANGED` in the console —
  a different test each time. `expectQuiet` asserts an empty console, so an unfetchable resource fails
  the run; a rerun clears it. The narrow fix, if Robert wants it, is to count `net::` failures out by the
  same rule the 401 and the 409 are counted out by — deliberately not done, because it changes what the
  suite asserts.
- **One browser test was unsound and has been fixed** (the fourth failure in those 29 runs). *logs a meal
  and expands it into its foods* added "Light dinner" to a Dinner that already held it, then asserted on
  the *section* — so it passed by asserting against the seeded row before the app's re-read rendered the
  new one, and failed with a strict-mode violation when the re-read won. Its cleanup also deleted the
  seed's own dinner, leaving later tests reading a day the seed never wrote (1,583.5 kcal where the seed
  says 2,207.5). It now picks a meal the day does not hold, asserts inside `entry-<the POST's id>`, and
  deletes only what it wrote. Six consecutive full runs green afterwards. The lesson generalises: a test
  that writes must assert on *its* row, not on a section that may already contain one like it.

## On resume

Nothing is outstanding. The plan is closed, the report is written, the server is running and the tree is
clean. The open items above are all optional, and each is offered rather than pending: ask before
starting any of them, and do not reopen a finished part without a reason.

For older detail, the previous conversation is searchable:
`session_search(query='<keywords>', session_id='20261101_132202_4a9b1aef')`.
