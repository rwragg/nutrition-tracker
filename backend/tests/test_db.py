"""Tests for the schema, the seed and the delete guards (P5.2, P5.3).

These talk to the database directly, which is the point: the guards asserted here are the
storage layer's own, holding with nothing above them checking anything.
"""

import json
import sqlite3
from collections.abc import Iterator
from datetime import date
from pathlib import Path

import pytest

from app import db
from app.passwords import verify_password

PROPOSAL = Path(__file__).resolve().parent.parent.parent / "docs" / "schema.json"


@pytest.fixture
def seeded(tmp_path: Path) -> Iterator[sqlite3.Connection]:
    """A database created from nothing and seeded, closed when the test ends."""
    connection = db.initialise(tmp_path / "fresh.db", today=date(2026, 11, 1))
    yield connection
    connection.close()


def table_names(connection: sqlite3.Connection) -> set[str]:
    found = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    )
    return {row["name"] for row in found}


def index_names(connection: sqlite3.Connection) -> set[str]:
    found = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'"
    )
    return {row["name"] for row in found}


def count(connection: sqlite3.Connection, table: str) -> int:
    return connection.execute(f"SELECT count(*) AS n FROM {table}").fetchone()["n"]


def dates(connection: sqlite3.Connection) -> list[str]:
    return [
        row["date"]
        for row in connection.execute("SELECT DISTINCT date FROM entries ORDER BY date DESC")
    ]


# --- P5.2: creating the database from nothing -------------------------------------------


def test_a_missing_file_becomes_the_whole_schema(tmp_path: Path) -> None:
    path = tmp_path / "new.db"
    assert not path.exists()

    connection = db.initialise(path, today=date(2026, 11, 1))

    assert path.exists()
    assert table_names(connection) == {
        "users", "telegram_codes", "profiles", "foods", "meals", "meal_foods", "entries", "meta",
        "notices", "admin_log",
    }
    assert index_names(connection) == {
        "users_by_email",
        "users_by_telegram",
        "telegram_codes_by_user",
        "foods_by_user",
        "meals_by_user",
        "meal_foods_by_meal",
        "meal_foods_by_food",
        "entries_by_user_date",
        "entries_by_food",
        "entries_by_meal",
        "notices_waiting",
    }
    connection.close()


def test_there_is_no_days_table(seeded: sqlite3.Connection) -> None:
    """A day is not a table: it is the date on an entry, so nothing has to exist before logging."""
    assert "days" not in table_names(seeded)
    assert [column["name"] for column in seeded.execute("PRAGMA table_info(entries)")] == [
        "id",
        "user_id",
        "date",
        "section",
        "food_id",
        "meal_id",
        "quantity",
    ]


def test_the_schema_version_is_recorded(seeded: sqlite3.Connection) -> None:
    recorded = seeded.execute("SELECT value FROM meta WHERE key = 'schema_version'").fetchone()

    assert recorded["value"] == db.SCHEMA_VERSION


def test_a_database_from_another_version_is_refused(tmp_path: Path) -> None:
    path = tmp_path / "other.db"
    db.initialise(path, today=date(2026, 11, 1)).close()

    connection = db.connect(path)
    connection.execute("UPDATE meta SET value = '99' WHERE key = 'schema_version'")
    connection.commit()
    connection.close()

    with pytest.raises(db.SchemaVersionError, match="99"):
        db.initialise(path, today=date(2026, 11, 1))


def test_a_file_of_the_old_shape_is_refused_before_the_ddl_runs(tmp_path: Path) -> None:
    """The version check comes first, so an old file does not die on a raw sqlite error.

    This is the failure the container showed when the days table was dropped: the DDL ran against an
    older file and raised `no such column: user_id` from a CREATE INDEX, with the version check never
    reached. The file here has the pre-change `entries` shape on purpose - no user_id - so anything
    that applies the DDL before checking the version fails this test with an OperationalError.
    """
    path = tmp_path / "old-shape.db"
    connection = sqlite3.connect(path)
    connection.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    connection.execute("INSERT INTO meta (key, value) VALUES ('schema_version', '1')")
    connection.execute("CREATE TABLE entries (id TEXT PRIMARY KEY, day_id TEXT NOT NULL)")
    connection.commit()
    connection.close()

    with pytest.raises(db.SchemaVersionError, match="version 1"):
        db.initialise(path, today=date(2026, 11, 1))


