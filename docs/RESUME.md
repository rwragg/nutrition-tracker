# Picking this up again

Everything needed to resume without re-reading a long conversation. Written 2026-11-01, when Parts 1–7
were complete and Part 8 had not started; updated the same day when Part 8 was closed out; **updated
2026-11-02 when Part 9 was built — the Telegram skeleton, the gram basis and the first migration.**

## Where it stands

**All nine parts of `docs/PLAN.md` are done.** Parts 1–8 are the finished MVP, and
`docs/COMPLETION-REPORT.md` carries every criterion from P1.1 to P8.4 with its evidence. Part 9 is the
first thing built on top: a Telegram front end with two commands, plus the one domain change that
direction needed — `g`, the gram basis, and with it the app's first schema migration (2 → 3).

The app is a Next.js 16 frontend served by a FastAPI backend in one container, the log in SQLite,
sign-in gated, all three views reading and writing the API, tested at three levels. The bot is a second
client of the same API, behind a compose profile, with tests of its own.

## Verify the state before doing anything

```bash
cd ~/hermes_workspace/nutrition && git log --oneline -3 && git status --short   # clean
cd backend && uv run pytest -q          # 124 passed
cd ../frontend && npm test              # 75 passed
npm run lint && npx tsc --noEmit        # clean
npm run test:e2e                        # 22 passed, builds its own stack on :8100
./scripts/e2e-persistence.sh            # writes via the API, rebuilds the image, reads it back
docker compose --profile bot run --rm bot   # exits 1 with a reason: no token set
```

Current commits: this repository is HEAD here (Part 9, 2026-11-02), hermes-home `da5c9d2`,
hermes-skills (its HEAD), hermes-notes `84aa0c7`, pm `ae223d6`. Tags
`snapshot-2026-11-02-pre-telegram` (before this work) and `skeleton-2026-11-02-grams-and-bot` (after it)
sit on the four repositories. `spring-llm-agent` has one local commit (`b9aa8e6`) that GitHub refuses
with 403 — the token has no write on that repo (see Open items).

## What Part 9 did

Closed out on 2026-11-02. Two commands — `/today` to read the day back, `/log <food> <quantity> <unit>
[section]` to write one entry — against the API that already existed, plus the gram basis that the whole
chat direction depends on. Every criterion P9.1 … P9.7 is met and recorded in `docs/PLAN.md`, each
verified by running it: a weighed portion logs correctly through the live API, a real version-2 file
migrates with every row intact, the refusals each name what to do instead, and the app, its scripts and
its browser suite are unaffected by the bot's existence.

The migration is the piece with the longest life. It establishes the rule the next version will follow:
**a file from an older version is migrated where a step exists for it, and refused where none does.**
`docs/DATABASE.md` carries the reasoning, including the three details that are load-bearing (foreign
keys off for the drop, outside any transaction; the copy counted before the old table goes; nothing
interpreted).

## How to run it

```bash
./scripts/start.sh     # build and start; exits 0 once the health check answers
./scripts/stop.sh      # stop
```

On Windows, `scripts\start.bat` and `scripts\stop.bat` do the same.

The app is at http://localhost:8000, sign-in `user` / `password` (dummy credentials for the MVP, defined
in `backend/app/auth.py`). The database file is
`/data/nutrition.db` inside the named volume `nutrition-data`, so a rebuild does not wipe the log. The
first run seeds a sample log once, into the empty database. A file from an older schema version is
migrated on startup where a step exists for it, and refused with the version it found where none does.

The bot is opt-in, so the app starts without it and a missing token cannot take the app down:

```bash
cp .env.example .env      # token from @BotFather, and who may use it (TELEGRAM_ALLOWED_USERS)
docker compose --profile bot up -d --build
docker compose logs -f bot
```

`npm run test:e2e` runs against a **separate stack of its own** — compose project `nutrition-e2e`, port
8100, its own volume — which it takes down before and after the run, so it never touches the stack above
and always starts from a freshly seeded database.

To measure coverage without adding anything to the repo:

```bash
cd backend && uv run --with pytest-cov pytest -q --ignore=tests/test_container.py --cov=app --cov-branch
cd frontend && npm i --no-save @vitest/coverage-v8 && npx vitest run --coverage --coverage.reportsDirectory=/tmp/cov
```

