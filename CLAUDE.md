# Nutrition Tracker

Next.js 16 frontend (static export) + FastAPI backend in one Docker container, SQLite storage, optional
Telegram bot as a second client of the same API. Read `AGENTS.md` (the brief), `docs/PLAN.md` (the live
plan and decisions) and `docs/RESUME.md` (current state, traps, what is next) before changing anything.
The root `PLAN.md` is superseded; ignore it.

## State

Parts 1-9, Part 10 steps 1-2 (accounts; a chat linked by a pairing code) and Part 11 (suggest a food that
is not in the list, from the person's own foods and from USDA) are done. **Part 12 (a profile, and calorie and
protein targets worked out from it) is built and tested:** schema version 7, the `/api/profile` routes, and
the Profile dialog and Day view on the screen, **and R54: an account with no profile cannot add an entry, a food or a
meal** (it can still read, look a food up, edit and delete). **As of 2026-11-04 it is checked in but not deployed:** the
live containers are still the schema 6 build, and rebuilding migrates the database 6 to 7 (snapshot and
rollback images: `~/backups/nutrition/2026-11-04-pre-r54-deploy`; **the schema 6 build refuses to start on a schema 7
database**, so a rollback after the deploy restores that snapshot's `nutrition.db` too, and loses anything logged since). `docs/PLAN.md` Part 12 has the status.

**Next, none started, each gated on Robert's approval:** write the plan for confirm-before-write (a Part 13), a model
parser and lookup from the Telegram bot (D19-D21 in `docs/PLAN.md`); then voice (D16 still open); then
leaving and hosting (D17 and "how many people" still open). The full list, with what was left on purpose,
is "What is left" at the top of `docs/RESUME.md`. What the code review found and fixed is in
`docs/CODE-REVIEW-2026-11-02.md`.

## Layout

- `backend/app/` - `main.py` (wiring), `auth.py` (accounts, session, `current_user`), `passwords.py`,
  `telegram.py` (pairing codes), `api.py` (nutrition routes), `lookup.py` + `usda.py` (USDA food lookup),
  `ratelimit.py`, `db.py` (schema, migrations, seed), `bot.py`
- `backend/tests/` - pytest; `test_container.py` builds the real image
- `frontend/` - `app/`, `components/`, `lib/` (`api.ts` is the only network code), `test/`, `e2e/`
- `scripts/` - `start.sh`/`stop.sh` (+ `.bat`), `e2e-persistence.sh`
- `docs/` - PLAN, RESUME, DATABASE, COMPLETION-REPORT, schema.json

## Commands

```bash
./scripts/start.sh                       # build + start, app on :8000 (user / password)
./scripts/stop.sh
cd backend && uv run pytest -q           # 368 tests
cd frontend && npm test                  # 189 unit/component tests
cd frontend && npm run lint && npx tsc --noEmit
cd frontend && npm run test:e2e          # 35 Playwright tests, own stack on :8100
./scripts/e2e-persistence.sh             # write, rebuild image, read back
docker compose --profile bot up -d --build   # optional Telegram bot
```

Verify before starting: clean `git status`, and the suites above green.

## Rules that must not drift

- AI: none in the web app's screens. Part 10 allows a model for the chat front end only (D19-D21 in `docs/PLAN.md`): it parses text into items, the app validates them, and nothing is written without the person's confirmation. Keys live in the app's environment, never in the bot or the image. No Tailwind anywhere. No emojis anywhere.
- Bootstrap 5.3.8 CSS only (no Bootstrap JS). Palette lives as CSS custom properties in
  `frontend/app/globals.css`; no component hardcodes a colour. Solid accent fills carry ink text (white on
  violet fails contrast at 2.7:1). Every text/surface pair stays at 4.5:1 or better.
- Keep it simple: no over-engineering, no unnecessary defensive programming, no extra features, minimal
  README. PEP 8 for Python. Use the latest library versions; dependencies are unpinned in
  `pyproject.toml`, `uv.lock` holds what resolved.
- Next.js here is a newer major than you know: read `node_modules/next/dist/docs/` before writing
  frontend code. `next dev` re-adds a generated block at the top of `frontend/AGENTS.md`; commit it as-is.
- A day is a column, not a table (D11): entries carry `date` and `user_id`. Do not add a `days` table.
- The USDA key (`USDA_API_KEY`) is in `.env` only: never print, log, commit or put it in a URL (it goes in a
  header). The e2e suite blanks it on purpose; keep it that way, so tests never spend it.
- The browser holds a copy, never the truth (D12). Only `lib/api.ts` touches the network; writes return
  their refusal rather than predicting the rule.
- Nothing cascades: `ON DELETE RESTRICT` everywhere; the API checks first so the refusal names what is in
  the way. Every connection sets `PRAGMA foreign_keys = ON` (set it outside any transaction).
- `g` is a per-gram basis (D13). **Targets are worked out in one place, the backend (`app/targets.py`), from the
  account's profile (D25).** The browser never calculates one: `frontend/lib/targets.ts` holds only the standard
  four for an account with no profile, and chooses between them. The log's API still returns sums. *(Until Part 12
  this read "targets live only in `targets.ts`"; D25 moved the rule, it did not remove it.)*
- **Nothing is added before a profile exists (R54).** `POST /foods`, `POST /meals` and `POST /days/{day}/entries` call
  `profile.require_profile`, which answers 409 (not 403: the bot reads a 403 as an unlinked chat) with one sentence the
  screen and the bot both repeat. Any test that creates something gives its account a profile first
  (`tests/people.give_profile`, the e2e `openTracker`, the stub's default world).
- A profile is body measurements: reachable from a signed-in browser only, never by the bot (R53), never in a
  log or an error message (R50), and only invented people in tests, fixtures, screenshots and the deck (R51).
  The screenshot script refuses port 8000 and any stack holding a profile that is not its own.
- The bot is a client, not a second implementation (D14): it holds no records and computes nothing. It
  speaks for a chat, which the app resolves to an account (R26). `TELEGRAM_BOT_SECRET` must be set on both
  the app and the bot.
- A user is an id, a password is a hash (`app/passwords.py` is the only place that knows how). Another
  account's record answers 404, not 403. A wrong username and a wrong password get the same 401.
- Schema changes: migrate where a step exists, refuse where none does. Record the version a step
  *produces* beside the step in `MIGRATIONS`. Each migration needs a test, and the chain tests run
  end to end.
- Each part of the plan stops for Robert's approval. Do not run two parts together, and do not reopen a
  finished part without a reason.
- Never put sensitive personal context (health, finances, family or immigration circumstances) in the
  repo.

## Traps (details in `docs/RESUME.md`)

- A live session answers before the bot headers: tests of the bot's door must sign out first.
- A meal entry's `quantity` is NULL, not 1: totals need `COALESCE(e.quantity, 1)`.
- A SQLite `CHECK` that evaluates to NULL passes: date guards use `IS date`, not `= date`.
- Playwright: sign in through `page.request`, not the form; count deliberate 401/403/409 out of the
  console-error assertion by status; a test that writes must assert on its own row, not a section.
- Do not take the e2e stack down from `webServer.command`; do it from the npm script.
- `write_file`-style tools refuse to overwrite files not fully read: read first, or remove and rewrite.
- Assertions must be derived from the code or data, never recalled.
