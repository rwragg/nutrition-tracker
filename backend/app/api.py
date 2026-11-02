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
from collections.abc import Iterator
from datetime import date as calendar_date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator

from app.auth import current_user
from app.db import connect

Unit = Literal["cup", "tbsp", "tsp", "oz", "piece", "slice", "scoop"]
Section = Literal["breakfast", "lunch", "dinner", "snacks"]
MACROS = ("calories", "protein", "carbs", "fat")
SECTIONS: tuple[Section, ...] = ("breakfast", "lunch", "dinner", "snacks")

router = APIRouter(prefix="/api", tags=["nutrition"])


def database() -> Iterator[sqlite3.Connection]:
    """One connection per request, closed when the request ends."""
    connection = connect()
    try:
        yield connection
    finally:
        connection.close()


Connection = Annotated[sqlite3.Connection, Depends(database)]
User = Annotated[str, Depends(current_user)]


# --- what a client sends -----------------------------------------------------------------


class FoodIn(BaseModel):
    name: str = Field(min_length=1)
    unit: Unit
    calories: float = Field(ge=0)
    protein: float = Field(ge=0)
    carbs: float = Field(ge=0)
    fat: float = Field(ge=0)


class IngredientIn(BaseModel):
    food_id: str
    quantity: float = Field(gt=0)


class MealIn(BaseModel):
    name: str = Field(min_length=1)
    ingredients: list[IngredientIn] = []


class EntryIn(BaseModel):
    """A food with a quantity, or a whole meal - the same rule the schema enforces."""

    section: Section
    food_id: str | None = None
    meal_id: str | None = None
    quantity: float | None = None

    @model_validator(mode="after")
    def one_reference_and_a_matching_quantity(self) -> "EntryIn":
        if (self.food_id is None) == (self.meal_id is None):
            raise ValueError("an entry is a food or a meal, not both and not neither")

        if (self.food_id is None) != (self.quantity is None):
            raise ValueError("a quantity belongs to a food entry only")

        if self.quantity is not None and self.quantity <= 0:
            raise ValueError("a quantity is greater than zero")

        return self


class DayIn(BaseModel):
    date: calendar_date


# --- reading ------------------------------------------------------------------------------


# One row per entry, with the macros that entry contributes already worked out: a food scales
# its own macros, a meal contributes the total of its ingredients. The meal totals are grouped in
# a subquery so a meal entry costs the same as a food entry. The caller supplies the condition,
# because the same expansion is read per user, per day and per entry.