def test_the_seed_fills_an_empty_database(seeded: sqlite3.Connection) -> None:
    assert count(seeded, "users") == 1
    assert count(seeded, "foods") == 31
    assert count(seeded, "meals") == 5
    assert count(seeded, "meal_foods") == 19
    assert count(seeded, "entries") == 17


def test_the_seeded_entries_are_dated_today_and_the_two_days_before(seeded: sqlite3.Connection) -> None:
    """The three days the sample has are the three dates its entries fall on."""
    assert dates(seeded) == ["2026-11-01", "2026-10-31", "2026-10-30"]
    assert [
        tuple(row)
        for row in seeded.execute(
            "SELECT date, count(*) FROM entries GROUP BY date ORDER BY date DESC"
        )
    ] == [("2026-11-01", 8), ("2026-10-31", 5), ("2026-10-30", 4)]


# --- migrations, each step against a file of the shape it was written for -----------------


def rewind(path: Path, version: str) -> sqlite3.Connection:
    """A file wound back to an earlier shape, so a migration can be run against it.

    Built by shrinking the real schema rather than by writing an old one out by hand: a
    hand-written table is a guess at what the old code produced, and this is the actual thing
    minus the newer columns and constraints. Raw `sqlite3.connect` because foreign keys default
    to off there, which is what dropping a table something else references needs.

    String comparison is fine for the version, which is a single digit.
    """
    connection = sqlite3.connect(path)

    if version < "8":  # before account status, the notice queue and the admin log
        connection.execute("DROP TABLE notices")
        connection.execute("DROP TABLE admin_log")
        connection.execute("ALTER TABLE users DROP COLUMN status")

    if version < "7":  # before profiles
        connection.execute("DROP TABLE profiles")

    if version < "6":  # before food sources
        connection.execute("ALTER TABLE foods DROP COLUMN source")
        connection.execute("ALTER TABLE foods DROP COLUMN source_id")

    if version < "3":  # before the gram basis
        connection.execute("""
            CREATE TABLE foods_v2 (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
                name TEXT NOT NULL,
                unit TEXT NOT NULL CHECK (unit IN ('cup','tbsp','tsp','oz','piece','slice','scoop')),
                calories REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL
            )""")
        connection.execute(
            "INSERT INTO foods_v2 SELECT id, user_id, name, unit, calories, protein, carbs, fat FROM foods"
        )
        connection.execute("DROP TABLE foods")
        connection.execute("ALTER TABLE foods_v2 RENAME TO foods")
        connection.execute("CREATE INDEX foods_by_user ON foods (user_id)")

    if version < "4":  # before accounts: a user is a username
        connection.execute(
            "CREATE TABLE users_v3 (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE)"
        )
        connection.execute("INSERT INTO users_v3 SELECT id, username FROM users")
        connection.execute("DROP TABLE users")
        connection.execute("ALTER TABLE users_v3 RENAME TO users")

    if version < "5":  # before pairing codes
        connection.execute("DROP TABLE telegram_codes")

    connection.execute("UPDATE meta SET value = ? WHERE key = 'schema_version'", (version,))
    connection.commit()
    return connection


