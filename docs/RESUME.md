# Picking this up again

Everything needed to resume without re-reading a long conversation. **Rewritten 2026-11-02 at a model
switch, and revised 2026-11-04 at the next one** (Parts 11 and 12 were built on `anthropic/claude-sonnet-5.5`; the
default profile now runs `deepseek/deepseek-v4.1-flash`, see "On resume"). It leads with where things stand, how to prove it, and what is left; the sections after it are
the history of each part and the rules and traps that cost time. If a sentence below disagrees with the
code, the code is right: say so and fix the sentence.

## Where it stands

A nutrition tracker: a Next.js 16 frontend (a static export) served by a FastAPI backend in one container,
the log in SQLite at **schema version 7**, real accounts, three views (Day, Foods, Meals), and an optional
Telegram bot that is a second client of the same API. Everything below is built and tested. **Part 12 is not yet
deployed to the live stack** (see "In flight" under "What is left").

- **Parts 1-9** are the MVP, the Telegram skeleton and the gram basis (`docs/PLAN.md`,
  `docs/COMPLETION-REPORT.md` for P1.1 to P8.4).
- **Part 10, steps 1 and 2: done.** Accounts with isolation between them (R24, R25), and a chat linked to
  an account by a code the app shows (R26, D18). The **Telegram** button in the header opens the pairing
  dialog; the bot redeems the code with `/bind`. **Steps 3 (voice) and 4 (leaving, hosting) are not
  started.**
- **Part 11: done.** Suggest a food that is not in the list: matches from the person's own foods in New
  food, then a USDA FoodData Central lookup (`GET /api/lookup/foods`) with two entry points, *Look it up* in
  New food and *Not in your list? Look it up* in Add food to a day. A found food can be renamed and its
  figures adjusted before it is added. Looked-up foods are stored per gram, marked `usda`, with USDA's id.
- **Part 12: built, checked in, not deployed.** A profile per account (name, sex, date of birth, height, weight,
  activity, goal, units, and optional own targets) and calorie and protein targets worked out from it by the
  backend (`app/targets.py`, Mifflin-St Jeor, D25-D31), with the working shown on screen. Schema version 7;
  `/api/profile`, browser session only (R53); the Profile dialog and the Day view on the profile's targets.
  **R54 (accepted 4 Nov): an account with no profile cannot add an entry, a food or a meal.** The API answers 409
  ("set up your profile before adding anything"); the creating dialogs still open, so a USDA lookup works, with a
  notice and a disabled button. Reading, editing, deleting and removing an entry are not gated.
  **Rebuilding the live stack migrates the database 6 to 7** - snapshot first (one is at
  `~/backups/nutrition/2026-11-04-pre-r54-deploy`, with images `pre-r54` and `pre-r54-bot`). **The old build refuses to
  start on a schema 7 database** (tested), so rolling back after the deploy means restoring that snapshot's database too. `docs/PLAN.md`
  Part 12 has the requirements, the decisions and the status.
- **The code review (`docs/CODE-REVIEW-2026-11-02.md`) is closed**, with a Resolution table of what was
  fixed and what was left on purpose.

The bot is opt-in behind a compose profile. The USDA key and the bot secret and token live in `.env`
(gitignored); see `.env.example`.

## Verify the state before doing anything

```bash
cd ~/hermes_workspace/nutrition && git log --oneline -3 && git status --short   # clean
cd backend && uv run pytest -q          # 368 passed (includes 5 container tests that build the real image)
cd ../frontend && npm test              # 211 passed
npm run lint && npx tsc --noEmit        # clean
npm run test:e2e                        # 36 passed, builds its own stack on :8100 with no USDA key
./scripts/e2e-persistence.sh            # writes via the API, rebuilds the image, reads it back
docker compose --profile bot ps         # backend healthy on 127.0.0.1:8000, bot up
docker compose logs bot | tail -3       # "the app accepted the bot secret", then "listening"
```

