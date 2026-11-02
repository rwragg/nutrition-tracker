# Picking this up again

Everything needed to resume without re-reading a long conversation. Written 2026-11-01, when Parts 1–7
were complete and Part 8 had not started.

## Where it stands

Parts 1–7 of `docs/PLAN.md` are **done and pushed**. Part 8 (handover) is the only part left, and it has
not been started.

The app is finished: a Next.js 16 frontend served by a FastAPI backend in one container, the log in
SQLite, sign-in gated, all three views reading and writing the API, tested at three levels.

## Verify the state before doing anything

```bash
cd ~/hermes_workspace/nutrition && git log --oneline -3 && git status --short   # a5b62a9, clean
cd backend && uv run pytest -q          # 80 passed
cd ../frontend && npm test              # 74 passed
npm run lint && npx tsc --noEmit        # clean
npm run test:e2e                        # 22 passed, builds its own stack on :8100
```

Current commits: nutrition `a5b62a9`, hermes-home `f45c214`, hermes-skills `f531172`, hermes-notes
`c6ec8f4`, pm `ae223d6`. `spring-llm-agent` has one local commit (`b9aa8e6`) that GitHub refuses with
403 — the token has no write on that repo (see Open items).

## What Part 8 needs

From the plan:

- [ ] README accurate: start, stop, and where the database file lives — **already reads true**: Part 7
      rewrote it (it gives the scripts, both platforms, the port, the credentials and the volume). Re-read
      it against reality rather than assuming, but expect this to be a tick, not a rewrite.
- [ ] `curl` on the served URL returns the app — do it, don't describe it.
- [ ] Screenshots of all three views plus the sign-in screen — **done**, in `docs/screenshots/`.
- [ ] A completion report listing every success criterion (P1.1 … P8.4) with its evidence — this is the
      real work left. The evidence already exists in the per-part Status sections of `docs/PLAN.md`;
      the report gathers it in one place and says plainly where anything was met differently (P4.2 was
      restated: the *data* is protected, not the markup).
- [ ] Server left running and ready.

**P8.4 wants every criterion accounted for, met or explicitly not met.** Do not quietly drop one.

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

## On resume

Ask Robert whether to close out **Part 8** (the completion report is the substance of it), and say
plainly that the README and screenshots are already in place. Do not start anything else without the
gate.

For older detail, the previous conversation is searchable:
`session_search(query='<keywords>', session_id='20261101_132202_4a9b1aef')`.
