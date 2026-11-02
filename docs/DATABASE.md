# Database approach

**Status: approved and implemented (Part 5 of `docs/PLAN.md`).** Robert approved the four decisions at
the end of this document as proposed, on 2026-11-01. The schema, the seed and the delete guards are in
`backend/app/db.py`; the routes that use them arrive in Part 6.

The machine-readable form of this schema is [`schema.json`](schema.json), which carries the tables, the
columns, the constraints and the exact `CREATE` statements they translate to. This document is the
reasoning: what each choice buys, what it costs, and what it deliberately leaves out.

## What it is

- **SQLite**, in one file, via Python's standard-library `sqlite3`. No ORM, no query builder, no
  migration framework — the app's needs are six tables and a handful of queries, and a dependency-free
  module is smaller than the configuration any of those would need.
- **The file is created if it does not exist**, as the brief asks (R17).
- **Every connection sets `PRAGMA foreign_keys = ON`.** SQLite defaults this to *off*, and every delete
  guard in this schema is a foreign key — so without that line the storage-level guard simply is not
  there. It is the one setting that would fail silently, which is why it is named here and not just in
  the code.
- **The file lives at `/data/nutrition.db`**, mounted as the named volume `nutrition-data` in
  `docker-compose.yml`. Without a volume, `docker compose up --build` would start from an empty
  database every time and the log would look like it had been wiped.

## The tables, and why each one exists

| Table | What it holds | Why not folded into another |
| --- | --- | --- |
| `users` | one row per person | every other table carries `user_id`, so R2 is a filter rather than a redesign |
| `foods` | a food and the macros one unit of it contributes | the unit is part of the record; macros are per unit, exactly as the frontend's `Food` type says |
| `meals` | a named group of foods | the name is the whole record |
| `meal_foods` | which foods a meal is made of, and how much of each | a meal is a list, and a list in a column would have to be parsed to answer "which meals use this food?" |
| `days` | one row per calendar day of log | the date is the identity that matters: "today" is looked up by date |
| `entries` | one thing logged into one section of one day | the only table the frontend's `LogEntry` maps to |

## Decisions worth stating

- **TEXT ids, not integers.** Seeded rows keep the slugs the frontend already uses (`hummus`,
  `post-workout-shake`, and ISO dates as day ids), and new rows get generated ids. Integers would be
  tidier in the abstract, but the seeded values would then be renumbered, and the ids are what the
  existing test suite computes its expectations from.
- **The entry table holds a food *or* a meal, enforced by a check constraint**, not two tables and not a
  nullable pair without a rule. A meal entry has no quantity — the app logs a meal whole — and the check
  constraints say so, so an entry that is neither, or both, cannot be written at all.
- **Real dates are validated by `strftime`.** `CHECK (strftime('%Y-%m-%d', date) = date)` rejects
  anything that is not an ISO date, including impossible ones: `strftime` normalises `2026-02-31` to
  `2026-03-03`, which no longer equals the input.
- **No unique constraint on a food's name, and none on (meal, food).** Both would be reasonable in a
  stricter product. Here the UI allows a duplicate name and allows the same food twice in a meal, so a
  constraint the interface does not enforce would reject a save that looked fine to the person making
  it. Where a rule matters to a person, the interface and the database should agree.
- **Entries come back in insertion order** (SQLite's implicit rowid). There is no position column
  because the app never reorders an entry, only adds and removes one.
- **A `meta` row records the schema version.** If the file was written by a different version of this
  schema, the app says so rather than failing strangely. One row, one lookup. If you would rather not
  have the table, checking whether `users` is empty achieves most of the same thing — it is an open
  question below.

## Delete behaviour (R11)

**Nothing cascades.** Every reference is `ON DELETE RESTRICT`, so the database itself refuses to leave a
meal pointing at a food that is gone.

There are two layers on purpose, and they do different jobs:

1. **The API checks first, because the refusal has to explain itself.** "used in 2 meals (Typical
   breakfast, Pasta night) and logged directly on 1 day (Today)" is a query result, not an error
   message — it is the same information `frontend/lib/usage.ts` computes today.
2. **The foreign key is the backstop.** It holds even if a route forgets to check, or a new route is
   added later by someone who has not read this page.

