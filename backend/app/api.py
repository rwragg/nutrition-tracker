"""The nutrition API: foods, meals, days and entries, every route scoped to the signed-in user.

Payloads mirror the frontend's own types - a food carries nested macros, an entry is a food with a
quantity or a whole meal - so the frontend can move onto this API without its data shapes moving
underneath it.

Two layers refuse a delete that would break a reference (R11). This module checks first, because
the refusal has to name what still uses the record; the foreign key in the schema is the backstop
that holds when a route forgets to.
"""

import sqlite3
import uuid
from datetime import date as calendar_date
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator, model_validator

from app.auth import Connection, User

# Mirrors db.UNITS, and a test asserts the two agree so a unit cannot be added half-way.
# `g` is the gram basis: macros per gram, so "183 g" logs 183 × the per-gram figure.
Unit = Literal["cup", "tbsp", "tsp", "oz", "piece", "slice", "scoop", "g"]
Section = Literal["breakfast", "lunch", "dinner", "snacks"]
MACROS = ("calories", "protein", "carbs", "fat")
SECTIONS: tuple[Section, ...] = ("breakfast", "lunch", "dinner", "snacks")

# The connection and the guard come from auth: one home for the dependency both routers take, so a
# change to how a request gets its database - or who counts as the caller (R26) - cannot apply to
# one half of the API only.
router = APIRouter(prefix="/api", tags=["nutrition"])


# --- what a client sends -----------------------------------------------------------------


# A number that is not finite is not a quantity or a macro: JSON cannot carry it, SQLite stores it
# without complaint, and the totals it reaches come back null, which the app reads as zero.
Finite = {"allow_inf_nan": False}
NAME = {"min_length": 1, "max_length": 200}


def tidy_name(value: str) -> str:
    """A name with its surrounding space removed, and refused if that leaves nothing."""
    value = value.strip()
    if not value:
        raise ValueError("a name cannot be blank")
    return value


Source = Literal["typed", "usda"]


class FoodIn(BaseModel):
    name: str = Field(**NAME)
    unit: Unit
    calories: float = Field(ge=0, **Finite)
    protein: float = Field(ge=0, **Finite)
    carbs: float = Field(ge=0, **Finite)
    fat: float = Field(ge=0, **Finite)

    # Where the figures came from (D20, R36). A typed food has no id; a looked-up one must have USDA's.
    source: Source = "typed"
    source_id: str | None = Field(default=None, max_length=20, pattern=r"^[0-9]+$")

    @field_validator("name")
    @classmethod
    def name_is_not_blank(cls, value: str) -> str:
        return tidy_name(value)

    @model_validator(mode="after")
    def source_and_id_go_together(self) -> "FoodIn":
        if (self.source == "usda") != (self.source_id is not None):
            raise ValueError("a looked-up food carries USDA's id, and a typed food carries none")
        return self


class IngredientIn(BaseModel):
    food_id: str
    quantity: float = Field(gt=0, **Finite)


class MealIn(BaseModel):
    name: str = Field(**NAME)
    ingredients: list[IngredientIn] = Field(default=[], max_length=100)

    @field_validator("name")
    @classmethod
    def name_is_not_blank(cls, value: str) -> str:
        return tidy_name(value)


class EntryIn(BaseModel):
    """A food with a quantity, or a whole meal - the same rule the schema enforces."""

    section: Section
    food_id: str | None = None
    meal_id: str | None = None
    quantity: float | None = Field(default=None, **Finite)

    @model_validator(mode="after")
    def one_reference_and_a_matching_quantity(self) -> "EntryIn":
        if (self.food_id is None) == (self.meal_id is None):
            raise ValueError("an entry is a food or a meal, not both and not neither")

        if (self.food_id is None) != (self.quantity is None):
            raise ValueError("a quantity belongs to a food entry only")

        if self.quantity is not None and self.quantity <= 0:
            raise ValueError("a quantity is greater than zero")

        return self


# --- reading ------------------------------------------------------------------------------


# One row per entry, with the macros that entry contributes already worked out: a food scales
# its own macros, a meal contributes the total of its ingredients. The meal totals are grouped in
# a subquery so a meal entry costs the same as a food entry. The caller supplies the condition,
# because the same expansion is read per user, per day and per entry.