def entry_macros_sql(where: str) -> str:
    return f"""
    SELECT e.id, e.day_id, e.section, e.food_id, e.meal_id, e.quantity, e.rowid AS sequence,
           COALESCE(f.calories * e.quantity, m.calories, 0) AS calories,
           COALESCE(f.protein  * e.quantity, m.protein,  0) AS protein,
           COALESCE(f.carbs    * e.quantity, m.carbs,    0) AS carbs,
           COALESCE(f.fat      * e.quantity, m.fat,      0) AS fat
    FROM entries e
    JOIN days d ON d.id = e.day_id
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
        "SELECT id, name, unit, calories, protein, carbs, fat FROM foods WHERE id = ? AND user_id = ?",
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


def owned_day(connection: sqlite3.Connection, user: str, day_id: str) -> sqlite3.Row:
    row = connection.execute(
        "SELECT id, date FROM days WHERE id = ? AND user_id = ?", (day_id, user)
    ).fetchone()

    if row is None:
        raise not_found("day")

    return row


def owned_day_at(connection: sqlite3.Connection, user: str, iso_date: str) -> sqlite3.Row:
    row = connection.execute(
        "SELECT id, date FROM days WHERE user_id = ? AND date = ?", (user, iso_date)
    ).fetchone()

    if row is None:
        raise not_found("day")

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


def day_payload(connection: sqlite3.Connection, user: str, day: sqlite3.Row) -> dict:
    entries = connection.execute(
        entry_macros_sql("d.user_id = ? AND e.day_id = ?"), (user, day["id"])
    ).fetchall()

    return {
        "id": day["id"],
        "date": day["date"],
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
            "SELECT DISTINCT d.id, d.date FROM entries e"
            " JOIN days d ON d.id = e.day_id"
            " WHERE e.food_id = ? AND d.user_id = ? ORDER BY d.date DESC",
            (food_id, user),
        ).fetchall()
    else:
        meals = []
        days = connection.execute(
            "SELECT DISTINCT d.id, d.date FROM entries e"
            " JOIN days d ON d.id = e.day_id"
            " WHERE e.meal_id = ? AND d.user_id = ? ORDER BY d.date DESC",
            (meal_id, user),
        ).fetchall()

    return {
        "meals": [{"id": row["id"], "name": row["name"]} for row in meals],
        "days": [{"id": row["id"], "date": row["date"]} for row in days],
    }


def usage_message(used_by: dict) -> str:
    parts: list[str] = []

    if used_by["meals"]:
        names = ", ".join(meal["name"] for meal in used_by["meals"])
        parts.append(f"used in {len(used_by['meals'])} meal(s) ({names})")

    if used_by["days"]:
        dates = ", ".join(day["date"] for day in used_by["days"])
        parts.append(f"logged on {len(used_by['days'])} day(s) ({dates})")

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
        "SELECT id, name, unit, calories, protein, carbs, fat FROM foods WHERE user_id = ? ORDER BY name",
        (user,),
    ).fetchall()

    return [food_payload(row) for row in rows]


@router.post("/foods", status_code=status.HTTP_201_CREATED)
def create_food(food: FoodIn, connection: Connection, user: User) -> dict:
    food_id = new_id("food")

    connection.execute(
        "INSERT INTO foods (id, user_id, name, unit, calories, protein, carbs, fat)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (food_id, user, food.name, food.unit, food.calories, food.protein, food.carbs, food.fat),
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
    """Every day the user has, newest first, each with what it came to."""
    rows = connection.execute(entry_macros_sql("d.user_id = ?"), (user,)).fetchall()
    by_day: dict[str, list[sqlite3.Row]] = {}

    for row in rows:
        by_day.setdefault(row["day_id"], []).append(row)

    days = connection.execute(
        "SELECT id, date FROM days WHERE user_id = ? ORDER BY date DESC", (user,)
    ).fetchall()

    return [
        {"id": day["id"], "date": day["date"], "macros": totals(by_day.get(day["id"], []))}
        for day in days
    ]


@router.post("/days")
def open_day(day: DayIn, connection: Connection, user: User) -> dict:
    """The day for a date, created if this is the first time it is opened.

    The seed only ever made the three days it was seeded with, so without this there is nowhere
    to log tomorrow's meals. Idempotent: opening the same date twice returns the same day.
    """
    iso = day.date.isoformat()
    existing = connection.execute(
        "SELECT id, date FROM days WHERE user_id = ? AND date = ?", (user, iso)
    ).fetchone()

    if existing is not None:
        return day_payload(connection, user, existing)

    connection.execute(
        "INSERT INTO days (id, user_id, date) VALUES (?, ?, ?)", (new_id("day"), user, iso)
    )
    connection.commit()

    return day_payload(connection, user, owned_day_at(connection, user, iso))


@router.get("/days/{day_id}")
def read_day(day_id: str, connection: Connection, user: User) -> dict:
    return day_payload(connection, user, owned_day(connection, user, day_id))


@router.post("/days/{day_id}/entries", status_code=status.HTTP_201_CREATED)
def add_entry(day_id: str, entry: EntryIn, connection: Connection, user: User) -> dict:
    owned_day(connection, user, day_id)

    if entry.food_id is not None:
        owned_food(connection, user, entry.food_id)
    else:
        owned_meal(connection, user, entry.meal_id or "")

    entry_id = new_id("entry")
    connection.execute(
        "INSERT INTO entries (id, day_id, section, food_id, meal_id, quantity) VALUES (?, ?, ?, ?, ?, ?)",
        (entry_id, day_id, entry.section, entry.food_id, entry.meal_id, entry.quantity),
    )
    connection.commit()

    row = connection.execute(entry_macros_sql("e.id = ?"), (entry_id,)).fetchone()

    return {**entry_payload(row), "macros": {macro: row[macro] for macro in MACROS}}


@router.delete("/days/{day_id}/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_entry(day_id: str, entry_id: str, connection: Connection, user: User) -> None:
    """Removing an entry is an edit of the day, not the deletion of a record, so no guard applies."""
    owned_day(connection, user, day_id)

    found = connection.execute(
        "SELECT id FROM entries WHERE id = ? AND day_id = ?", (entry_id, day_id)
    ).fetchone()

    if found is None:
        raise not_found("entry")

    connection.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
    connection.commit()
