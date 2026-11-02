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
    assert table_names(connection) == {"users", "foods", "meals", "meal_foods", "entries", "meta"}
    assert index_names(connection) == {
        "foods_by_user",
        "meals_by_user",
        "meal_foods_by_meal",
        "meal_foods_by_food",
        "entries_by_user_date",
        "entries_by_food",
        "entries_by_meal",
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
    seeded.execute("INSERT INTO foods VALUES ('spare', 'user', 'Spare food', 'cup', 1, 1, 1, 1)")
    seeded.commit()

    seeded.execute("DELETE FROM foods WHERE id = 'spare'")
    seeded.commit()

    assert seeded.execute("SELECT count(*) AS n FROM foods WHERE id = 'spare'").fetchone()["n"] == 0


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
