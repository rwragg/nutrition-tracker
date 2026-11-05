# Nutrition Tracker

An MVP built to a written brief: a food log you can keep for more than one day. A Next.js 16 frontend
and a FastAPI backend in one container, with the log stored in SQLite.

- The brief: [`AGENTS.md`](AGENTS.md)
- The live plan, the phases and the decisions taken: [`docs/PLAN.md`](docs/PLAN.md)
- The database approach: [`docs/DATABASE.md`](docs/DATABASE.md)
- The completion report: [`docs/COMPLETION-REPORT.md`](docs/COMPLETION-REPORT.md)
- The app: [`frontend/`](frontend) - see [`frontend/AGENTS.md`](frontend/AGENTS.md) for how it works
- Screenshots: [`docs/screenshots/`](docs/screenshots) — of the running app, against its own seeded
  sample data, refreshed by `frontend/scripts/capture-screenshots.mjs` rather than taken by hand
- The deck: [`docs/deck/Nutrition-Tracker-Deck.pptx`](docs/deck/Nutrition-Tracker-Deck.pptx) (PDF
  alongside it) — the app, the integrations and the engineering process, with the screenshots in it.
  Built by `docs/deck/build_deck.py`, which reads its colours from the app's own tokens in
  `frontend/app/globals.css` and places every page on the same 16:9 grid, so the deck cannot drift
  from the app's palette or from the page geometry

(`PLAN.md` in the project root is the superseded v2 plan, kept for its history. The live plan is the
one in `docs/`.)

## What it does

- Sign in with `user` / `password` (dummy credentials for the MVP), or create your own account, and log out
- Three views behind a header switcher: **Day**, **Foods**, **Meals**
- Log a day from individual foods with a quantity, or from a whole meal
- Create, edit and delete foods and meals; a meal is composed from foods
- Move between days and open any one of them to dig into its log
- Total each day against calorie and macronutrient targets, or - once you set up a **profile** - against calorie
  and protein targets worked out for you, with the arithmetic shown. You can enter your own figure instead
- A profile comes first: until one is saved the app reads and looks foods up but will not add an entry, a food or a
  meal, from the browser or from Telegram
- Deleting a record that a meal or a day still refers to is refused, with the reason

**The log is kept in the database**, so it is there when you come back, from another browser, and after
the container is rebuilt. The app reads every view from the API - there is no sample data in the
frontend, and nothing is held in the browser beyond what was last read from the server.

## Running the whole stack

One container: FastAPI serves the frontend at `/`, owns the API, and keeps a SQLite database at
`/data/nutrition.db` in a named volume, so it survives a rebuild.

```bash
./scripts/start.sh    # builds and starts; exits 0 once the health check answers
./scripts/stop.sh     # stops it
```

On Windows, `scripts\start.bat` and `scripts\stop.bat`. The app is then at http://localhost:8000/, and
you sign in with `user` / `password` - or create your own account from the same screen, which starts
with an empty log of its own **but cannot be used until the admin approves it** (see below). The first run seeds a sample log, once, into the empty database.
The API is documented in [`backend/AGENTS.md`](backend/AGENTS.md).

## Approving new accounts

A new registration is **pending**: it exists, and it cannot sign in until you approve it. Existing accounts are approved.
You approve from the machine, with a script; there is deliberately no web page or route that does it, so a signed-in
account cannot approve itself or anyone.

```bash
scripts/users.sh list                # every account and its status, and how many are waiting
scripts/users.sh approve NAME        # a waiting account may sign in
scripts/users.sh reject NAME         # a waiting account is deleted
scripts/users.sh disable NAME        # an approved account is switched off; its open sessions end at once
scripts/users.sh enable NAME         # and switched back on
```

To be told when someone registers, put your own Telegram chat id in `.env` as `TELEGRAM_ADMIN_CHAT` (send the bot a
message first) and run the bot. The app queues a notice and the bot delivers it, with the command to approve. Without
that, nobody is told and `list` is how you find out. The app sends no email. Every change is kept in `admin_log`.

## The Telegram front end (optional)

A bot that gives the app three commands — `/today` to read the day back, `/log <food> <quantity> <unit>
[section]` to write one entry, and `/bind <code>` to link the chat to your account. It is a client of
the API rather than a second implementation of it: it holds no records and computes no macros, so a
food edited in the web app moves what the bot reports.