Backend: 100% statements and branches for the app itself; `bot.py` is 74%, because the polling loop and
the HTTP client are exercised against the live app and the container rather than by the unit suite.
Frontend: 96.1% statements, 82.5% branches.

## Rules that must not drift

- **AI is out of scope.** No OpenRouter, no keys, no `.env` lines for it. The brief says so plainly, and
  Part 9's D15 leans on it: the bot does not parse natural language, and text that is not a command gets
  a hint rather than a guess.
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
- **`g` is a per-gram basis, not per 100 g** (D13). A food recorded in grams carries its macros per gram,
  so 183 g at 0.61 kcal/g is 111.63 kcal. Revisit only if the catalogue is ever imported from USDA rows,
  which are per 100 g.
- **The bot is a client, not a second implementation** (D14). It holds no records, computes no macros and
  applies no targets; it asks the API and formats the answer. Anything it "knows" that the app does not
  would be a second source of truth.
- **The targets live in one place** (R10) — `frontend/lib/targets.ts` — and the API returns sums, not
  judgements. The bot reports sums for the same reason.
- **Gates.** Each part of the plan stops for Robert's approval. Do not run two parts together.
- **Never put sensitive personal context** (depression, confidence, the immigration separation) in
  anything resume- or job-facing, or in the repo.

## Traps that cost time here — do not rediscover them

- **A second definition of a function silently wins.** Repairing the migration, an old `create_schema`
  was left below the new one, so the *older* body was what ran — Python takes the last definition. It was
  caught by reading the file, not by a test. Read the diff you just wrote.
- **`PRAGMA foreign_keys` is ignored inside a transaction.** Setting it there leaves the constraint
  enforced and a table rebuild refused, and the failure reads like a permissions problem. Set it outside.
- **The tests were right and the parser was wrong, three times.** `cups` for `cup` (people type plurals),
  a dictated name without the comma in a stored one ("greek yogurt weighed" against "Greek yogurt,
  weighed"), and a two-token command with no food. Fix the code, not the expectation.
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

- **The bot's boundary is the bot's boundary.** It logs and reads; it does not edit a food or a meal,
  does not understand a sentence, and has no voice. Each of those is a decision with a cost attached,
  and the next one worth taking is probably voice — Robert dictates lifts already, so the same habit
  would meet a bot that could take `/log` by ear.
- **Per-user accounts** (R3) are not built. The bot signs in with the MVP credential, so every chat
  allowed to talk to it writes the one log that exists. `TELEGRAM_ALLOWED_USERS` is the only thing
  keeping that from being anyone.
- **`spring-llm-agent` cannot be pushed from here.** `Permission to rwragg/spring-llm-agent.git denied to
  rwragg` (403). The fine-grained token has no write on that repo. Either add it on GitHub (Contents:
  read+write) or push it from a shell with Robert's own credentials. One commit is waiting: `b9aa8e6`.
- **The frontend's remaining coverage gaps** are the dialogs' empty-state branches (`AddFoodDialog`'s "no
  foods yet" panel is most of its 57% branch figure) and a couple of defensive fallbacks in
  `use-tracker`. The failure paths — the ones that mattered — are now all covered. Offered, not done.
- **The bot's own coverage** is 74%: the long-polling loop and the `Api` client are not in the unit
  suite. Both were exercised against the live app and the container by hand, and a test that needs a
  Telegram server is a test that needs a token — which is why they are not.
- **The root `PLAN.md`** is the superseded v2 plan. It carries a banner pointing at `docs/PLAN.md`, which
  is a stopgap: Robert may prefer it archived or deleted.
- **Vault book notes:** chapters 1–3 of *Breaking the Habit of Being Yourself* are reconstructions, not
  built from the book's text, and are flagged as such. Chapters 4–10 are source-verified. Offered to
  rebuild 1–3 properly.
- **A "granola" knock-on** was noted in an earlier session and never chased.
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

Nothing is outstanding. The plan is closed through Part 9, the server is running, the tree is clean and
both snapshots are tagged. The open items above are all optional, and each is offered rather than
pending: ask before starting any of them, and do not reopen a finished part without a reason.

For older detail, the previous conversations are searchable:
`session_search(query='<keywords>', session_id='20261102_123650_9ea56ce6')` (this build) and
`session_search(query='<keywords>', session_id='20261101_132202_4a9b1aef')` (the MVP).