Tag `handover-2026-11-02` marks the state of the MVP-and-Telegram work in all four repositories (`rwragg/nutrition-tracker`,
`hermes-notes`, `hermes-home`, `hermes-skills`); read a tag's commit with `git rev-parse --short
'<tag>^{commit}'`. A database copy and a `SNAPSHOT.md` are in `~/backups/nutrition/2026-11-02-handover/`,
and the image is kept as `nutrition-tracker:handover`. Earlier snapshots form a ladder beside it:
`2026-11-02-pre-telegram`, `post-skeleton`, `linked-chats`, `usda-lookup`.

Part 12 is tagged in this repository only: `pre-profile-2026-11-04` (the code the live app still runs),
`profile-step1-2026-11-04` (backend), `profile-r54-2026-11-04` (everything, on GitHub), and `handover-2026-11-04` (this
file, written at the model switch). The rollback ladder's newest rung is `~/backups/nutrition/2026-11-04-pre-r54-deploy/`
(database copy, `SNAPSHOT.md`, and the images `nutrition-tracker:pre-r54` and `pre-r54-bot`).

`spring-llm-agent` has one local commit (`b9aa8e6`) that GitHub refuses with 403: the token has no write on
that repo (see Open items).

## What is left - start here

Part 12 is built but **not deployed**, and a test copy is running (section 0). Everything after section 0 is
**unstarted**, and each part of the plan stops for Robert's approval before the next begins.

### 0. In flight right now (4 Nov 2026) - read this before touching anything

- **A throwaway test copy of the new build is running** on `http://127.0.0.1:8200` (compose project
  `nutrition-shots`, its own volume, seeded login `user` / `password`, no bot, loopback only). Robert is testing it by
  hand. **Taking it down is approval-gated:** `docker compose -p nutrition-shots down -v` deletes a volume, so it asks
  him; if the prompt times out, do **not** retry, rephrase or route around it. Say it is still running and ask. Nothing
  in it matters: the data is the seed, and the live stack is untouched. **It was built before the quantity-box fix**
  (typing in the Add food quantity box still misbehaves there; the fix is in the code, the tests and the next build).
- **Part 12 and R54 are not on the live stack.** The running containers are the schema 6 build (`pre-profile-2026-11-04`).
  Waiting for Robert's go after his test. To deploy, in this order:
  1. Re-take the snapshot if anything was logged since (the 4 Nov one holds 33 foods, 5 meals, 18 entries, 3 days, 2
     `usda` foods; compare before trusting it). Method: `references/deploy-snapshot-and-test-stack.md` in the
     `nutrition-app-ops` skill. Pin images by name first: a build moves the `local` tag and Docker can lose the running
     image's content (it already has once).
  2. (The build includes the 4 Nov fix to the Add food quantity box: typing 183 used to give 0.26.)
     `cd ~/hermes_workspace/nutrition && docker compose --profile bot up -d --build` (recreates both containers, keeps
     the volume, migrates the database 6 to 7). **Everyone is signed out afterwards** (the session secret regenerates).
  3. Check: `/api/health` 200; schema 7 (`docker compose exec -T backend python -c "from app import db; print(db.SCHEMA_VERSION)"`);
     sign in, then 33 foods and 3 days; the bot's log shows it listening.
  4. **Tell Robert first, and again after:** from this moment the live account has no profile, so **it cannot add
     anything, from the browser or from Telegram, until he saves one in the Profile dialog** (D34). A message to the bot
     before then should come back as "set up your profile before adding anything. Nothing was logged." That is the
     first real check of the bot path.
  5. **Rollback is not just the old image.** The schema 6 build refuses to start on a schema 7 database (tested, 4 Nov).
     Going back means the old image *and* the snapshot's `nutrition.db`, and loses anything logged since, so if the
     deploy is wrong, say so **before** logging anything. Steps are in the snapshot's own `SNAPSHOT.md`.
