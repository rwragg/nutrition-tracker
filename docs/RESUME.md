# Picking this up again

Everything needed to resume without re-reading a long conversation. Written 2026-11-01, when Parts 1–7
were complete and Part 8 had not started; updated the same day when Part 8 was closed out; **updated
2026-11-02 three times — for Part 9 (the Telegram skeleton, the gram basis, the first migration), for
Part 10 step 1 (real accounts) and for Part 10 step 2 (linking a chat to an account).** This revision
is the handover: the work is being picked up by a different model, so it leans on what to do next.

## Where it stands

**All nine parts of `docs/PLAN.md` are done**, and **Part 10 is drafted with its first two steps built**.
Parts 1–8 are the finished MVP and `docs/COMPLETION-REPORT.md` carries every criterion from P1.1 to P8.4
with its evidence. Part 9 is the Telegram front end plus the gram basis and the first migration. Part 10
is "other people":

- **Step 1 — accounts (R24, R25): done.** Registration with a username and an email (no telegram id: see the code review), passwords stored
  as hashes, and the isolation between two accounts proved.
- **Step 2 — linking a chat to an account (R26): done at the API and the bot, *not* in the UI.** The app
  can mint a pairing code and the bot can redeem it; **nothing in the frontend shows a code yet**, so
  linking currently needs the API by hand. This is the first task for the next session: see "What is
  left" below. `docs/PLAN.md` states the same thing where the step is recorded.
- **Steps 3 (voice) and 4 (leaving, hosting): not started.** D16 (what transcribes a voice note), D17
  (what the email is for) and the "how many other people" question are still open. **D18 is taken:** the
  code comes from the app, never a password typed into Telegram.

The app is a Next.js 16 frontend served by a FastAPI backend in one container, the log in SQLite at
schema version 5, sign-in gated with real accounts, all three views reading and writing the API, tested
at three levels. The bot is a second client of the same API — it speaks **for a chat**, which the app
resolves to an account — behind a compose profile, with tests of its own.

## Verify the state before doing anything

```bash
cd ~/hermes_workspace/nutrition && git log --oneline -3 && git status --short   # clean
cd backend && uv run pytest -q          # 235 passed, plus 5 container tests (240 in all)
cd ../frontend && npm test              # 84 passed
npm run lint && npx tsc --noEmit        # clean
npm run test:e2e                        # 24 passed, builds its own stack on :8100
./scripts/e2e-persistence.sh            # writes via the API, rebuilds the image, reads it back
docker compose logs bot | tail -3       # "the app accepted the bot secret", then "listening"
```

Current commits, read back rather than assumed: tag `linked-chats-2026-11-02` marks **the code state** —
nutrition `5ca385f`, hermes-notes `6dd2338`, hermes-home `64da0d7`, hermes-skills `f81a1e6`, pm `ae223d6`.
**Everything committed after that tag in this repository is documentation only** — including the two
commits that corrected these hashes and the stale sentences a grep turned up — so the tag, not `HEAD`, is
the state to check out. The earlier tags are `skeleton-2026-11-02-grams-and-bot` (the skeleton and the
gram basis) and `snapshot-2026-11-02-pre-telegram` (before the Telegram work), and
`~/backups/nutrition/2026-11-02-linked-chats/` holds a database copy with a `SNAPSHOT.md` beside it.
`spring-llm-agent` has one local commit (`b9aa8e6`) that GitHub refuses with 403 — the token has no write
on that repo (see Open items).

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

## What Part 10 step 2 did

Closed out 2026-11-02. **R26** — a chat is bound to exactly one account, and an unbound chat is refused
with how to bind — is built at the API and the bot, verified in tests and against the running stack. The
screen that shows the code is not built; that is the first task below.

- **D18 taken.** The app shows a code, the chat redeems it with `/bind`. A password is never typed into
  Telegram: that was the whole reason for choosing this shape.
- **Schema version 5**, `telegram_codes`: a six-character code (no I/L/O/0/1, because it is read off a
  screen), fifteen minutes, single use, and spent together with any other code the account held. Stored
  rather than signed, for the single-use property alone.
- **Four routes** in `backend/app/telegram.py`: mint, bind, read the link, remove the link. Binding takes
  the bot's secret instead of a session — the caller never chooses *which account* it binds to, only
  which code it redeems.