It is behind a compose profile, so the app starts without it and a missing token cannot take the app
down:

```bash
cp .env.example .env      # a token from @BotFather, and a TELEGRAM_BOT_SECRET you generate
docker compose --profile bot up -d --build
docker compose logs -f bot
```

**The bot speaks for a chat, not for an account** (R26). Every request it makes names the chat it is
answering, and the app answers 403 until that chat has been linked to an account — so a chat that has
not been linked can read nothing and write nothing. Linking is a code: the app shows it, the chat
redeems it with `/bind`. No password is ever typed into Telegram.

Two things are worth knowing about the secret: it is shared by **both** services (the app validates the
bot's header against it, the bot sends it), and the bot checks it at startup — `docker compose logs bot`
should say `the app accepted the bot secret`, and it refuses to start if it says otherwise.

**Linking a chat:** in the app, press **Telegram** in the header, then **Get a code**. It shows a line such
as `/bind K7M2QX`; send that to the bot. The code works once and lasts 15 minutes, and the dialog moves
to "linked" by itself when the bot redeems it. You never type your chat id: the bot reads it from the
message. The same dialog unlinks the chat.

What it deliberately does not do, in this cut: no natural-language parsing (text that is not a command
gets a hint, not a guess), no editing of foods or meals, no voice, no photo meals.

## Trying the Telegram bot on a throwaway stack

A second bot (made with BotFather) can be attached to a throwaway stack without touching the live one:

```bash
scripts/link-bot.sh --project nutrition-shots --port 8200 --user alice
```

It asks for the bot's token (hidden), has Telegram confirm it and shows the bot's name, starts only the bot beside that
stack, then asks for the app password (hidden), mints a pairing code and prints `/bind CODE` to send to the bot.
`--check` verifies the token and stops. It refuses the live project and port, and any token another bot already uses
(the live `.env`, or a Hermes profile): one token can be polled by one process only. Nothing secret is shown, logged or
stored. Stop the bot with `docker compose -p nutrition-shots --profile bot stop bot`. The live bot is rotated by hand.

## Screenshots

The pictures in `docs/screenshots/` come from a **throwaway stack**, never the live one: the repository is
public and the live log is somebody's health record. The stack has its own compose project, volume and port,
so the live data is never touched, and the script refuses port 8000 and any stack that already holds a profile
that is not its own invented one.

```bash
NUTRITION_PORT=8200 docker compose -p nutrition-shots up --build --wait
cd frontend && BASE=http://127.0.0.1:8200 node scripts/capture-screenshots.mjs
cd .. && docker compose -p nutrition-shots down -v      # throws the stack and its volume away
```

The stack reads the project's `.env`, so the USDA lookup pictures spend a few calls of the real key. The
pictures use an invented person ("Ana Example", Part 12 example A), never anyone real. The script saves their
profile before the add and create pictures, since an account with none cannot add anything, and takes one picture
(`need-profile.png`) before that to show what such an account sees.

## Tests

```bash
cd backend && uv run pytest          # 450 tests: routes, schema, guards, isolation, accounts, limits, linking, the bot, and the container
cd frontend && npm install
npm test                             # 216 unit and component tests
npm run test:e2e                     # 36 Playwright tests, against its own container on :8100
npm run lint
./scripts/e2e-persistence.sh         # writes through the API, rebuilds the container, reads it back
```

The backend's container tests, and the Playwright suite, both exercise the built image rather than a
development server. The browser suite builds a **stack of its own** - its own compose project, volume
and port, thrown away and rebuilt before every run - so it always starts from a freshly seeded database
and never touches the one you are using. It runs one worker, because its tests share that database.

A run can fail rarely on a browser-level `net::ERR_NETWORK_CHANGED` console error, which the suite's
"no console errors" assertion counts and which has nothing to do with the app; a rerun is the remedy.
See `docs/COMPLETION-REPORT.md` for the evidence.

Expected figures come from two sides on purpose: the page's own arithmetic is asserted against the same
calculations run over what the API returned, and the figures the server reports are asserted against the
server's numbers. Comparing the two to each other would turn a float's summation order into a failure.

