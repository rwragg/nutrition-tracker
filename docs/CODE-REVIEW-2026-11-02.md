# Code review, 2026-11-02

Scope: the whole tree at tag `linked-chats-2026-11-02` plus the doc edits made since (`HEAD` is documentation
only). Reviewed by reading: `backend/app/*.py` (all seven modules), `backend/Dockerfile`,
`docker-compose.yml`, `.env.example`, `.gitignore`, `.dockerignore`, `scripts/start.sh`, and in the frontend
`lib/api.ts`, `lib/use-tracker.ts`, `components/App.tsx`, `SignIn.tsx`, `Dialog.tsx`. Not read in full:
`DayView`, `FoodsView`, `MealsView`, the four form dialogs, `nutrition.ts`, `globals.css`, the Playwright
spec, the test suites, the Windows scripts. Nothing here says those are clean.

Each finding is marked **run** (reproduced against the code in a scratch database, probes in
`~/.hermes/cache/scratch/`) or **read** (from reading only, not executed). Nothing in the repo was changed
by this review except this file.

Baseline at review time: backend 197 passed, frontend 78 passed, lint and `tsc` clean, Playwright 24
passed, persistence script exit 0. `npm audit --omit=dev`: 0 vulnerabilities. `pip-audit`: none known.

## Summary

The core is in good shape. Every nutrition route is scoped by user and the 404-not-403 rule holds. SQL is
parameterised throughout (the one f-string query uses fixed column names). Password storage is sound apart
from the iteration count. The migration chain and its reasoning are careful. The bot does what the docs say
on the happy path.

The problems cluster in three places: the **chat-binding design has a hole** (R24 and R26 contradict each
other), the **bot has two unhandled crash paths and nothing restarts it**, and **the stack is reachable from
the network with a well-known password**. None needs a rewrite. All are small fixes.

| # | Severity | Finding | How found |
|---|---|---|---|
| 1 | High | Registration can claim any Telegram id, bypassing the pairing code | run |
| 2 | High | The bot dies on a failed send or a failed read-back, and is never restarted | run + read |
| 3 | Medium | Port 8000 is published on all interfaces, and `user` / `password` holds the real log | read |
| 4 | Medium | `Infinity` and `NaN` are accepted as macro values and corrupt totals | run |
| 5 | Medium | Dialog refocuses its first field whenever the parent re-renders | read |
| 6 | Medium | Day switching can show the wrong day's data (response race) | read |
| 7 | Low | Login and register leak which usernames and emails exist, contradicting the docs | run |
| 8 | Low | PBKDF2 at 200,000 iterations is below current guidance | read |
| 9 | Low | No throttling on login, register or bind | read |
| 10 | Low | The bind route can answer 500 where it means 409 | read |
| 11 | Low | Smaller items (list below) | mixed |

## 1. Registration can claim any Telegram id (High, run)

`POST /api/register` accepts `telegram_id` (`auth.py:62`, written at `auth.py:192-202`) and stores it
unverified. R26 and D18 say a chat is bound by redeeming a code, so that nobody can attach a chat to a log
they do not own. Registration is a second door past that rule.

Reproduced: register `mallory` with `telegram_id = "555111"`. The bot, acting for chat 555111, is then
served mallory's account (`201` on a write). When the real owner of chat 555111 later registers and tries
`/bind` with a valid code, the answer is `409 this chat is already linked to another account`. So the
attacker both receives the victim's logged food and locks the victim out of linking.

Impact today is low, because `TELEGRAM_ALLOWED_USERS` gates the bot to your chat and your chat is already
bound (the unique index refuses a second claim). It becomes real the moment `TELEGRAM_ALLOWED_USERS` is
emptied so other people can register, which is exactly the Part 10 goal.

Fix: remove `telegram_id` from `Registration` and from the register form. The only way to bind a chat is the
code. One field, one form input, a handful of tests to adjust. This also removes the need for the
"Telegram id (optional)" input in `SignIn.tsx:108-117`. Note that R3 in the brief asks for a telegram id at
registration, so this is a requirement change to take deliberately: the pairing code satisfies the intent.

## 2. The bot dies on two ordinary failures and is not restarted (High, run + read)

`handle()` says it "never raises" (`bot.py:309`). It does, in two places:

- **After a successful write** (`bot.py:357`). `api.day(...)` runs outside the `try`. If it fails (an
  HTTP 5xx, or a timeout), `HTTPError` escapes. The entry was already logged, the bot dies, and the person
  gets no reply. **Run:** a stub whose `day()` raises `HTTPError` makes `handle("/log rice 1 cup")` raise.