- **Pushed:** everything up to the `snapshot-2026-11-04` tag is on GitHub, in all four repositories (Robert said "push
  everything" on 4 Nov). Anything committed after that tag is not; check `git rev-list --count origin/main..HEAD`.
- **Decided, do not re-ask:** the published history keeps the example body figures and the age sentence that were
  in `06c4cd2` and `d5fd646` (removed again in `a08aa97`; `git show` them there, do not copy them into a document). Robert said "no worries" on 4 Nov rather
  than have 3 commits rewritten. They were an accident (his real figures used as examples). **From here on, scan the
  staged diff for his real figures before every commit and do not filter the scan's own patterns out.**
- **Unanswered:** he offered "a new key" (4 Nov) but never said **which** (USDA, Telegram bot token, or bot secret; the
  last two also need a bot restart). Method when he answers: he puts it in `.env` himself with `read -rsp`; you verify
  by length, a hash prefix and a live call; it is never pasted in chat.
- **Not rebuilt:** the deck (`docs/deck/`) does not use the new pictures (`need-profile`, `profile`,
  `profile-working`; `day.png` now shows a profile). It was not asked for.
- **`command_allowlist` in the default profile's `config.yaml` gained `SQL DELETE without WHERE`** at 13:27 on 4 Nov.
  That is a standing allow for a command that destroys data. Nothing records who added it; the likeliest cause is an
  "always allow" answered at an approval prompt, but that is an inference, and it was not a deliberate edit by this work.
  Left as found and committed as found; worth telling Robert so he can keep or remove it.


### 1. Planned, decisions taken, no plan part written yet

- **Confirm before writing, a model parser, and lookup from the Telegram bot (D19-D21 in `docs/PLAN.md`).**
  The first job is to write the plan for it (a Part 13, since Part 12 is now the profile) and get it approved. Order within it:
  1. *Confirm before writing.* Anything parsed or transcribed is shown as "Log 2 eggs and 1 banana to
     breakfast? [Yes] [No]" and written only on Yes. The bot currently writes immediately, which is fine for
     a typed command and unacceptable for a transcript. Needs the bot to handle Telegram callback queries
     (inline buttons), which it does not today; it is stdlib long-polling.
  2. *A model parser* (D19): turns free text into items (food, quantity, unit, section). The app validates
     every field against the person's own foods and the known units; the model never writes and never
     supplies nutrition figures. The key is Robert's and lives in the app's environment, never the bot's or
     the image (D21), with a per-account daily cap and a spend cap set at the provider. Messages go to a
     third party, which must be said to anyone invited.
  3. *Lookup from the bot*: when a name is not found, offer USDA candidates as buttons, using the route that
     already exists (`/api/lookup/foods`; the bot must go through the app, D14).
- **Voice (Part 10 step 3).** A voice note is transcribed and then goes through the same path as typed
  text, including confirmation. **D16 is open:** local whisper.cpp in the image (no key, bigger image, CPU
  per note; Robert already runs `medium.en` locally) or a cloud speech-to-text (a key, per-use cost, audio
  leaves the machine). With a key held centrally the cloud option is now possible. Needs the parser above,
  because speech does not fit `/log food qty unit`. Today a voice note is silently ignored.
- **Leaving and hosting (Part 10 step 4).** R29: a person can delete their account, which forces a decision
  about the foods and entries they leave (R11's `RESTRICT` makes "delete my account" a design question, not
  a line of code). R30: run it on another host over TLS with secrets in the environment. **D17 (what the
  email is for) and "how many people is this for" are open** and decide how much of this is needed. Hosting
  also settles the items under "Left on purpose" below.

### 2. Small follow-ups from Part 11

- **Household units (cup, tablespoon) for looked-up foods.** USDA's search gives per-100 g only; portions
  need a second call per food and a decision about which portion to trust. Today a looked-up food is in
  grams and says so.
- **USDA's long names** ("Cereals ready-to-eat, MALT-O-MEAL, Frosted Flakes") sort under their category
  word. Left alone because the prefix is sometimes the only thing separating two foods; a person can
  rename a food. Robert declined the per-100 g display change for gram foods (the list shows "per 1 g",
  rounded, so protein can read 0); the stored figures and totals are right.
- **Branded foods are excluded (D22).** Kellogg's Frosted Flakes is not in the generic datasets; only a
  Malt-O-Meal equivalent is. Including branded data is a decision, and a noisy one.

### 3. Left on purpose after the code review

- The seeded account's password is still `password`: R1 and a test pin it, and it is Robert's live login.
  Reachable on loopback only now.
- The container runs as root: the live volume's files belong to root, so switching user would break the
  database. Do it with a volume migration when hosting.
- Editing a food's **unit** silently reinterprets old entries (2 cups becomes 2 g). A design decision.
- The session cookie is not `Secure` and the session secret is generated per process, so **every container
  restart signs everyone out** (expect it after a rebuild). Rate limits and the lookup cache are in memory
  and per process. All three are hosting questions (R30).
- Meal totals aggregate every user's ingredients on each read (correct, since the outer join restricts it,
  but it scales with all users). Irrelevant now.

### 4. Open items, not started

- **The pairing flow has never been run with the real bot.** The dialog, the route and the bot are each
  tested, and the e2e test gets a real code, but nobody has pressed Unlink, Get a code, and sent `/bind` in
  Telegram on the live stack. Robert's chat is bound already (set by hand earlier).
- The bot's own coverage is 74% (the polling loop and the HTTP client are not in the unit suite); the
  frontend's remaining gaps are empty-state branches.
- A rare Playwright `net::ERR_NETWORK_CHANGED` console error: a rerun clears it, and the narrow fix (count
  `net::` failures out by status) changes what the suite asserts, so it is Robert's call.
- `docs/COMPLETION-REPORT.md` is the Part 8 snapshot and still quotes 80 / 74 / 22 tests; the root
  `PLAN.md` is the superseded v2 plan, with a banner pointing here, and could be archived.
- Outside this repository: `spring-llm-agent` cannot be pushed (above); chapters 1-3 of the vault's
  *Breaking the Habit of Being Yourself* notes are reconstructions, not built from the book's text.

### The one thing to know first

The **USDA key is in `.env`** and the e2e suite deliberately blanks it (`USDA_API_KEY=` in
`playwright.config.ts`), so the suite never spends it or depends on what USDA says that day. Do not remove
that. Never print, log or commit the key; it has been checked absent from git history.

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
screen that shows the code was built later the same day (the **Telegram** button in the header).

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
- **Robert's own chat is bound** (`users.telegram_id` is set to his chat id, by hand before the screen existed),
  so his bot kept working across the change.

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
is built and verified.

