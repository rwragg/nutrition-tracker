"""The database: schema, connection settings, and the first-run seed.

The schema is defined here rather than read from docs/schema.json, because the image
does not carry the docs directory. That JSON is the proposal this was built from, and a
test asserts the two still describe the same tables.

Nothing cascades: every reference is ON DELETE RESTRICT, which is the storage-level half
of R11. The API checks first so it can name what still uses a record; this is the backstop
that holds even when a route forgets to.
"""

import os
import sqlite3
from datetime import date, timedelta
from pathlib import Path

SCHEMA_VERSION = "1"
DEFAULT_DB_PATH = "/data/nutrition.db"
SEED_USER_ID = "user"

SCHEMA = (
    """
    CREATE TABLE IF NOT EXISTS users (
        id       TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS foods (
        id       TEXT PRIMARY KEY,
        user_id  TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        name     TEXT NOT NULL,
        unit     TEXT NOT NULL CHECK (unit IN ('cup', 'tbsp', 'tsp', 'oz', 'piece', 'slice', 'scoop')),
        calories REAL NOT NULL CHECK (calories >= 0),
        protein  REAL NOT NULL CHECK (protein >= 0),
        carbs    REAL NOT NULL CHECK (carbs >= 0),
        fat      REAL NOT NULL CHECK (fat >= 0)
    )
    """,
    "CREATE INDEX IF NOT EXISTS foods_by_user ON foods (user_id)",
    """
    CREATE TABLE IF NOT EXISTS meals (
        id      TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        name    TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS meals_by_user ON meals (user_id)",
    """
    CREATE TABLE IF NOT EXISTS meal_foods (
        id       TEXT PRIMARY KEY,
        meal_id  TEXT NOT NULL REFERENCES meals (id) ON DELETE RESTRICT,
        food_id  TEXT NOT NULL REFERENCES foods (id) ON DELETE RESTRICT,
        quantity REAL NOT NULL CHECK (quantity > 0)
    )
    """,
    "CREATE INDEX IF NOT EXISTS meal_foods_by_meal ON meal_foods (meal_id)",
    "CREATE INDEX IF NOT EXISTS meal_foods_by_food ON meal_foods (food_id)",
    """
    CREATE TABLE IF NOT EXISTS days (
        id      TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        date    TEXT NOT NULL CHECK (strftime('%Y-%m-%d', date) IS date),
        UNIQUE (user_id, date)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS entries (
        id       TEXT PRIMARY KEY,
        day_id   TEXT NOT NULL REFERENCES days (id) ON DELETE RESTRICT,
        section  TEXT NOT NULL CHECK (section IN ('breakfast', 'lunch', 'dinner', 'snacks')),
        food_id  TEXT REFERENCES foods (id) ON DELETE RESTRICT,
        meal_id  TEXT REFERENCES meals (id) ON DELETE RESTRICT,
        quantity REAL,
        CHECK ((food_id IS NOT NULL) + (meal_id IS NOT NULL) = 1),
        CHECK ((food_id IS NULL) = (quantity IS NULL)),
        CHECK (quantity IS NULL OR quantity > 0)
    )
    """,
    "CREATE INDEX IF NOT EXISTS entries_by_day ON entries (day_id)",
    "CREATE INDEX IF NOT EXISTS entries_by_food ON entries (food_id)",
    "CREATE INDEX IF NOT EXISTS entries_by_meal ON entries (meal_id)",
    """
    CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """,
)

# The sample the frontend used to ship: 31 foods, 5 meals, 3 days. Macros are per one
# unit. It lives here now because the backend is what writes it (see docs/DATABASE.md).
SEED_FOODS = (
    ("oats", "Rolled oats, dry", "cup", 300, 10, 54, 6),
    ("whole-milk", "Whole milk", "cup", 149, 8, 12, 8),
    ("greek-yogurt", "Greek yogurt, plain 0%", "cup", 130, 23, 9, 0.7),
    ("cottage-cheese", "Cottage cheese, 1%", "cup", 163, 28, 6.2, 2.3),
    ("whey", "Whey protein", "scoop", 120, 24, 3, 1.5),
    ("egg", "Egg, large", "piece", 72, 6.3, 0.4, 4.8),
    ("firm-tofu", "Tofu, firm", "cup", 363, 43.6, 10.6, 22),
    ("banana", "Banana", "piece", 105, 1.3, 27, 0.4),
    ("orange", "Orange", "piece", 62, 1.2, 15.4, 0.2),
    ("blueberries", "Blueberries", "cup", 84, 1.1, 21.4, 0.5),
    ("brown-rice", "Brown rice, cooked", "cup", 218, 4.5, 45.8, 1.6),
    ("white-rice", "White rice, cooked", "cup", 205, 4.3, 44.5, 0.4),
    ("quinoa", "Quinoa, cooked", "cup", 222, 8.1, 39.4, 3.6),
    ("whole-wheat-pasta", "Whole wheat pasta, cooked", "cup", 174, 7.5, 37.2, 0.8),
    ("black-beans", "Black beans, cooked", "cup", 227, 15.2, 40.8, 0.9),
    ("chickpeas", "Chickpeas, cooked", "cup", 269, 14.5, 45, 4.2),
    ("lentils", "Lentils, cooked", "cup", 230, 17.9, 39.9, 0.8),
    ("hummus", "Hummus", "tbsp", 35, 1, 3, 2.5),
    ("whole-wheat-bread", "Whole wheat bread", "slice", 81, 4, 13.8, 1.1),
    ("peanut-butter", "Peanut butter", "tbsp", 94, 4, 3.2, 8),
    ("almonds", "Almonds", "oz", 164, 6, 6.1, 14.2),
    ("olive-oil", "Olive oil", "tbsp", 119, 0, 0, 13.5),
    ("avocado", "Avocado, half", "piece", 120, 1.5, 6.4, 11),
    ("cheddar", "Cheddar cheese", "oz", 113, 7, 0.4, 9.3),
    ("string-cheese", "String cheese", "piece", 80, 7, 1, 6),
    ("broccoli", "Broccoli, steamed", "cup", 31, 2.5, 6, 0.3),
    ("spinach", "Spinach, raw", "cup", 7, 0.9, 1.1, 0.1),
    ("sweet-potato", "Sweet potato, baked", "piece", 103, 2.3, 23.6, 0.2),
    ("tomato-sauce", "Tomato sauce", "cup", 130, 4, 20, 4),
    ("maple-syrup", "Maple syrup", "tbsp", 52, 0, 13.4, 0),
    ("coffee", "Coffee, black", "cup", 2, 0.3, 0, 0),
)

SEED_MEALS = (
    ("typical-breakfast", "Typical breakfast", (("oats", 0.5), ("banana", 1), ("whole-milk", 1), ("coffee", 1))),
    ("protein-lunch-bowl", "Protein lunch bowl", (("brown-rice", 1), ("black-beans", 1), ("firm-tofu", 0.5), ("broccoli", 1))),
    ("light-dinner", "Light dinner", (("quinoa", 1), ("chickpeas", 1), ("spinach", 2), ("olive-oil", 1))),
    ("post-workout-shake", "Post-workout shake", (("whey", 1), ("whole-milk", 1), ("banana", 1))),
    ("pasta-night", "Pasta night", (("whole-wheat-pasta", 1.5), ("tomato-sauce", 0.5), ("cheddar", 1), ("olive-oil", 1))),
)

# (days before today, entry id, section, kind, what it refers to, quantity)
SEED_ENTRIES = (
    (0, "t-bf-1", "breakfast", "meal", "typical-breakfast", None),
    (0, "t-bf-2", "breakfast", "food", "blueberries", 1),
    (0, "t-ln-1", "lunch", "meal", "protein-lunch-bowl", None),
    (0, "t-ln-2", "lunch", "food", "string-cheese", 1),
    (0, "t-dn-1", "dinner", "meal", "light-dinner", None),
    (0, "t-sn-1", "snacks", "food", "almonds", 1),
    (0, "t-sn-2", "snacks", "food", "greek-yogurt", 1),
    (0, "t-sn-3", "snacks", "food", "orange", 1),
    (1, "y-bf-1", "breakfast", "meal", "post-workout-shake", None),
    (1, "y-bf-2", "breakfast", "food", "oats", 0.5),
    (1, "y-ln-1", "lunch", "meal", "protein-lunch-bowl", None),
    (1, "y-sn-1", "snacks", "food", "peanut-butter", 2),
    (1, "y-sn-2", "snacks", "food", "whole-wheat-bread", 1),
    (2, "e-bf-1", "breakfast", "meal", "typical-breakfast", None),
    (2, "e-dn-1", "dinner", "meal", "pasta-night", None),
    (2, "e-dn-2", "dinner", "food", "avocado", 1),
    (2, "e-sn-1", "snacks", "food", "cottage-cheese", 1),
)


class SchemaVersionError(RuntimeError):
    """The file was written by a different version of this schema."""


def db_path() -> Path:
    """Where the database lives. The environment override exists so tests use their own file."""
    return Path(os.environ.get("NUTRITION_DB", DEFAULT_DB_PATH))


def connect(path: Path | None = None) -> sqlite3.Connection:
    """A connection with the settings every guard in this schema depends on."""
    connection = sqlite3.connect(path or db_path())
    connection.row_factory = sqlite3.Row

    # SQLite defaults foreign_keys to OFF, and every delete guard here is a foreign key.
    # Without this line the storage-level half of R11 does not exist, silently.
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


def create_schema(connection: sqlite3.Connection) -> None:
    """Create what is missing, and record the schema version the file is written to."""
    for statement in SCHEMA:
        connection.execute(statement)

    recorded = connection.execute("SELECT value FROM meta WHERE key = 'schema_version'").fetchone()

    if recorded is None:
        connection.execute("INSERT INTO meta (key, value) VALUES ('schema_version', ?)", (SCHEMA_VERSION,))
        return

    if recorded["value"] != SCHEMA_VERSION:
        raise SchemaVersionError(
            f"the database is schema version {recorded['value']}, this build expects {SCHEMA_VERSION}"
        )


def seed(connection: sqlite3.Connection, today: date) -> bool:
    """Insert the sample, but only into a database that has never been seeded.

    Returns whether it seeded anything. Checked before inserting, so a restart or a
    rebuild can never re-seed or duplicate the sample (R14).
    """
    if connection.execute("SELECT count(*) AS n FROM users").fetchone()["n"]:
        return False

    connection.execute(
        "INSERT INTO users (id, username) VALUES (?, ?)", (SEED_USER_ID, SEED_USER_ID)
    )

    connection.executemany(
        "INSERT INTO foods (id, user_id, name, unit, calories, protein, carbs, fat)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [(food_id, SEED_USER_ID, *rest) for food_id, *rest in SEED_FOODS],
    )

    connection.executemany(
        "INSERT INTO meals (id, user_id, name) VALUES (?, ?, ?)",
        [(meal_id, SEED_USER_ID, name) for meal_id, name, _ in SEED_MEALS],
    )

    connection.executemany(
        "INSERT INTO meal_foods (id, meal_id, food_id, quantity) VALUES (?, ?, ?, ?)",
        [
            (f"mf-{meal_id}-{food_id}", meal_id, food_id, quantity)
            for meal_id, _, ingredients in SEED_MEALS
            for food_id, quantity in ingredients
        ],
    )

    dates = {days_back: today - timedelta(days=days_back) for days_back in (0, 1, 2)}

    connection.executemany(
        "INSERT INTO days (id, user_id, date) VALUES (?, ?, ?)",
        [(day.isoformat(), SEED_USER_ID, day.isoformat()) for day in dates.values()],
    )

    connection.executemany(
        "INSERT INTO entries (id, day_id, section, food_id, meal_id, quantity) VALUES (?, ?, ?, ?, ?, ?)",
        [
            (
                entry_id,
                dates[days_back].isoformat(),
                section,
                what if kind == "food" else None,
                what if kind == "meal" else None,
                quantity,
            )
            for days_back, entry_id, section, kind, what, quantity in SEED_ENTRIES
        ],
    )

    return True


def initialise(path: Path | None = None, today: date | None = None) -> sqlite3.Connection:
    """Create the file if it is absent, create the schema, and seed an empty database (R17).

    The caller gets a connection they can use; it is theirs to close.
    """
    target = path or db_path()
    target.parent.mkdir(parents=True, exist_ok=True)

    connection = connect(target)
    with connection:
        create_schema(connection)
        seed(connection, today or date.today())

    return connection