- **A second kind of caller.** `auth.current_user` now answers for a browser session **or** the bot
  speaking for a chat (`X-Bot-Secret` + `X-Telegram-Chat`), so one place decides who is asking and the
  bot cannot reach a route a browser cannot.
- **The bot carries the chat id on every request** and no longer signs in. `app/bot.py` lost its
  `ACCOUNT` constant and gained `/bind`, a preflight, and the translation of the app's 403 into the
  instruction to link.
- **Robert's own chat is bound** (`users.telegram_id = 8685521777`, set by hand because the screen does
  not exist yet), so his bot kept working across the change.

## Code review, 2026-11-02

`docs/CODE-REVIEW-2026-11-02.md` lists what a review of the whole tree found and, at the end, what was done
about each item. Read its Resolution section before touching auth, the bot or the dialogs. Two changes
matter for anything built next: **registration no longer takes a telegram id** (a chat is bound only by a
pairing code), and **the port is published on loopback only** (`127.0.0.1:8000`).

## What is left — start here

Part 10 step 2 is finished: the pairing screen is built (header button **Telegram**, `TelegramDialog`,
10 unit tests and an e2e test that shows a real code) and the 4 → 5 migration is tested. Nothing below is
started, and each item stops for Robert's approval:

0. **Part 11 (suggest a food not in the list) is complete.** Matches from the person's own list in New
   food; a USDA lookup route (`/api/lookup/foods`, key in `.env`, schema 6); and two UI entry points, a
   *Look it up* button in New food and *Not in your list? Look it up* in Add food to a day. What it does
   not do yet, and would be next if wanted: household units (cup, tablespoon) for looked-up foods, which
   need a second USDA call per food; and lookup from the Telegram bot, which belongs with item 1 below.
1. **Confirm before writing, a model parser, and USDA lookup for unknown foods** (D19-D21 in `docs/PLAN.md`).
   Confirmation comes first because everything after it depends on it: text that was parsed or transcribed
   is never written unconfirmed. It needs the bot to handle button presses (callback queries).
2. **Then step 3 (voice)**, gated on D16: a transcription step (local whisper.cpp or a cloud service, now
   that a key is held centrally) feeding the same path as typed text. Claude Code may work on this repository
   (Robert, 2026-11-02, reversing his earlier instruction); `CLAUDE.md` at the root is its entry point.
4. **Then step 4 (leaving, hosting)**, gated on D17 and on how many people this is for.

## What Part 10 step 1 did

Closed out 2026-11-02, the same day as Part 9. Robert approved the Part 10 draft and said go, so step 1
— accounts and registration (R24) with the isolation tests (R25) written as the thing that proves it —
is built and verified. Nothing else in Part 10 is started.

- **Schema version 4.** `users` gained `email`, `telegram_id` and `password_hash`, with unique indexes
  on the first two. The 3 → 4 migration is `ALTER TABLE ... ADD COLUMN`, which is deliberately nothing
  like the 2 → 3 rebuild: new nullable columns need no copy and no foreign-key juggling.
- **`app/passwords.py`.** pbkdf2-sha256, 200,000 iterations, a salt per password, constant-time
  comparison, and a malformed or missing value fails closed. Standard library only — no new dependency.
- **`POST /api/register`** in `auth.py`, which now also owns the connection dependency both routers
  take (`api.py` imports `Connection` from it). Sign-in looks the account up instead of reading the
  constant that used to be there.
- **A register form** on the sign-in screen (`components/SignIn.tsx`), with a refusal shown in the
  server's own words — the sentence names the field, which is the thing the person has to change.
- **R1 still works.** The seeded account carries the documented `user` / `password`, hashed. There is a
  test for it, because superseding a requirement is exactly when it gets broken by accident.

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

- **AI is out of scope for the MVP's screens**, and admitted for the chat front end only by D19-D21 (2026-11-02): a model parses, the app validates, the person confirms, USDA supplies food figures, and the keys are Robert's, held by the app. Until that work is approved and started, nothing here changes. The brief said so plainly, and
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
- **A user is an id, and a password is a hash.** The session carries a generated id (`user-<12 hex>`),
  never a username, because a username is a thing a person may want to change. A password is never
  stored, compared as a string, logged or returned by a route, and a missing or malformed hash fails
  closed. `app/passwords.py` is the only place that knows how.