- **Schema version 4.** `users` gained `email`, `telegram_id` and `password_hash`, with unique indexes
  on the first two. The 3 → 4 migration is `ALTER TABLE ... ADD COLUMN`, which is deliberately nothing
  like the 2 → 3 rebuild: new nullable columns need no copy and no foreign-key juggling.
- **`app/passwords.py`.** pbkdf2-sha256 (200,000 iterations then; **600,000 now**, with older hashes upgraded at sign-in), a salt per password, constant-time
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
  judgements. The bot reports sums for the same reason. *(Superseded by Part 12, D25: an account with a
  profile has its targets worked out by the backend; `targets.ts` keeps only the standard four for an
  account without one. See `CLAUDE.md`.)*
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

- **Bootstrap defines its modal variables only on `.modal`.** The overlay is not one, so `--bs-modal-bg`
  (once) and `--bs-modal-padding` (later) were undefined: a transparent dialog, then zero padding on every
  dialog. No test noticed the second; a screenshot did. Declare them on `.brand-overlay`; an e2e assertion
  pins the padding.
- **FastAPI's default 422 echoes the rejected value as `input`.** For `Infinity` that crashed the response
  itself (not JSON) and turned a refusal into a 500; for a too-short password it returned the password. A
  handler in `main.py` drops `input` and `ctx`.
- **`foods_ddl()` describes the current shape, but an old migration step must produce an old one.** The
  2 to 3 rebuild passes `with_source=False`, or a version-2 file would arrive at 3 already holding the 5 to 6
  columns and fail on a duplicate. A test compares a fresh file with a migrated one column for column.
- **USDA's own search ranking is poor and its energy is not always nutrient 208.** Fetch wide and rank
  again; read 208, then 957, then 958. Branded names are written in capitals. Read `app/usda.py`'s
  docstring before changing the ranking.
- **The e2e stack reads the project's `.env`**, so without `USDA_API_KEY=` blanked it would call the real
  service and spend the key.
- **A container restart signs the browser out** (the session secret is per process): sign in again before a
  scripted browser check, or it finds no button and fails.
- **A long command can outlive the tool's timeout.** Run the suites separately, with `timeout`.
- **A controlled number input must never clamp or round on each keystroke.** The Add food quantity box did, so
  clearing it snapped to the 0.25 minimum and the digits typed next were appended to that: typing 183 gave 0.26
  and typing 2 gave 0.25 (reported 4 Nov, reproduced by a failing test first, fixed the same day). Keep the typed
  text in state, read it after the fact (`lib/quantity.ts`), and say when it is out of range instead of changing
  it. The limits are per unit: a gram food is 1 to 5000 (starts at 100, steps by 10); the household units keep a
  quarter to 20. The backend never limited quantity, so those were screen assumptions that made a gram food
  unloggable from this dialog. Tests that type must `clear()` first, as a person does, and a real-keystroke browser
  test (`pressSequentially`) guards it, because `fill()` sets the value in one go and cannot meet this bug.

## Open items

The live list is under "What is left" at the top. This section only keeps the history of one thing worth
remembering: **one browser test was unsound and was fixed.** *logs a meal and expands it into its foods*
added "Light dinner" to a Dinner that already held it, then asserted on the *section*, so it passed by
asserting against the seeded row before the app's re-read, and failed with a strict-mode violation when the
re-read won. Its cleanup also deleted the seed's own dinner, leaving later tests reading a day the seed
never wrote. The lesson generalises: a test that writes must assert on *its* row, not on a section that may
already contain one like it.

## On resume

Verify with the block at the top, read "What is left", and ask Robert before starting any of it. Do not
reopen a finished part without a reason. Claude Code may work on this repository (Robert, 2026-11-02);
`CLAUDE.md` is its entry point and must stay in step with this file.

**On the model.** Parts 11 and 12 were built on `anthropic/claude-sonnet-5.5`, and what made them safe was care, not
cleverness: every claim checked by running it, every new screen looked at rendered, every new test broken on purpose
once to prove it can fail, every rollback claim tested before it was written (one was wrong). The default profile has
been on `deepseek/deepseek-v4.1-flash` since 2 Nov (about 1/44 of Sonnet's input price, 1/20 of its output), and a new
session starts on it. Keep the same habits. If a build turn goes oddly, say so and let Robert switch that stretch back
with `/model anthropic/claude-sonnet-5.5`.

For older detail, the previous conversations are searchable:
`session_search(query='<keywords>', session_id='20261102_161230_0aef4f7a')` (Parts 11 and 12, R54, the 4 Nov work),
`session_search(query='<keywords>', session_id='20261102_123650_9ea56ce6')` (the 2 Nov build) and
`session_search(query='<keywords>', session_id='20261101_132202_4a9b1aef')` (the MVP).