- **A non-JSON body.** `Api.request` calls `json.loads` (`bot.py:209`). Only `OSError` is caught in
  `handle`, and `JSONDecodeError` is a `ValueError`. A proxy error page or a 502 HTML body would escape.
  **Run:** confirmed with a stub.

The poll loop adds a third (read): `send(...)` at `bot.py:414-416` is outside any `try`, so a Telegram
failure on send kills the process. Realistic triggers: the user blocked the bot (Telegram answers 403), a
transient network error, or a reply over 4096 characters (a long `/today`).

The compose file sets `restart: "no"` (`docker-compose.yml:54`), with a good reason written beside it (a
restart loop on misconfiguration). The effect is that any of the above leaves the bot stopped until someone
notices. It is also worse than a normal crash: the failing update was never acknowledged to Telegram, so
once restarted the same message is redelivered and can kill it again.

Fix, in order of value:
1. Wrap the whole per-update body in the loop in a `try/except Exception` that logs and continues. This
   makes the claim in the docstring true and closes all three paths.
2. Move the read-back at `bot.py:357` inside the existing `try`, and add `ValueError` to the caught
   exceptions in `handle`.
3. Change the policy to `restart: on-failure:5`. A misconfigured start exits non-zero immediately and burns
   five attempts, which keeps the original concern, while a runtime crash recovers.
4. Add tests: a stub whose `day()` fails after a write, and `send()` raising.

## 3. Reachable from the network with a known password (Medium, read)

`docker-compose.yml:8` publishes `${NUTRITION_PORT:-8000}:8000`, which binds every interface, and
`docker compose ps` shows `0.0.0.0:8000`. The sign-in screen prints the credential (`SignIn.tsx:79`:
"This MVP also signs in with user / password"). The `user` account is the seeded one, and it is the account
holding your real log and your bound chat id. Anyone on the same network who can reach the machine can read
and edit your log. I did not test from another host, and a host firewall may already block it, so confirm
before treating this as exploitable.

Fix: bind to loopback with `127.0.0.1:${NUTRITION_PORT:-8000}:8000`, and change the seeded account's
password (or stop printing it on the sign-in screen once the app is used for real). For hosting (R30) both
become mandatory, and the seeded account should not exist on a host that holds anyone else's data.

## 4. `Infinity` and `NaN` pass validation (Medium, run)

`FoodIn` uses `float` with `ge=0` (`api.py:38-44`). Pydantic accepts `Infinity` and `NaN` by default.

- `Infinity`: `201`. The stored value is infinite, JSON serialisation renders it as `null`, the frontend
  reads `null ?? 0` as `0` (`api.ts:76`), and any day logging that food shows a wrong total with no error.
  **Run:** the day and the day list both return `200` with `calories: null`.
- `NaN`: the request answers a server error after the write is attempted
  (`ValueError: Out of range float values are not JSON compliant`).

The same applies to `quantity` fields (`IngredientIn`, `EntryIn`). Fix: `Field(ge=0, allow_inf_nan=False)`
on the four macros and on every quantity, with a test per field. Related, and found in the same probe: a
food named only spaces is accepted (`201`), since `min_length=1` does not strip. Either strip and re-check
or add a pattern. Also no maximum length on a name or on the ingredient list.

## 5. Dialog steals focus on every parent re-render (Medium, read)

`Dialog.tsx:19-53` registers its keydown handler and moves focus to the first input in an effect that
depends on `[onClose]`. Every caller passes an inline arrow (`onClose={() => setDialog(null)}` in
`FoodsView`, `MealsView` and `DayView`), so the identity changes each time the parent renders. Each parent
render therefore tears the effect down (refocusing the old trigger) and re-runs it (focusing the first field).
Today this mostly goes unnoticed because the dialogs close after a write. It will not stay unnoticed: the
pairing-code dialog is the next task and will re-render while open (an expiry countdown, or a poll for the
linked state), and its focus would jump each time.

Fix: keep `onClose` in a ref inside `Dialog` and make the effect run once (`[]`). Add a component test that
re-renders the parent while a field has focus and asserts focus stays. Also: with no focusable elements,
`first` and `last` are undefined and Tab throws (`Dialog.tsx:34-43`); guard it.

## 6. Day switching can show the wrong day (Medium, read)

`selectDay` (`use-tracker.ts:132-144`) sets `openDate.current = date`, then `await api.getDay(date)` and
sets the result without checking that `date` is still the open one. Click day A, then day B quickly. If A's
response lands after B's, the screen shows A's log while `openDate.current` says B, and the next write is
sent to A's `day.date`. It cannot corrupt data on its own, but a person can log a meal into the wrong day
with the right day highlighted. Fix: ignore a response whose `date !== openDate.current`. The momentary
`emptyDay` at the start also flashes zeros before the data arrives, so a loading state would be more honest.

