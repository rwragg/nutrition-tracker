# Database approach

**Status: approved by Robert 2026-11-01, implemented in Parts 5 and 6, and revised four times since.** The
four decisions at the end were approved as proposed. Four things have changed: **the `days` table is
gone** — a day of the log is the date on an entry, not a row of its own — **`foods` gained the gram
basis**, **`users` became a real account** with an email, a telegram id and a password hash, and
**`telegram_codes`** arrived so a chat can be bound to an account. The reasoning for all four is below;
the schema version went 1 → 2, 2 → 3, 3 → 4 and 4 → 5 with them, and 5 → 6 since (below).

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
| `entries` | one thing logged, in one section, on one date, by one user | the only table the frontend's `LogEntry` maps to — and it carries its own date, so there is no day table to join through |

## The revision: a day is a column, not a table

The schema was approved and built with a `days` table, and the entry pointed at it. Two things then
showed up in Part 6, and one of them was mine to fix:

1. **A day had to exist before anything could be logged into it.** The seed created three days, dated
   when it first ran. A day later there was no row for *today*, so R4 — log your meals — was impossible
   until an endpoint was invented to open a day. That endpoint (`POST /api/days`, idempotent, creating
   the row on first use) was a workaround for the table, not a requirement.
2. **The table was a second home for the same fact.** The entry's day was fixed by `day_id` while the
   date lived in another table, so the simplest question — *what did I log on 2026-11-01?* — needed a
   join, and every write had to check that the day existed.

With `date` and `user_id` on the entry, all of that goes:

- Logging any date works; there is nothing to open first.
- A date with nothing on it reads as an **empty day**, not a 404 — an empty day needs nothing stored to
  exist, which is exactly what the table was for.
- There is no "no such day" to answer, so a whole class of refusal disappears.
- Every read is scoped by a column rather than a path through two tables, which is a direct win for R2.

**What was given up, stated plainly:** a *stored* empty day, and a place for facts about a day rather
than about an entry (a daily note, a per-day target, a weigh-in). No requirement asks for either. If one
ever does, a small `days(user_id, date)` side table can hold it and be joined on the date, without
touching a single entry.

**Why the version moved to 2.** There is no migration machinery for a file from a version this build
does not know (see below), so a file written by the old shape must be refused rather than misread. On
first run after that change the app said the file was schema version 1 and exited; delete the volume
and it created version 2 from scratch. For a seeded sample that was the whole cost — and it was the
last time that answer was good enough, for the reason in the next section.

## The revision that needed a migration: `g`, and version 3

**What changed.** The unit list gained `g`, the gram basis: a food recorded in grams carries its
macros per gram, so 183 g of yogurt at 0.61 kcal/g logs 111.63 kcal. This is D13 in `docs/PLAN.md`,
and it exists because every real nutrition label and every spoken portion is weighed — the seven
volume and count units could not express "183 g" at all.

**Why it could not be a delete-the-file change.** The first revision could be absorbed by throwing
the sample away; this one arrived after the log was real, and *"start a new file"* is not a
migration. So the app grew its first one, and the rule it establishes is the one to keep: **a file
from an older version is migrated where a step exists for it, and refused where none does.** A
version this build cannot carry forward must never be read as if it matched.

**How the step works.** `foods` is rebuilt in place — a new table with the widened CHECK, every row
copied across verbatim, the old table dropped, the new one renamed, the index recreated — because
SQLite cannot alter a CHECK constraint and the table is referenced by `meal_foods` and `entries`.
Three details are load-bearing:

- **Foreign keys are turned off for the drop, outside any transaction.** `PRAGMA foreign_keys` is
  silently ignored inside one, so setting it there would leave the constraint enforced and the drop
  refused — the failure would look like a permissions problem.
- **The copy is counted before the old table goes.** While foreign keys are off nothing else is
  checking, so the migration verifies it copied as many rows as it found and raises if not.
- **Nothing is interpreted.** No value is rewritten, no unit is converted; the only change is the
  list of units the CHECK accepts. That is why the rows can be carried forward at all.

Verified on the real file, not only in tests: the pre-change database (31 foods, 5 meals, 19 meal
ingredients, 17 entries) migrated to version 3 with every row intact, `PRAGMA foreign_keys` back on,
the seeded entries still resolving to their foods, and the delete guard still refusing.

## The revision after it: accounts, and version 4

**What changed.** `users` gained `email`, `telegram_id` and `password_hash`, so registration (R3, R24)
is possible. D4 said the schema had been shaped so that R3 "can arrive later without a migration", and
that was true of *rows* — every route already scoped by `user_id`, so a second person needed no schema
change at all. It was not true of *columns*, and the columns are what an account needs. The claim was
half right, and the half that was wrong is the reason this step exists.

**How the step works — and why it looks nothing like the last one.** `ALTER TABLE ... ADD COLUMN` for
each of the three, then the two unique indexes, then the existing account is given the password it has
always signed in with, hashed. No copy, no verification by count, no foreign keys switched off: the
columns are new and nullable, so SQLite adds them in place. **When a change does not need the heavy
machinery, do not use it** — the previous section's rebuild is the exception, not the pattern.