- **Registration adds accounts; it does not replace the seeded one.** R1's `user` / `password` is that
  account's credential now, and there is a test pinning it.
- **A wrong username and a wrong password get the same refusal**, and a refused delete says "no such
  record" for something another account owns. Both are deliberate: the API does not tell a stranger
  which usernames or records exist.
- **A chat is bound to exactly one account, and that is a unique index.** `users.telegram_id` is where a
  chat is bound (R26); its uniqueness is the rule, not a convention. The bot never chooses an account —
  it says which chat it is, and the app decides.
- **The bot is trusted; the chat is not.** The secret proves the caller is the bot, and the binding
  decides which log it may touch. An unbound chat gets 403 from every nutrition route.
- **Both services need `TELEGRAM_BOT_SECRET`** — the app validates the header, the bot sends it. Setting
  it on one side only looks like the other side being broken; the bot's preflight says which.
- **A session beats the bot headers** when a request carries both. The bot sends no cookies, so this only
  happens in a test, and it is stated in `auth.current_user` so it is not rediscovered.
- **Gates.** Each part of the plan stops for Robert's approval. Do not run two parts together.
- **Never put sensitive personal context** (depression, confidence, the immigration separation) in
  anything resume- or job-facing, or in the repo.

## Traps that cost time here — do not rediscover them

- **A live session answers before the bot headers do.** Tests that check the bot's door must sign out
  first, or the session answers for the request and the door looks open. Stated in `auth.current_user`,
  and the tests say why they log out.
- **A shared secret must be set on both services.** The app and the bot each read
  `TELEGRAM_BOT_SECRET`; with it only on the bot, the app answers 503 ("no … configured") while the bot
  looks healthy. Caught by the bot's preflight, which is there for exactly this.
- **A dict comprehension is truthy when it has keys, not when it has values.** `{column: lookup(...)
  for ...}` as an "already taken" check made a registration on an *empty* database answer 409 for all
  three fields — a dict of three `None`s is a non-empty dict. The first test caught it. Write a list of
  the things that actually collided.
- **A migration must record the version it *produces*, not the current one.** The 2 → 3 step wrote
  `SCHEMA_VERSION`, which was correct while it was the only step and became a silent skip of every
  later step the moment a second existed. The target version now lives next to the step in
  `MIGRATIONS`, and the loop writes it. The 2 → 4 test runs the whole chain for this reason.
- **A second definition of a function silently wins.** Repairing the migration, an old `create_schema`
  was left below the new one, so the *older* body was what ran — Python takes the last definition. It was
  caught by reading the file, not by a test. Read the diff you just wrote.
- **`PRAGMA foreign_keys` is ignored inside a transaction.** Setting it there leaves the constraint
  enforced and a table rebuild refused, and the failure reads like a permissions problem. Set it outside.
- **The tests were right and the parser was wrong, three times.** `cups` for `cup` (people type plurals),
  a dictated name without the comma in a stored one ("greek yogurt weighed" against "Greek yogurt,
  weighed"), and a two-token command with no food. Fix the code, not the expectation.
- **A meal entry's `quantity` is NULL, not 1.** A total written as `e.quantity * mf.quantity *
  f.calories` silently drops every meal — 2026-11-02 reads 520 kcal instead of 2,207.5, with no error.
  The join needs `COALESCE(e.quantity, 1)`.
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
  does not understand a sentence, and has no voice. Each of those is a decision with a cost attached, and
  the next one worth taking is voice — Robert dictates lifts already, so the same habit would meet a bot
  that could take `/log` by ear.
- **Registration has no confirmation and no way back.** An account is created in one step with no email
  verification, and there is no route to change a password, change an email or leave (R29). That is
  step 1's boundary, not an oversight — but it is the list to work through before a stranger uses it.
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

The plan is closed through Part 9, the code review's fixes are in, and Part 10 steps 1 and 2 are finished.
Nothing is half done. The open items further
up are optional, and each is offered rather than pending: ask before starting any of them, and do not
reopen a finished part without a reason.

For older detail, the previous conversations are searchable:
`session_search(query='<keywords>', session_id='20261102_123650_9ea56ce6')` (this build) and
`session_search(query='<keywords>', session_id='20261101_132202_4a9b1aef')` (the MVP).