def entry_macros_sql(where: str) -> str:
    return f"""
    SELECT e.id, e.date, e.section, e.food_id, e.meal_id, e.quantity, e.rowid AS sequence,
           COALESCE(f.calories * e.quantity, m.calories, 0) AS calories,
           COALESCE(f.protein  * e.quantity, m.protein,  0) AS protein,
           COALESCE(f.carbs    * e.quantity, m.carbs,    0) AS carbs,
           COALESCE(f.fat      * e.quantity, m.fat,      0) AS fat
    FROM entries e
    LEFT JOIN foods f ON f.id = e.food_id
    LEFT JOIN (
        SELECT mf.meal_id,
               SUM(mf.quantity * f2.calories) AS calories,
               SUM(mf.quantity * f2.protein)  AS protein,
               SUM(mf.quantity * f2.carbs)    AS carbs,
               SUM(mf.quantity * f2.fat)      AS fat
        FROM meal_foods mf
        JOIN foods f2 ON f2.id = mf.food_id
        GROUP BY mf.meal_id
    ) m ON m.meal_id = e.meal_id
    WHERE {where}
    ORDER BY e.rowid
    """


def new_id(prefix: str) -> str:
    """Opaque and unique. Nothing outside the API depends on the shape of an id."""
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def not_found(what: str) -> HTTPException:
    """404 for a missing record *and* for one belonging to someone else.

    Deliberately the same answer: a 403 would confirm that another user's record exists.
    """
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"no such {what}")


def food_payload(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "unit": row["unit"],
        "macros": {macro: row[macro] for macro in MACROS},
        "source": row["source"],
        "sourceId": row["source_id"],
    }


def meal_payload(meal: sqlite3.Row, ingredients: list[sqlite3.Row]) -> dict:
    return {
        "id": meal["id"],
        "name": meal["name"],
        "ingredients": [
            {"foodId": row["food_id"], "quantity": row["quantity"]} for row in ingredients
        ],
        "macros": {
            macro: sum(row[macro] * row["quantity"] for row in ingredients) for macro in MACROS
        },
    }


def entry_payload(row: sqlite3.Row) -> dict:
    """The frontend's LogEntry union, so its render path does not change."""
    if row["food_id"] is not None:
        return {"id": row["id"], "kind": "food", "foodId": row["food_id"], "quantity": row["quantity"]}

    return {"id": row["id"], "kind": "meal", "mealId": row["meal_id"]}


def totals(rows: list[sqlite3.Row]) -> dict[str, float]:
    return {macro: sum(row[macro] for row in rows) for macro in MACROS}


def owned_food(connection: sqlite3.Connection, user: str, food_id: str) -> sqlite3.Row:
    row = connection.execute(
        "SELECT id, name, unit, calories, protein, carbs, fat, source, source_id FROM foods"
        " WHERE id = ? AND user_id = ?",
        (food_id, user),
    ).fetchone()

    if row is None:
        raise not_found("food")

    return row


def owned_meal(connection: sqlite3.Connection, user: str, meal_id: str) -> sqlite3.Row:
    row = connection.execute(
        "SELECT id, name FROM meals WHERE id = ? AND user_id = ?", (meal_id, user)
    ).fetchone()

    if row is None:
        raise not_found("meal")

    return row


def meal_rows(connection: sqlite3.Connection, user: str, meal_id: str | None = None) -> list[sqlite3.Row]:
    sql = (
        "SELECT mf.meal_id, mf.food_id, mf.quantity, f.calories, f.protein, f.carbs, f.fat"
        " FROM meal_foods mf"
        " JOIN meals m ON m.id = mf.meal_id"
        " JOIN foods f ON f.id = mf.food_id"
        " WHERE m.user_id = ?"
    )
    parameters: tuple = (user,)

    if meal_id is not None:
        sql += " AND mf.meal_id = ?"
        parameters += (meal_id,)

    return connection.execute(sql + " ORDER BY mf.rowid", parameters).fetchall()


def day_payload(connection: sqlite3.Connection, user: str, day: str) -> dict:
    """A date's log. A date with nothing on it is an empty day, not a missing one."""
    entries = connection.execute(
        entry_macros_sql("e.user_id = ? AND e.date = ?"), (user, day)
    ).fetchall()

    return {
        "date": day,
        "sections": {
            section: [entry_payload(row) for row in entries if row["section"] == section]
            for section in SECTIONS
        },
        "sectionMacros": {
            section: totals([row for row in entries if row["section"] == section])
            for section in SECTIONS
        },
        "macros": totals(entries),
    }