Two details are load-bearing:

- **Uniqueness is a pair of indexes, not a column constraint.** `ALTER TABLE` cannot add `UNIQUE`. The
  indexes are created by the migration *and* by `SCHEMA`, so a fresh file and a migrated one end up
  indistinguishable — which is all the version number ever claims.
- **A null `password_hash` fails closed.** An account with no stored password is an account nobody signs
  into, and `passwords.verify_password` returns False for a missing or malformed value rather than
  raising. That is why the column is nullable and why the migration hashes the MVP password into the
  rows that predate it, rather than leaving them empty and locking their owner out.

**And one thing that was wrong before this step existed.** The 2 → 3 migration recorded
`SCHEMA_VERSION` as the version it had reached. With one migration in the file that is correct; with
two it is a trap: the file jumps to the newest version after the first step, the loop finishes, and
every later step is skipped in silence. The version a step produces is now recorded beside the step
(`MIGRATIONS` maps *from* to *to* and function) and written by the loop, so no step can jump the queue.
The 2 → 4 test runs the whole chain for exactly this reason.

## Pairing codes, and version 5

**What changed.** One new table, `telegram_codes`: a short-lived, single-use code that binds a chat to
an account (R26, D18 — the app shows the code, the chat redeems it). The binding itself is not new:
`users.telegram_id` has been there since version 4, and its unique index is what makes a chat belong to
**exactly one** account, and an account to at most one chat.

**How the step works.** It creates a table and nothing else, which is why it is three lines of SQL and
a docstring explaining that it deliberately does no more: a new table needs no rebuild, no column
addition and no data copied. Existing rows are untouched and keep their bindings.

**Why the codes are stored rather than signed.** A signed code can be verified without any state, which
is elegant — but it cannot be made to *stop* working once it has been used, and a code that keeps
working is one somebody else can use. A row with a `used` flag buys single use, and single use is the
whole property. The row also makes expiry a data question rather than a clock question: `expires` is a
fixed-width UTC string, so it compares correctly as a string in SQL and in Python alike.

## Where a food came from, and version 6