Days, entries and users are not deletable in the MVP, and their references are `RESTRICT` anyway.
Removing an entry is not a delete of a record — it is an edit of the day — so it is allowed.

## The seed (R14)

- **Runs only against an empty database** — no rows in `users` — so a restart or a rebuild can never
  re-seed or duplicate the sample.
- **The same sample the frontend ships today**: 31 foods, 5 meals, and 3 days (today, yesterday, the day
  before), for the MVP user.
- **It moves to the backend**, because the backend is what writes it. `frontend/lib/seed.ts` stops being
  the source of the data and is retired in Part 7, when the tests that compute expectations from it get
  re-pointed at the API.
- **The seeded days are relative to the date of the first run** and do not re-date themselves, so the
  sample history ages. That is the same behaviour as today, where the days are seeded from "now" on every
  load.

## The schema, as run

The DDL was executed against SQLite before this document was written, and every rule was tested rather
than described. Fourteen probes, each expecting a refusal:

| Probe | Result |
| --- | --- |
| delete a food a meal uses | refused (`FOREIGN KEY constraint failed`) |
| delete a food a day logs directly | refused |
| delete a meal a day logs | refused |
| an entry that is neither a food nor a meal | refused (`CHECK`) |
| an entry that is both | refused |
| a meal entry carrying a quantity | refused |
| a zero quantity | refused |
| an impossible date, `2026-02-31` | refused |
| a malformed date, `01/11/2026` | **allowed at first — see below** |
| two days for the same user and date | refused (`UNIQUE`) |
| a unit outside the seven | refused |
| a negative calorie count | refused |
| an entry on a day that does not exist | refused |
| an unknown user on a food | refused |

And the case that must *not* be refused: deleting a food nothing references any more — allowed, once its
last entry and ingredient are gone.

**The malformed date got through, and that changed the schema.** The rule was written
`CHECK (strftime('%Y-%m-%d', date) = date)`. `strftime` returns NULL for a string it cannot parse, and
SQLite treats a CHECK that evaluates to NULL as *passing* — so `01/11/2026` was accepted. It is now
`CHECK (strftime('%Y-%m-%d', date) IS date)`, which is false rather than unknown for an unparseable
date. All three bad-date probes are refused now, and a real ISO date still passes.

**One more thing the run showed:** `PRAGMA foreign_keys = ON` cannot be changed inside a transaction —
SQLite ignores the setting silently. Demonstrated in a fresh connection: with the pragma off, a food a
meal still uses was deleted and the meal was left pointing at nothing. That is the failure the pragma
exists to prevent, and it is silent, which is why the setting is stated in this document and not only in
the code.

## What Part 6 builds from this

Routes for foods, meals, days and entries; the day's summary figures; both delete guards with the
reference named; every route scoped to the signed-in user; the database created if absent. The tests
Part 5 asks for, run when the code exists:

- **P5.2** creating the database from nothing works: an empty file becomes the full schema, and the seed
  fills it exactly once.
- **P5.3** R11's guard exists at the storage layer: with `PRAGMA foreign_keys = ON`, deleting a food that
  a meal uses raises, and does so even when the API's own check is bypassed.

## What is deliberately not here

- **Targets.** R10 and R17 put them in one place, `frontend/lib/targets.ts`. The API returns sums, not
  judgements, so nothing needs to store them. Per-user targets would fit this schema later.
- **Timestamps.** Nothing reads them yet.
- **Migrations.** One version, created if absent, named in `meta`. Before release a schema change means
  deleting the file; after release it means a migration, and that is a decision to take then rather than
  machinery to build now.
- **Passwords and sessions.** The MVP credential is a constant in the application (R1); the session is a
  signed cookie. Neither is data.

## What I am asking you to sign off

1. **TEXT ids everywhere**, keeping the seeded slugs, rather than integer keys with a re-pointed test suite.
2. **The `meta` version row** — keep it, or drop it and rely on `users` being empty?
3. **The file at `/data/nutrition.db` in a named volume**, so a rebuild does not wipe the log.
4. **Targets staying out of the database** for now, in `frontend/lib/targets.ts` as R10 and R17 specify.

On your word I will implement it: the schema module, creation on startup, the seed, and the two tests
above — and no code will be written against this schema before then.