def usage_of(connection: sqlite3.Connection, user: str, *, food_id: str = "", meal_id: str = "") -> dict:
    """Where a record is still referenced. This is what makes the refusal explainable (R11)."""
    if food_id:
        meals = connection.execute(
            "SELECT m.id, m.name FROM meal_foods mf"
            " JOIN meals m ON m.id = mf.meal_id"
            " WHERE mf.food_id = ? AND m.user_id = ? ORDER BY m.name",
            (food_id, user),
        ).fetchall()
        days = connection.execute(
            "SELECT DISTINCT e.date AS date FROM entries e"
            " WHERE e.food_id = ? AND e.user_id = ? ORDER BY e.date DESC",
            (food_id, user),
        ).fetchall()
    else:
        meals = []
        days = connection.execute(
            "SELECT DISTINCT e.date AS date FROM entries e"
            " WHERE e.meal_id = ? AND e.user_id = ? ORDER BY e.date DESC",
            (meal_id, user),
        ).fetchall()

    return {
        "meals": [{"id": row["id"], "name": row["name"]} for row in meals],
        "days": [row["date"] for row in days],
    }


def usage_message(used_by: dict) -> str:
    parts: list[str] = []

    if used_by["meals"]:
        names = ", ".join(meal["name"] for meal in used_by["meals"])
        parts.append(f"used in {len(used_by['meals'])} meal(s) ({names})")

    if used_by["days"]:
        parts.append(f"logged on {len(used_by['days'])} day(s) ({', '.join(used_by['days'])})")

    return "cannot be deleted: " + " and ".join(parts)


def refuse_use(used_by: dict) -> None:
    if used_by["meals"] or used_by["days"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": usage_message(used_by), "usedBy": used_by},
        )


def write_ingredients(
    connection: sqlite3.Connection, user: str, meal_id: str, ingredients: list[IngredientIn]
) -> None:
    """Replace a meal's contents wholesale - the form edits the whole list."""
    for ingredient in ingredients:
        owned_food(connection, user, ingredient.food_id)

    connection.execute("DELETE FROM meal_foods WHERE meal_id = ?", (meal_id,))
    connection.executemany(
        "INSERT INTO meal_foods (id, meal_id, food_id, quantity) VALUES (?, ?, ?, ?)",
        [(new_id("mf"), meal_id, item.food_id, item.quantity) for item in ingredients],
    )


# --- foods (R4, R5, R7) -------------------------------------------------------------------


@router.get("/foods")
def list_foods(connection: Connection, user: User) -> list[dict]:
    rows = connection.execute(
        "SELECT id, name, unit, calories, protein, carbs, fat, source, source_id FROM foods"
        " WHERE user_id = ? ORDER BY name",
        (user,),
    ).fetchall()

    return [food_payload(row) for row in rows]


@router.post("/foods", status_code=status.HTTP_201_CREATED)
def create_food(food: FoodIn, connection: Connection, user: User) -> dict:
    food_id = new_id("food")

    connection.execute(
        "INSERT INTO foods (id, user_id, name, unit, calories, protein, carbs, fat, source, source_id)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            food_id, user, food.name, food.unit, food.calories, food.protein, food.carbs, food.fat,
            food.source, food.source_id,
        ),
    )
    connection.commit()

    return food_payload(owned_food(connection, user, food_id))


@router.put("/foods/{food_id}")
def update_food(food_id: str, food: FoodIn, connection: Connection, user: User) -> dict:
    owned_food(connection, user, food_id)

    connection.execute(
        "UPDATE foods SET name = ?, unit = ?, calories = ?, protein = ?, carbs = ?, fat = ?"
        " WHERE id = ?",
        (food.name, food.unit, food.calories, food.protein, food.carbs, food.fat, food_id),
    )
    connection.commit()

    return food_payload(owned_food(connection, user, food_id))