## 7. Account enumeration, contrary to the docs (Low, run)

`auth.py:14` and `backend/AGENTS.md` state that the API does not tell a stranger which usernames exist.
Two things say otherwise:
- `register` answers `409 that username is already registered` or names the email. That is a conscious
  choice recorded in the code, but it contradicts the sentence above it.
- `login` does no hashing for an unknown username, so the response is about 10 times faster: **run**,
  20.0 ms for an existing user against 2.0 ms for an unknown one, with a wrong password in both cases.

Fix: for the timing gap, verify against a fixed dummy hash when the user is not found. For the 409s, either
accept the leak (needed for good error messages on a registration form) and correct the sentence in the
docs, or move to email-based confirmation, which is already in the list of unbuilt items in `RESUME.md`.

## 8. PBKDF2 iterations (Low, read)

`passwords.py:26` uses 200,000. The OWASP password storage guidance for PBKDF2-HMAC-SHA256 is 600,000. The
stored format carries its iteration count, so raising the constant needs no migration; old hashes keep
verifying. Rehash on successful login when the stored count is lower than the constant. Note this makes the
login cost, now about 20 ms, about 60 ms, which is another reason for finding 9.

## 9. No throttling (Low, read)

Nothing limits `POST /api/login`, `/api/register` or `/api/telegram/bind`. Consequences: online password
guessing, unbounded account creation filling the database, and a CPU cost of about 20 ms per login attempt
as an easy way to load the server. The pairing code is six characters from a 31-letter alphabet (about 887
million values) with a 15-minute life, so guessing it is impractical, but there is no attempt limit on it
either. For a two-person deployment this does not matter. For anything public it does. A small in-process
counter per IP and per username is enough at this size.

## 10. `bind` can answer 500 where it means 409 (Low, read)

`telegram.py:153-178` checks that the chat is unbound and then updates, as two steps. Two simultaneous binds
to the same chat can both pass the check, and the second `UPDATE` then violates `users_by_telegram`. That
`IntegrityError` is not caught here (it is caught in `register`), so the person sees a server error rather
than the 409 message. Catch `sqlite3.IntegrityError` around the `UPDATE` and return the same 409.

## 11. Smaller items

- **The bot tells people to press a button that does not exist** (`bot.py:275`, `bot.py:284`: "press
  Telegram in the header"). True once the pairing screen is built; wrong until then.
- **Registering then failing to sign in reports the wrong thing** (`SignIn.tsx:46-57`). If `registerAccount`
  succeeds and the following `signIn` fails, the message is "That account could not be created", but it was.
- **`signOut` has no error handling** (`App.tsx:73-76`). If the request fails the person stays signed in with
  no message.
- **The footer says "Saved." unconditionally** (`App.tsx:159-161`), even directly under an error line.
- **`getSession` returns only `{ username }`** (`api.ts:107`), though the server also sends `email` and
  `telegram_id`. The pairing screen will want the latter to show the linked state.
- **Editing a food's unit does not touch existing entries.** A food logged as "2 cup" and then changed to
  `g` becomes "2 g" in every past day with no warning. The bot guards against unit mismatch at log time; the
  API and the edit form do not. A design decision for you, noted because the gram basis made it a bigger
  jump than it used to be.
- **The container runs as root** (`backend/Dockerfile` has no `USER`). Low on a local box; worth fixing before
  hosting.
- **The session cookie is not `Secure`** (`main.py:36-41`, `https_only=False`) and the session secret is
  regenerated each start (`auth.py:37`), signing everyone out on every restart. Both are written down as MVP
  decisions. Both change for R30.
- **Meal totals are aggregated over every user's ingredients** on every read (`api.py:97-106`, the subquery
  has no user filter). Correct, since the outer join restricts it, but cost grows with all users, not with
  yours. Irrelevant now, relevant at hundreds of users.
- **`.env.example` is clean and `.env` is ignored and untracked.** The bot secret in `.env` is 43 characters.
  No token-shaped string appears anywhere in git history (checked with a pattern over `git log --all -p`).
  Your Telegram id (8685521777) is in tracked test files and `docs/RESUME.md`. In a private repo that is
  fine; remove it before making the repo public.

## Documentation drift

- `auth.py:14` and `backend/AGENTS.md` claim usernames are not disclosed (finding 7).
- `bot.py:309` says `handle` never raises (finding 2).
- `docs/COMPLETION-REPORT.md` still quotes the Part 8 counts (80 / 74 / 22). It is a dated snapshot, so this
  is expected, but a reader skimming it will see stale numbers beside a README that says 197 / 78 / 24.