**What changed.** `foods` gained `source` (`typed` or `usda`, NOT NULL, default `typed`) and `source_id`
(USDA's own `fdcId`, nullable). A food looked up in USDA FoodData Central (D20) records that it was, and
which USDA food it was, so a figure can be traced to where it came from rather than being one more number
somebody once typed.

**How the step works.** Two `ALTER TABLE ... ADD COLUMN`, nothing copied, no foreign keys switched off.
`source` is NOT NULL with a default, so every food that exists reads as `typed`, which is true of all of
them: nothing could be looked up before this. Verified on the live file, not only in tests: 31 foods, all
`typed`, schema 6.

**One trap, found in the migration chain.** The 2 → 3 step rebuilds `foods` from `foods_ddl()`, which now
describes the *current* shape. Left alone, a version-2 file would arrive at 3 already carrying the source
columns, and the 5 → 6 step would then fail on a duplicate column. `foods_ddl` takes `with_source=False`
for that one call so each step produces the shape of the version it names - the same lesson as the version
number recorded beside each step, applied to the table definition. A test compares a fresh file with a
migrated one column for column.

**What it does not do.** There is no table-level rule that `usda` goes with an id: SQLite cannot add one
by `ALTER`, and a fresh file and a migrated one must be the same shape. The API enforces the pairing.

## Decisions worth stating

- **TEXT ids, not integers.** Seeded rows keep the slugs the frontend already uses (`hummus`,
  `post-workout-shake`), and new rows get generated ids. Integers would be tidier in the abstract, but
  the seeded values would then be renumbered, and the ids are what the existing test suite computes its
  expectations from. A day has no id at all now — its date is its identity.
- **The entry carries its own `user_id`** rather than reaching a user through a food, a meal or a day.
  It is the fact being recorded, it makes every query trivially scoped, and it means "this entry
  belongs to this person" is a column with a foreign key behind it rather than a derived property.
- **The entry table holds a food *or* a meal, enforced by a check constraint**, not two tables and not a
  nullable pair without a rule. A meal entry has no quantity — the app logs a meal whole — and the check
  constraints say so, so an entry that is neither, or both, cannot be written at all.
- **Real dates are validated by `strftime`, with `IS` and not `=`.** `CHECK (strftime('%Y-%m-%d', date) IS date)`
  rejects anything that is not an ISO date, including impossible ones: `strftime` normalises `2026-02-31`
  to `2026-03-03`, which is no longer equal to the input. The comparison is `IS` because `strftime`
  returns NULL for a string it cannot parse and SQLite treats a CHECK that evaluates to NULL as *passing* —
  which is how a malformed date got through the first version of this rule. See the probes below.
- **No unique constraint on a food's name, and none on (meal, food).** Both would be reasonable in a
  stricter product. Here the UI allows a duplicate name and allows the same food twice in a meal, so a
  constraint the interface does not enforce would reject a save that looked fine to the person making
  it. Where a rule matters to a person, the interface and the database should agree. There is likewise
  no unique constraint on an entry: logging the same food twice in a meal section is a real thing to do.
- **Entries come back in insertion order** (SQLite's implicit rowid). There is no position column
  because the app never reorders an entry, only adds and removes one.
- **A `meta` row records the schema version.** If the file was written by a different version of this
  schema, the app says so rather than failing strangely. One row, one lookup.

## Delete behaviour (R11)

**Nothing cascades.** Every reference is `ON DELETE RESTRICT`, so the database itself refuses to leave a
meal pointing at a food that is gone.

There are two layers on purpose, and they do different jobs:

1. **The API checks first, because the refusal has to explain itself.** "used in 2 meals (Typical
   breakfast, Pasta night) and logged on 1 day (2026-11-01)" is a query result, not an error message —
   it is the same information `frontend/lib/usage.ts` computes today.
2. **The foreign key is the backstop.** It holds even if a route forgets to check, or a new route is
   added later by someone who has not read this page.

Entries and users are not deletable in the MVP, and their references are `RESTRICT` anyway. Removing an
entry is not a delete of a record — it is an edit of a day — so it is allowed. There is no day to delete
now: emptying a date means deleting its entries.

## The seed (R14)

- **Runs only against an empty database** — no rows in `users` — so a restart or a rebuild can never
  re-seed or duplicate the sample.
- **The same sample the frontend ships today**: 31 foods, 5 meals, and 17 entries falling on 3 dates
  (today, yesterday, the day before), for the MVP user.
- **It moves to the backend**, because the backend is what writes it. `frontend/lib/seed.ts` stops being
  the source of the data and is retired in Part 7, when the tests that compute expectations from it get
  re-pointed at the API.
- **The seeded dates are relative to the date of the first run** and do not re-date themselves, so the
  sample history ages. Nothing breaks when they do: today is simply a date with nothing on it yet, and
  logging into it works.

## The schema, as run

The DDL was executed against SQLite before this document was written, and every rule was tested rather
than described. The probes, each expecting a refusal:

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
| a date like `2026-11-32` or `not a date` | refused |
| an entry belonging to a user that does not exist | refused |
| a unit outside the seven | refused |
| a negative calorie count | refused |
| an unknown user on a food | refused |

And the case that must *not* be refused: deleting a food nothing references any more — allowed, once its
last entry and ingredient are gone.

**Two probes from the first version are gone, because the thing they tested is gone.** "Two days for the
same user and date" tested the `UNIQUE` constraint on the `days` table, and "an entry on a day that does
not exist" tested the foreign key to it. Neither rule exists now: there are no day rows to duplicate and
no day row for an entry to miss. What replaced them is the date check above, and a test that a valid date
with nothing on it is loggable.

**The malformed date got through, and that changed the rule.** It was written
`CHECK (strftime('%Y-%m-%d', date) = date)`. `strftime` returns NULL for a string it cannot parse, and
SQLite treats a CHECK that evaluates to NULL as *passing* — so `01/11/2026` was accepted. It is now
`IS date`, which is false rather than unknown for an unparseable date. That was found by running the DDL,
not by reading it, which is the reason this table exists.

**One more thing the run showed:** `PRAGMA foreign_keys = ON` cannot be changed inside a transaction —
SQLite ignores the setting silently. Demonstrated in a fresh connection: with the pragma off, a food a
meal still uses was deleted and the meal was left pointing at nothing. That is the failure the pragma
exists to prevent, and it is silent, which is why the setting is stated in this document and not only in
the code.

## What Part 6 built from this

Every route the schema needs, and what the two parts ask for:

- **P5.2** creating the database from nothing works: an empty file becomes the full schema, and the seed
  fills it exactly once. Tested, and verified in the running container.
- **P5.3** R11's guard exists at the storage layer: with `PRAGMA foreign_keys = ON`, deleting a food that
  a meal uses raises, and does so even when the API's own check is bypassed.
- **P6.2** both guards refuse and name what still uses the record — as a 409 carrying a human message and
  the structured list of meals and dates behind it.

## What is deliberately not here

- **Targets.** R10 and R17 put them in one place, `frontend/lib/targets.ts`. The API returns sums, not
  judgements, so nothing needs to store them. Per-user targets would fit this schema later.
- **Timestamps.** Nothing reads them yet.
- **Migrations, beyond the one that exists.** One step is implemented — 2 → 3, for the gram basis —
  and it is the pattern for the next: versioned, verified by row count, and refused when there is no
  step from the version found. There is still no general framework, and there does not need to be
  until a third version arrives.
- **Passwords and sessions.** The MVP credential is a constant in the application (R1); the session is a
  signed cookie. Neither is data.

## The four decisions you signed off

1. **TEXT ids everywhere**, keeping the seeded slugs — taken.
2. **The `meta` version row** — kept. It earned its place: the drop of the `days` table bumped the
   version to 2, and a file from the old shape is now refused with a message rather than misread.
3. **The file at `/data/nutrition.db` in a named volume** — taken, and verified by writing a row,
   rebuilding the image and finding it still there.
4. **Targets staying out of the database** — taken.