@router.delete("/foods/{food_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_food(food_id: str, connection: Connection, user: User) -> None:
    owned_food(connection, user, food_id)
    refuse_use(usage_of(connection, user, food_id=food_id))

    connection.execute("DELETE FROM foods WHERE id = ?", (food_id,))
    connection.commit()


# --- meals (R6, R8) ----------------------------------------------------------------------


@router.get("/meals")
def list_meals(connection: Connection, user: User) -> list[dict]:
    meals = connection.execute("SELECT id, name FROM meals WHERE user_id = ? ORDER BY name", (user,)).fetchall()
    ingredients: dict[str, list[sqlite3.Row]] = {}

    for row in meal_rows(connection, user):
        ingredients.setdefault(row["meal_id"], []).append(row)

    return [meal_payload(meal, ingredients.get(meal["id"], [])) for meal in meals]


@router.post("/meals", status_code=status.HTTP_201_CREATED)
def create_meal(meal: MealIn, connection: Connection, user: User) -> dict:
    meal_id = new_id("meal")

    with connection:  # one transaction: a meal without its ingredients is not a state to leave behind
        connection.execute("INSERT INTO meals (id, user_id, name) VALUES (?, ?, ?)", (meal_id, user, meal.name))
        write_ingredients(connection, user, meal_id, meal.ingredients)

    return meal_payload(owned_meal(connection, user, meal_id), meal_rows(connection, user, meal_id))


@router.put("/meals/{meal_id}")
def update_meal(meal_id: str, meal: MealIn, connection: Connection, user: User) -> dict:
    owned_meal(connection, user, meal_id)

    with connection:
        connection.execute("UPDATE meals SET name = ? WHERE id = ?", (meal.name, meal_id))
        write_ingredients(connection, user, meal_id, meal.ingredients)

    return meal_payload(owned_meal(connection, user, meal_id), meal_rows(connection, user, meal_id))


@router.delete("/meals/{meal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meal(meal_id: str, connection: Connection, user: User) -> None:
    owned_meal(connection, user, meal_id)
    refuse_use(usage_of(connection, user, meal_id=meal_id))

    with connection:
        connection.execute("DELETE FROM meal_foods WHERE meal_id = ?", (meal_id,))
        connection.execute("DELETE FROM meals WHERE id = ?", (meal_id,))


# --- days and entries (R4, R6, R9, R10) ---------------------------------------------------


@router.get("/days")
def list_days(connection: Connection, user: User) -> list[dict]:
    """Every date the user has logged anything on, newest first, each with what it came to.

    A date with nothing on it is not in this list, and does not need to be: reading one gives an
    empty day, and logging the first thing into it makes it appear.
    """
    rows = connection.execute(entry_macros_sql("e.user_id = ?"), (user,)).fetchall()
    by_date: dict[str, list[sqlite3.Row]] = {}

    for row in rows:
        by_date.setdefault(row["date"], []).append(row)

    return [
        {"date": day, "macros": totals(by_date[day])} for day in sorted(by_date, reverse=True)
    ]


@router.get("/days/{day}")
def read_day(day: calendar_date, connection: Connection, user: User) -> dict:
    """A date's log, with its sections and its figures. An empty date is an empty day, not a 404."""
    return day_payload(connection, user, day.isoformat())


@router.post("/days/{day}/entries", status_code=status.HTTP_201_CREATED)
def add_entry(day: calendar_date, entry: EntryIn, connection: Connection, user: User) -> dict:
    """Log something into a date. Any valid date will do - there is no day to open first."""
    if entry.food_id is not None:
        owned_food(connection, user, entry.food_id)
    else:
        owned_meal(connection, user, entry.meal_id or "")

    entry_id = new_id("entry")
    connection.execute(
        "INSERT INTO entries (id, user_id, date, section, food_id, meal_id, quantity)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (entry_id, user, day.isoformat(), entry.section, entry.food_id, entry.meal_id, entry.quantity),
    )
    connection.commit()

    row = connection.execute(entry_macros_sql("e.id = ?"), (entry_id,)).fetchone()

    return {**entry_payload(row), "macros": {macro: row[macro] for macro in MACROS}}


@router.delete("/days/{day}/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_entry(day: calendar_date, entry_id: str, connection: Connection, user: User) -> None:
    """Removing an entry is an edit of the day, not the deletion of a record, so no guard applies."""
    found = connection.execute(
        "SELECT id FROM entries WHERE id = ? AND user_id = ? AND date = ?",
        (entry_id, user, day.isoformat()),
    ).fetchone()

    if found is None:
        raise not_found("entry")

    connection.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
    connection.commit()
