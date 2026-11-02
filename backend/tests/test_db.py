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


# --- P5.2: creating the database from nothing -------------------------------------------


def test_a_missing_file_becomes_the_whole_schema(tmp_path: Path) -> None:
    path = tmp_path / "new.db"
    assert not path.exists()

    connection = db.initialise(path, today=date(2026, 11, 1))

    assert path.exists()
    assert table_names(connection) == {"users", "foods", "meals", "meal_foods", "days", "entries", "meta"}
    assert index_names(connection) == {
        "foods_by_user",
        "meals_by_user",
        "meal_foods_by_meal",
        "meal_foods_by_food",
        "entries_by_day",
        "entries_by_food",
        "entries_by_meal",
    }
    connection.close()


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


def test_the_seed_fills_an_empty_database(seeded: sqlite3.Connection) -> None:
    assert count(seeded, "users") == 1
    assert count(seeded, "foods") == 31
    assert count(seeded, "meals") == 5
    assert count(seeded, "meal_foods") == 19
    assert count(seeded, "days") == 3
    assert count(seeded, "entries") == 17


def test_the_seeded_days_are_today_and_the_two_before_it(seeded: sqlite3.Connection) -> None:
    dates = [row["date"] for row in seeded.execute("SELECT date FROM days ORDER BY date DESC")]

    assert dates == ["2026-11-01", "2026-10-31", "2026-10-30"]


def test_seeding_twice_changes_nothing(seeded: sqlite3.Connection) -> None:
    """The seed runs only against an empty database, so a restart cannot duplicate it."""
    before = (count(seeded, "foods"), count(seeded, "meals"), count(seeded, "days"), count(seeded, "entries"))

    assert db.seed(seeded, today=date(2026, 11, 1)) is False

    after = (count(seeded, "foods"), count(seeded, "meals"), count(seeded, "days"), count(seeded, "entries"))
    assert after == before


def test_initialising_an_existing_file_is_safe(tmp_path: Path) -> None:
    """Opening the app again must not re-create or re-seed anything."""
    path = tmp_path / "again.db"
    db.initialise(path, today=date(2026, 11, 1)).close()

    again = db.initialise(path, today=date(2026, 11, 2))

    assert count(again, "foods") == 31
    assert count(again, "days") == 3
    again.close()


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