def test_a_version_2_file_is_migrated_rather_than_refused(tmp_path: Path) -> None:
    """The first migration. A file written before `g` existed is carried forward with its rows
    intact, because a schema change that costs the log is not one this project can afford now
    that the log is real.

    It also runs the chain: 2 → 3 → 4, because a file that old is two steps behind and both
    have to happen on the way up.
    """
    path = tmp_path / "v2.db"
    db.initialise(path, today=date(2026, 11, 1)).close()

    legacy = rewind(path, "2")
    foods_before = legacy.execute("SELECT count(*) FROM foods").fetchone()[0]
    entries_before = legacy.execute("SELECT count(*) FROM entries").fetchone()[0]
    with pytest.raises(sqlite3.IntegrityError):
        legacy.execute(
            "INSERT INTO foods (id,user_id,name,unit,calories,protein,carbs,fat)"
            " VALUES ('x','user','x','g',1,1,1,1)"
        )
    legacy.commit()
    legacy.close()

    migrated = db.initialise(path, today=date(2026, 11, 1))
    try:
        assert migrated.execute(
            "SELECT value FROM meta WHERE key='schema_version'"
        ).fetchone()[0] == db.SCHEMA_VERSION
        assert migrated.execute("SELECT count(*) FROM foods").fetchone()[0] == foods_before
        assert migrated.execute("SELECT count(*) FROM entries").fetchone()[0] == entries_before

        # the point of the first step: grams are a unit now, and the old rows are untouched
        migrated.execute(
            "INSERT INTO foods (id,user_id,name,unit,calories,protein,carbs,fat)"
            " VALUES ('y','user','Yogurt, weighed','g',0.61,0.1,0.036,0.017)"
        )
        migrated.commit()
        assert migrated.execute("SELECT unit FROM foods WHERE id='y'").fetchone()[0] == "g"
        assert migrated.execute("SELECT round(calories * 183, 2) FROM foods WHERE id='y'").fetchone()[0] == 111.63

        # and the second step ran too, on the way past
        assert "password_hash" in {
            row[1] for row in migrated.execute("PRAGMA table_info(users)")
        }

        # the references the rebuild could have broken still hold, and the guards still bite
        assert migrated.execute(
            "SELECT count(*) FROM entries e JOIN foods f ON f.id = e.food_id WHERE e.id LIKE 't-%'"
        ).fetchone()[0] == 5
        assert migrated.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        with pytest.raises(sqlite3.IntegrityError):
            migrated.execute("DELETE FROM foods WHERE id = 'oats'")
        with pytest.raises(sqlite3.IntegrityError):
            migrated.execute(
                "INSERT INTO foods (id,user_id,name,unit,calories,protein,carbs,fat)"
                " VALUES ('z','user','z','bucket',1,1,1,1)"
            )
    finally:
        migrated.close()


def test_a_version_3_file_is_migrated_rather_than_refused(tmp_path: Path) -> None:
    """3 → 4: accounts become more than a username (R24), and the account that already exists
    keeps its log and its credential."""
    path = tmp_path / "v3.db"
    db.initialise(path, today=date(2026, 11, 1)).close()

    legacy = rewind(path, "3")
    foods_before = legacy.execute("SELECT count(*) FROM foods").fetchone()[0]
    entries_before = legacy.execute("SELECT count(*) FROM entries").fetchone()[0]
    assert {row[1] for row in legacy.execute("PRAGMA table_info(users)")} == {"id", "username"}
    legacy.close()

    migrated = db.initialise(path, today=date(2026, 11, 1))
    try:
        assert migrated.execute(
            "SELECT value FROM meta WHERE key='schema_version'"
        ).fetchone()[0] == db.SCHEMA_VERSION
        assert migrated.execute("SELECT count(*) FROM foods").fetchone()[0] == foods_before
        assert migrated.execute("SELECT count(*) FROM entries").fetchone()[0] == entries_before

        # the point of this step: the account columns are there, and a fresh file's shape is
        # what a migrated one now has - which is all the version number claims
        assert {row[1] for row in migrated.execute("PRAGMA table_info(users)")} == {
            "id", "username", "email", "telegram_id", "password_hash", "status",
        }
        assert {row[1] for row in migrated.execute("PRAGMA index_list(users)")} >= {
            "users_by_email", "users_by_telegram",
        }

        # the account that existed keeps the credential it always had, hashed
        stored = migrated.execute(
            "SELECT password_hash FROM users WHERE id = 'user'"
        ).fetchone()[0]
        assert stored and verify_password(db.SEED_PASSWORD, stored)
        assert db.SEED_PASSWORD not in stored

        # and the new columns do what they are for: one chat, one account
        migrated.execute(
            "UPDATE users SET email = 'robert@example.com', telegram_id = '1234567890'"
            " WHERE id = 'user'"
        )
        migrated.commit()
        with pytest.raises(sqlite3.IntegrityError):
            migrated.execute(
                "INSERT INTO users (id, username, telegram_id) VALUES ('ghost','ghost','1234567890')"
            )
    finally:
        migrated.close()