- `README.md` correctly says the pairing screen is not built. `bot.py` help text and the sign-in screen
  speak as if it is, or as if the credential is still public (findings 3 and 11).
- `docs/RESUME.md` says "Nothing is outstanding" in its On resume section while its own "What is left"
  lists three tasks. The section predates the later edits.

## What is solid, so it is not re-litigated

- Every route in `api.py` is user-scoped, including the update and delete statements, because each is
  preceded by an ownership check. Another account's record answers 404.
- The delete guards, the foreign keys with `ON DELETE RESTRICT`, and `PRAGMA foreign_keys = ON` per
  connection.
- All SQL is parameterised. The one interpolated column name (`auth.py:179`) is from a fixed tuple.
- The migration chain: version recorded by the loop, not by the step; version check before DDL; row count
  verified before the old table drops.
- Constant-time comparison for passwords and for the bot secret; a missing or malformed hash fails closed.
- Pairing codes: single use, expiry in SQL, any other live code burnt on redeeming.
- Bot request headers cannot select an account the chat is not bound to.

## Suggested order

1. Findings 1 and 2. They are the two that matter once anyone but you uses it, and finding 2 matters now.
2. Finding 3 (one line of compose, plus a password change).
3. Findings 4, 5 and 6, before building the pairing screen. Finding 5 will bite that screen directly.
4. The rest as part of Part 10 step 4 (hosting).

## Resolution, same day

Every finding below was fixed except where marked. Each fix has a test, and the tests that guard a
behaviour were run against the old code to confirm they fail without the fix (the focus, day-race and
non-finite-number tests did; the squat is reproduced by `test_registration_cannot_claim_a_chat`).

| # | Finding | What changed |
|---|---|---|
| 1 | Registration claims a chat | `telegram_id` removed from the registration body and the form; a chat is bound only by a code. **A requirement change:** R3 asked for it, and `AGENTS.md` now says why it is not there. |
| 2 | Bot crashes, no restart | The read-back after a write is inside its own `try` and reports "logged, but could not read the day back"; `ValueError` (non-JSON) is caught; each update is answered inside a catch-all so one failure cannot stop the loop; replies over 4096 characters are sent in pieces; compose restarts the bot `on-failure:5`. |
| 3 | Published on all interfaces | Port published as `127.0.0.1:8000`. Checked: reachable on loopback, refused on the LAN address. The sign-in screen no longer prints the credential. **Not done:** the seeded account's password is still `password`, because R1 and a test pin it and changing it on the live database is your decision. |
| 4 | `Infinity` / `NaN` | `allow_inf_nan=False` on macros and every quantity; names trimmed, non-blank, at most 200 characters; meals at most 100 ingredients. Fixing this exposed a second bug: FastAPI's 422 echoed the rejected value, and `inf` is not JSON, so the refusal itself crashed. A handler now drops `input` and `ctx`, which also stops a rejected password being returned in the response. |
| 5 | Dialog steals focus | `onClose` is held in a ref and the effect runs once; Tab with nothing to focus no longer throws. |
| 6 | Day-switch race | A late answer for a day that is no longer open is discarded. |
| 7 | Enumeration | An unknown username is hashed against a dummy value, so both refusals take the same time. Registration still names the colliding field on purpose, and the docs now say so. |
| 8 | PBKDF2 cost | 600,000 iterations; an older hash is upgraded when its owner signs in. The live `user` hash is already upgraded. |
| 9 | No throttling | `app/ratelimit.py`: 10 failed sign-ins per username and 30 per address in 15 minutes, 20 registrations per address per hour, 10 failed code attempts per chat in 15 minutes. In memory, per process. |
| 10 | Bind race gives 500 | `IntegrityError` on the update is a 409. |
| 11 | Smaller items | Fixed: register-then-sign-in-fails message, log-out failure shown, "Saved" note hidden while an error shows, `getSession` carries `email` and `telegram_id`. **Not done, deliberately:** the container still runs as root (the existing volume's files belong to root, so a non-root user would break the live database; do it with a volume migration when hosting); editing a food's unit still reinterprets old entries (a design decision); the bot help text still says "press Telegram in the header" (true once the pairing screen exists); the session cookie and secret stay as MVP settings until hosting. |

Documentation drift fixed: the enumeration claim in `auth.py` and `backend/AGENTS.md`, the test counts,
`AGENTS.md`'s registration line. `COMPLETION-REPORT.md` is left as the Part 8 snapshot it is.

Verified after the changes: backend 235 passed plus 5 container tests, frontend 84 passed, lint and `tsc`
clean, Playwright 24 passed, `e2e-persistence.sh` exit 0, the rebuilt stack healthy with the bot reporting
"the app accepted the bot secret".