def test_a_version_4_file_is_migrated_rather_than_refused(tmp_path: Path) -> None:
    """4 -> 5: pairing codes arrive as a new table. The step does nothing but create it, so the point
    to prove is that everything already there - the log, the account, and the chat it is bound to - is
    untouched, and that the table works afterwards. This was the one migration step with no test."""
    path = tmp_path / "v4.db"
    db.initialise(path, today=date(2026, 11, 1)).close()

    legacy = rewind(path, "4")
    legacy.execute("UPDATE users SET telegram_id = '1234567890' WHERE id = 'user'")
    legacy.commit()
    tables = {row[0] for row in legacy.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert "telegram_codes" not in tables
    foods_before = legacy.execute("SELECT count(*) FROM foods").fetchone()[0]
    entries_before = legacy.execute("SELECT count(*) FROM entries").fetchone()[0]
    legacy.close()

    migrated = db.initialise(path, today=date(2026, 11, 1))
    try:
        assert migrated.execute(
            "SELECT value FROM meta WHERE key='schema_version'"
        ).fetchone()[0] == db.SCHEMA_VERSION  # carried on through every later step too

        assert migrated.execute("SELECT count(*) FROM foods").fetchone()[0] == foods_before
        assert migrated.execute("SELECT count(*) FROM entries").fetchone()[0] == entries_before
        assert migrated.execute(
            "SELECT telegram_id FROM users WHERE id = 'user'"
        ).fetchone()[0] == "1234567890"

        # the new table is the one a fresh file has, and it enforces what it is for
        assert {row[1] for row in migrated.execute("PRAGMA table_info(telegram_codes)")} == {
            "code", "user_id", "expires", "used",
        }
        assert "telegram_codes_by_user" in {
            row[1] for row in migrated.execute("PRAGMA index_list(telegram_codes)")
        }
        migrated.execute(
            "INSERT INTO telegram_codes (code, user_id, expires) VALUES ('K7M2QX', 'user', '2026-11-02T10:00:00Z')"
        )
        with pytest.raises(sqlite3.IntegrityError):
            migrated.execute(
                "INSERT INTO telegram_codes (code, user_id, expires) VALUES ('BADDATE', 'user', 'not a date')"
            )
        with pytest.raises(sqlite3.IntegrityError):
            migrated.execute(
                "INSERT INTO telegram_codes (code, user_id, expires) VALUES ('NOUSER2', 'nobody', '2026-11-02T10:00:00Z')"
            )
    finally:
        migrated.close()


def test_a_version_5_file_is_migrated_rather_than_refused(tmp_path: Path) -> None:
    """5 -> 6: a food remembers where it came from. Every food that exists reads as typed, because
    nothing could be looked up before this, and nothing is copied or rewritten to get there."""
    path = tmp_path / "v5.db"
    db.initialise(path, today=date(2026, 11, 1)).close()

    legacy = rewind(path, "5")
    assert {row[1] for row in legacy.execute("PRAGMA table_info(foods)")} == {
        "id", "user_id", "name", "unit", "calories", "protein", "carbs", "fat",
    }
    before = legacy.execute(
        "SELECT id, name, unit, calories, protein, carbs, fat FROM foods ORDER BY id"
    ).fetchall()
    entries_before = legacy.execute("SELECT count(*) FROM entries").fetchone()[0]
    legacy.close()

    migrated = db.initialise(path, today=date(2026, 11, 1))
    try:
        assert migrated.execute(
            "SELECT value FROM meta WHERE key='schema_version'"
        ).fetchone()[0] == db.SCHEMA_VERSION  # carried on through every later step too

        # every row intact, none of its figures touched
        after = migrated.execute(
            "SELECT id, name, unit, calories, protein, carbs, fat FROM foods ORDER BY id"
        ).fetchall()
        assert [tuple(row) for row in after] == [tuple(row) for row in before]
        assert migrated.execute("SELECT count(*) FROM entries").fetchone()[0] == entries_before

        # all of them read as typed, with no USDA id
        assert {tuple(row) for row in migrated.execute("SELECT DISTINCT source, source_id FROM foods")} == {
            ("typed", None)
        }

        # and the columns do what they are for
        migrated.execute(
            "INSERT INTO foods (id, user_id, name, unit, calories, protein, carbs, fat, source, source_id)"
            " VALUES ('looked-up', 'user', 'Tempeh', 'g', 1.92, 0.2, 0.08, 0.1, 'usda', '174272')"
        )
        with pytest.raises(sqlite3.IntegrityError):
            migrated.execute(
                "INSERT INTO foods (id, user_id, name, unit, calories, protein, carbs, fat, source)"
                " VALUES ('odd', 'user', 'Odd', 'g', 1, 1, 1, 1, 'guessed')"
            )
    finally:
        migrated.close()


def test_a_version_6_file_is_migrated_rather_than_refused(tmp_path: Path) -> None:
    """6 -> 7: a profile table is added and nothing else moves (Part 12, R52). Every existing
    account simply has no profile, which is a legitimate state and reads as it did before."""
    path = tmp_path / "v6.db"
    db.initialise(path, today=date(2026, 11, 1)).close()

    legacy = rewind(path, "6")
    assert legacy.execute(
        "SELECT count(*) FROM sqlite_master WHERE name = 'profiles'"
    ).fetchone()[0] == 0
    users_before = legacy.execute("SELECT * FROM users ORDER BY id").fetchall()
    foods_before = legacy.execute("SELECT * FROM foods ORDER BY id").fetchall()
    entries_before = legacy.execute("SELECT * FROM entries ORDER BY id").fetchall()
    legacy.close()

    migrated = db.initialise(path, today=date(2026, 11, 1))
    try:
        assert migrated.execute(
            "SELECT value FROM meta WHERE key='schema_version'"
        ).fetchone()[0] == db.SCHEMA_VERSION == "8"

        # nothing that existed was touched (the users table has grown a column since, which is the next test's business)
        assert [tuple(r) for r in migrated.execute("SELECT id, username, email, telegram_id, password_hash FROM users ORDER BY id")] == [tuple(r)[:5] for r in users_before]
        assert [tuple(r) for r in migrated.execute("SELECT * FROM foods ORDER BY id")] == [tuple(r) for r in foods_before]
        assert [tuple(r) for r in migrated.execute("SELECT * FROM entries ORDER BY id")] == [tuple(r) for r in entries_before]

        # the account that was already there has no profile, and the table is usable
        assert migrated.execute("SELECT count(*) FROM profiles").fetchone()[0] == 0
        migrated.execute(
            "INSERT INTO profiles (user_id, display_name, sex, birth_date, height_cm, weight_kg,"
            " weight_on, activity, goal) VALUES ('user', 'Ana', 'female', '1986-03-01', 165, 70,"
            " '2026-11-04', 'light', 'maintain')"
        )
        assert migrated.execute("SELECT units FROM profiles").fetchone()[0] == "metric"  # the default
        with pytest.raises(sqlite3.IntegrityError):  # one profile per account
            migrated.execute(
                "INSERT INTO profiles (user_id, display_name, sex, birth_date, height_cm, weight_kg,"
                " weight_on, activity, goal) VALUES ('user', 'Again', 'male', '1986-03-01', 170, 80,"
                " '2026-11-04', 'light', 'lose')"
            )
    finally:
        migrated.close()


def test_the_chain_runs_from_the_oldest_version_to_the_newest(tmp_path: Path) -> None:
    """Every step, one after another, from version 2 (the oldest this build still carries)."""
    path = tmp_path / "chain.db"
    db.initialise(path, today=date(2026, 11, 1)).close()
    rewind(path, "2").close()

    migrated = db.initialise(path, today=date(2026, 11, 1))
    try:
        assert migrated.execute(
            "SELECT value FROM meta WHERE key='schema_version'"
        ).fetchone()[0] == db.SCHEMA_VERSION == "8"
        assert migrated.execute("SELECT count(*) FROM profiles").fetchone()[0] == 0
        assert migrated.execute("SELECT count(*) FROM notices").fetchone()[0] == 0  # nothing is queued by a migration
    finally:
        migrated.close()


def test_a_fresh_file_and_a_migrated_one_have_the_same_profiles_table(tmp_path: Path) -> None:
    """The version number claims the two are the same shape, constraints included."""
    fresh = db.initialise(tmp_path / "fresh.db", today=date(2026, 11, 1))
    db.initialise(tmp_path / "old.db", today=date(2026, 11, 1)).close()
    rewind(tmp_path / "old.db", "6").close()
    migrated = db.initialise(tmp_path / "old.db", today=date(2026, 11, 1))
    try:
        def shape(connection: sqlite3.Connection) -> tuple:
            columns = [tuple(row)[1:] for row in connection.execute("PRAGMA table_info(profiles)")]
            sql = connection.execute("SELECT sql FROM sqlite_master WHERE name = 'profiles'").fetchone()[0]
            return columns, " ".join(sql.split())

        assert shape(migrated) == shape(fresh)
    finally:
        fresh.close()
        migrated.close()


def test_a_fresh_file_and_a_migrated_one_have_the_same_foods_table(tmp_path: Path) -> None:
    """The version number claims the two are the same shape; this is the check that it is true."""
    fresh = db.initialise(tmp_path / "fresh.db", today=date(2026, 11, 1))
    db.initialise(tmp_path / "old.db", today=date(2026, 11, 1)).close()
    old = rewind(tmp_path / "old.db", "5")
    old.close()
    migrated = db.initialise(tmp_path / "old.db", today=date(2026, 11, 1))
    try:
        def shape(connection: sqlite3.Connection) -> list[tuple]:
            return [tuple(row)[1:] for row in connection.execute("PRAGMA table_info(foods)")]

        assert shape(migrated) == shape(fresh)
    finally:
        fresh.close()
        migrated.close()


def test_a_version_with_no_migration_is_still_refused(tmp_path: Path) -> None:
    """A migration for 2 does not make 3 tolerant of anything: a version this build cannot
    carry forward is refused, which is what keeps 'version' meaningful."""
    path = tmp_path / "v1.db"
    connection = sqlite3.connect(path)
    connection.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    connection.execute("INSERT INTO meta (key, value) VALUES ('schema_version', '1')")
    connection.execute("CREATE TABLE entries (id TEXT PRIMARY KEY, day_id TEXT NOT NULL)")
    connection.commit()
    connection.close()

    with pytest.raises(db.SchemaVersionError, match="version 1"):
        db.initialise(path, today=date(2026, 11, 1))


def test_seeding_twice_changes_nothing(seeded: sqlite3.Connection) -> None:
    """The seed runs only against an empty database, so a restart cannot duplicate it."""
    before = (count(seeded, "foods"), count(seeded, "meals"), count(seeded, "entries"))

    assert db.seed(seeded, today=date(2026, 11, 1)) is False

    after = (count(seeded, "foods"), count(seeded, "meals"), count(seeded, "entries"))
    assert after == before


def test_initialising_an_existing_file_is_safe(tmp_path: Path) -> None:
    """Opening the app again must not re-create or re-seed anything."""
    path = tmp_path / "again.db"
    db.initialise(path, today=date(2026, 11, 1)).close()

    again = db.initialise(path, today=date(2026, 11, 2))

    assert count(again, "foods") == 31
    assert count(again, "entries") == 17
    again.close()


# --- what an entry enforces on its own ----------------------------------------------------


def test_an_entry_must_carry_a_real_date(seeded: sqlite3.Connection) -> None:
    """The malformed date is refused by the CHECK, not by the API.

    This is the rule that was found broken while proposing the schema: strftime returns NULL for a
    string it cannot parse, and SQLite passes a CHECK that evaluates to NULL, so `= date` let
    `01/11/2026` through. `IS date` refuses it.
    """
    for bad_date in ("01/11/2026", "2026-11-32", "2026-02-31", "not a date"):
        with pytest.raises(sqlite3.IntegrityError):
            seeded.execute(
                "INSERT INTO entries (id, user_id, date, section, food_id, quantity)"
                " VALUES ('probe', 'user', ?, 'lunch', 'hummus', 1)",
                (bad_date,),
            )


def test_an_entry_must_belong_to_a_real_user(seeded: sqlite3.Connection) -> None:
    with pytest.raises(sqlite3.IntegrityError):
        seeded.execute(
            "INSERT INTO entries (id, user_id, date, section, food_id, quantity)"
            " VALUES ('probe', 'nobody', '2026-11-01', 'lunch', 'hummus', 1)"
        )


def test_an_empty_date_holds_nothing_and_breaks_nothing(seeded: sqlite3.Connection) -> None:
    """The other half of dropping the table: emptying a day leaves no trace and no error."""
    seeded.execute("DELETE FROM entries WHERE date = '2026-10-30'")
    seeded.commit()

    assert dates(seeded) == ["2026-11-01", "2026-10-31"]
    assert count(seeded, "entries") == 13


# --- P5.3: the delete guard lives at the storage layer ----------------------------------


def test_the_connection_turns_foreign_keys_on() -> None:
    """The whole delete policy depends on this pragma, and SQLite defaults it off."""
    connection = db.connect()

    assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    connection.close()


def test_deleting_a_food_a_meal_uses_is_refused(seeded: sqlite3.Connection) -> None:
    with pytest.raises(sqlite3.IntegrityError):
        seeded.execute("DELETE FROM foods WHERE id = 'oats'")

    assert count(seeded, "foods") == 31


def test_deleting_a_food_a_day_logs_directly_is_refused(seeded: sqlite3.Connection) -> None:
    with pytest.raises(sqlite3.IntegrityError):
        seeded.execute("DELETE FROM foods WHERE id = 'blueberries'")


def test_deleting_a_meal_a_day_logs_is_refused(seeded: sqlite3.Connection) -> None:
    with pytest.raises(sqlite3.IntegrityError):
        seeded.execute("DELETE FROM meals WHERE id = 'typical-breakfast'")


def test_deleting_an_unused_food_is_allowed(seeded: sqlite3.Connection) -> None:
    """The guard refuses, it does not forbid: a food nothing refers to can go."""
    seeded.execute("INSERT INTO foods (id, user_id, name, unit, calories, protein, carbs, fat)"
        " VALUES ('spare', 'user', 'Spare food', 'cup', 1, 1, 1, 1)")
    seeded.commit()

    seeded.execute("DELETE FROM foods WHERE id = 'spare'")
    seeded.commit()

    assert seeded.execute("SELECT count(*) AS n FROM foods WHERE id = 'spare'").fetchone()["n"] == 0


def test_a_version_7_file_is_migrated_and_everyone_who_existed_is_approved(tmp_path: Path) -> None:
    """7 -> 8 (Part 14, R65): accounts gain a status, and nobody who already had an account is locked out.

    The person who has signed in all along, and any account made since, must come out `approved`: the change is about who
    may register from now on, not about who may still sign in."""
    path = tmp_path / "v7.db"
    db.initialise(path, today=date(2026, 11, 1)).close()
    legacy = rewind(path, "7")
    for number in range(3):  # accounts of several kinds: with a password, with a chat linked, with neither
        legacy.execute(
            "INSERT INTO users (id, username, email, telegram_id, password_hash) VALUES (?, ?, ?, ?, ?)",
            (f"user-old{number}", f"old{number}", f"old{number}@example.com", f"1000{number}" if number else None,
             "pbkdf2_sha256$1$aa$bb" if number != 2 else None),
        )
    legacy.commit()
    before = legacy.execute("SELECT count(*) FROM users").fetchone()[0]
    assert "status" not in {row[1] for row in legacy.execute("PRAGMA table_info(users)")}
    legacy.close()

    migrated = db.initialise(path, today=date(2026, 11, 1))
    try:
        assert migrated.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()[0] == "8"
        assert migrated.execute("SELECT count(*) FROM users").fetchone()[0] == before  # none lost, none added
        statuses = {row[0] for row in migrated.execute("SELECT status FROM users")}
        assert statuses == {"approved"}, statuses

        # the new tables exist and are empty, and the column's guard is real
        for table in ("notices", "admin_log"):
            assert migrated.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0
        with pytest.raises(sqlite3.IntegrityError):
            migrated.execute("UPDATE users SET status = 'banned' WHERE id = 'user-old0'")

        # and what is made after the migration is safe by default: an insert that forgets to say is pending, not approved
        migrated.execute("INSERT INTO users (id, username) VALUES ('user-new', 'new')")
        assert migrated.execute("SELECT status FROM users WHERE id = 'user-new'").fetchone()[0] == "pending"
    finally:
        migrated.close()


def test_a_fresh_file_and_a_migrated_one_have_the_same_users_table(tmp_path: Path) -> None:
    """The version number claims the two are the same shape, the default and the constraint included."""
    fresh = db.initialise(tmp_path / "fresh.db", today=date(2026, 11, 1))
    db.initialise(tmp_path / "old.db", today=date(2026, 11, 1)).close()
    rewind(tmp_path / "old.db", "7").close()
    migrated = db.initialise(tmp_path / "old.db", today=date(2026, 11, 1))
    try:
        def shape(connection: sqlite3.Connection, table: str) -> tuple:
            columns = [tuple(row)[1:] for row in connection.execute(f"PRAGMA table_info({table})")]
            sql = connection.execute("SELECT sql FROM sqlite_master WHERE name = ?", (table,)).fetchone()[0]
            return columns, " ".join(sql.split())

        for table in ("users", "notices", "admin_log"):
            fresh_columns, _ = shape(fresh, table)
            migrated_columns, _ = shape(migrated, table)
            assert migrated_columns == fresh_columns, table  # same columns, types, defaults, order

        # the stored SQL differs in text (ALTER appends a clause), so the constraint is proved by behaviour in both files
        for connection in (fresh, migrated):
            with pytest.raises(sqlite3.IntegrityError):
                connection.execute("INSERT INTO users (id, username, status) VALUES ('x', 'x', 'banned')")
    finally:
        fresh.close()
        migrated.close()


# --- the code and the proposal describe the same tables ---------------------------------


def test_the_code_schema_matches_the_proposal() -> None:
    """docs/schema.json is the approved proposal; db.py is what runs. They must not drift."""
    proposal = json.loads(PROPOSAL.read_text())
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    for statement in db.SCHEMA:
        connection.execute(statement)

    for table in proposal["tables"]:
        actual = {
            row["name"] for row in connection.execute(f"PRAGMA table_info({table['name']})")
        }
        expected = {column["name"] for column in table["columns"]}
        assert actual == expected, f"{table['name']} columns differ from the proposal"

    assert table_names(connection) == {table["name"] for table in proposal["tables"]}
    connection.close()
