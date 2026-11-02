"""Tests for the nutrition API (P6.1-P6.3).

Expected figures are always worked out here, in Python, from the raw records the API hands back -
never from the API's own answers. The arithmetic under test is SQL; this is a second, separate
implementation, which is the only way a wrong sum can fail.

Every one of these runs against a throwaway database (tests/conftest.py) created and seeded by the
app's own startup.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app

MACROS: tuple[str, ...] = ("calories", "protein", "carbs", "fat")
SECTIONS = ("breakfast", "lunch", "dinner", "snacks")
MVP_CREDENTIALS = {"username": "user", "password": "password"}


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A fresh client per test, so a session cookie never leaks between them."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def api(client: TestClient) -> TestClient:
    """A client that is signed in."""
    assert client.post("/api/login", json=MVP_CREDENTIALS).status_code == 200
    return client


def food_body(**overrides) -> dict:
    body = {"name": "Test food", "unit": "cup", "calories": 100, "protein": 10, "carbs": 20, "fat": 5}
    body.update(overrides)
    return body


def add_food(api: TestClient, **overrides) -> dict:
    response = api.post("/api/foods", json=food_body(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


def foods_by_id(api: TestClient) -> dict[str, dict]:
    return {food["id"]: food["macros"] for food in api.get("/api/foods").json()}


def meals_by_id(api: TestClient) -> dict[str, dict]:
    return {meal["id"]: meal for meal in api.get("/api/meals").json()}


def independent_meal_macros(meal: dict, foods: dict[str, dict]) -> dict[str, float]:
    """A meal's figures, from its ingredients alone."""
    return {
        macro: sum(foods[item["foodId"]][macro] * item["quantity"] for item in meal["ingredients"])
        for macro in MACROS
    }


def independent_day_macros(api: TestClient, day: dict) -> dict[str, float]:
    """A day's figures, from the foods and the ingredients - not from the API's meal totals."""
    foods = foods_by_id(api)
    meals = meals_by_id(api)
    total = dict.fromkeys(MACROS, 0.0)

    for entries in day["sections"].values():
        for entry in entries:
            if entry["kind"] == "food":
                for macro in MACROS:
                    total[macro] += foods[entry["foodId"]][macro] * entry["quantity"]
            else:
                for macro in MACROS:
                    total[macro] += independent_meal_macros(meals[entry["mealId"]], foods)[macro]

    return total


def today(api: TestClient) -> str:
    """The newest date in the log. Tests address a day by its date, as the API does."""
    return api.get("/api/days").json()[0]["date"]


# --- foods (P6.1, R4, R5, R7) -------------------------------------------------------------


def test_the_seeded_foods_come_back_with_their_macros(api: TestClient) -> None:
    foods = api.get("/api/foods").json()

    assert len(foods) == 31
    assert [food["name"] for food in foods] == sorted(food["name"] for food in foods)
    assert set(foods[0]) == {"id", "name", "unit", "macros"}
    assert set(foods[0]["macros"]) == set(MACROS)


def test_a_new_food_comes_back_and_is_listed(api: TestClient) -> None:
    created = add_food(api, name="Cottage cheese", calories=110)

    assert created["name"] == "Cottage cheese"
    assert created["macros"]["calories"] == 110
    assert created["id"] in [food["id"] for food in api.get("/api/foods").json()]


def test_a_food_can_be_edited(api: TestClient) -> None:
    created = add_food(api)
    updated = api.put(f"/api/foods/{created['id']}", json=food_body(name="Renamed", calories=250))

    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed"
    listed = {food["id"]: food for food in api.get("/api/foods").json()}
    assert listed[created["id"]]["macros"]["calories"] == 250


def test_two_foods_may_share_a_name(api: TestClient) -> None:
    """The UI allows it - two brands of the same thing - so the API must not refuse it."""
    first = add_food(api, name="Yoghurt", calories=100)
    second = add_food(api, name="Yoghurt", calories=200)

    assert first["id"] != second["id"]


@pytest.mark.parametrize(
    "body",
    [
        {"calories": -1},
        {"protein": -0.5},
        {"unit": "bucket"},
        {"name": ""},
        {"name": "No macros at all", "calories": None},
    ],
)
def test_a_malformed_food_is_refused(api: TestClient, body: dict) -> None:
    assert api.post("/api/foods", json=food_body(**body)).status_code == 422


def test_an_unknown_food_is_404(api: TestClient) -> None:
    assert api.put("/api/foods/nope", json=food_body()).status_code == 404
    assert api.delete("/api/foods/nope").status_code == 404


def test_an_unused_food_can_be_deleted(api: TestClient) -> None:
    created = add_food(api)

    assert api.delete(f"/api/foods/{created['id']}").status_code == 204
    assert created["id"] not in [food["id"] for food in api.get("/api/foods").json()]


# --- R11: the refusal names what still uses the record (P6.2) ------------------------------


def test_deleting_a_food_a_meal_uses_is_refused_and_names_the_meal(api: TestClient) -> None:
    food = add_food(api, name="Guard food")
    api.post("/api/meals", json={"name": "Guard meal", "ingredients": [{"food_id": food["id"], "quantity": 2}]})

    refusal = api.delete(f"/api/foods/{food['id']}")

    assert refusal.status_code == 409
    detail = refusal.json()["detail"]
    assert "Guard meal" in detail["message"]
    assert detail["usedBy"]["meals"] == [
        {"id": meal["id"], "name": "Guard meal"} for meal in api.get("/api/meals").json() if meal["name"] == "Guard meal"
    ]
    assert food["id"] in [item["id"] for item in api.get("/api/foods").json()]


def test_deleting_a_food_a_day_logs_is_refused_and_names_the_day(api: TestClient) -> None:
    day = today(api)
    food = add_food(api, name="Logged food")
    api.post(f"/api/days/{day}/entries", json={"section": "lunch", "food_id": food["id"], "quantity": 1})

    refusal = api.delete(f"/api/foods/{food['id']}")

    assert refusal.status_code == 409
    detail = refusal.json()["detail"]
    assert detail["usedBy"]["meals"] == []
    assert detail["usedBy"]["days"] == [day]
    assert day in detail["message"]


def test_deleting_a_food_used_both_ways_names_both(api: TestClient) -> None:
    day = today(api)
    food = add_food(api, name="Busy food")
    api.post("/api/meals", json={"name": "Busy meal", "ingredients": [{"food_id": food["id"], "quantity": 1}]})
    api.post(f"/api/days/{day}/entries", json={"section": "snacks", "food_id": food["id"], "quantity": 1})

    detail = api.delete(f"/api/foods/{food['id']}").json()["detail"]

    assert "Busy meal" in detail["message"]
    assert day in detail["message"]
    assert detail["usedBy"]["meals"] and detail["usedBy"]["days"]


def test_deleting_a_meal_a_day_logs_is_refused_and_names_the_day(api: TestClient) -> None:
    day = today(api)
    meal = api.post("/api/meals", json={"name": "Logged meal", "ingredients": []}).json()
    api.post(f"/api/days/{day}/entries", json={"section": "dinner", "meal_id": meal["id"]})

    refusal = api.delete(f"/api/meals/{meal['id']}")

    assert refusal.status_code == 409
    assert refusal.json()["detail"]["usedBy"]["days"] == [day]


def test_an_unused_meal_can_be_deleted(api: TestClient) -> None:
    meal = api.post("/api/meals", json={"name": "Spare meal", "ingredients": []}).json()

    assert api.delete(f"/api/meals/{meal['id']}").status_code == 204
    assert meal["id"] not in meals_by_id(api)


# --- meals (R6, R8) ----------------------------------------------------------------------


def test_the_seeded_meals_come_back_with_ingredients_and_figures(api: TestClient) -> None:
    meals = api.get("/api/meals").json()
    foods = foods_by_id(api)

    assert len(meals) == 5
    for meal in meals:
        assert meal["ingredients"], f"{meal['name']} has no ingredients"
        expected = independent_meal_macros(meal, foods)
        for macro in MACROS:
            assert meal["macros"][macro] == pytest.approx(expected[macro]), f"{meal['name']} {macro}"


def test_a_meal_can_be_created_with_its_ingredients(api: TestClient) -> None:
    oats = next(food for food in api.get("/api/foods").json() if food["name"] == "Rolled oats, dry")
    milk = next(food for food in api.get("/api/foods").json() if food["name"] == "Whole milk")

    created = api.post(
        "/api/meals",
        json={
            "name": "Porridge",
            "ingredients": [{"food_id": oats["id"], "quantity": 0.5}, {"food_id": milk["id"], "quantity": 1}],
        },
    )

    assert created.status_code == 201
    body = created.json()
    assert [item["foodId"] for item in body["ingredients"]] == [oats["id"], milk["id"]]
    assert body["macros"]["calories"] == pytest.approx(
        oats["macros"]["calories"] * 0.5 + milk["macros"]["calories"]
    )


def test_editing_a_meal_replaces_its_ingredients(api: TestClient) -> None:
    oats = next(food for food in api.get("/api/foods").json() if food["name"] == "Rolled oats, dry")
    meal = api.post(
        "/api/meals",
        json={"name": "Two things", "ingredients": [{"food_id": oats["id"], "quantity": 1}]},
    ).json()

    updated = api.put(f"/api/meals/{meal['id']}", json={"name": "One thing", "ingredients": []})

    assert updated.status_code == 200
    assert updated.json()["name"] == "One thing"
    assert updated.json()["ingredients"] == []
    assert updated.json()["macros"]["calories"] == 0
    assert updated.json()["macros"]["protein"] == 0


def test_a_meal_may_be_saved_empty(api: TestClient) -> None:
    """The meal form allows saving one before anything is added to it."""
    created = api.post("/api/meals", json={"name": "Empty", "ingredients": []})

    assert created.status_code == 201
    assert created.json()["macros"]["calories"] == 0


def test_a_meal_cannot_use_a_food_that_is_not_the_users(api: TestClient, someone_else: dict) -> None:
    response = api.post(
        "/api/meals",
        json={"name": "Mine", "ingredients": [{"food_id": someone_else["food"], "quantity": 1}]},
    )

    assert response.status_code == 404
    assert "Mine" not in [meal["name"] for meal in api.get("/api/meals").json()]


# --- days (R4, R9, R10) -------------------------------------------------------------------


def test_the_days_come_back_newest_first_with_their_figures(api: TestClient) -> None:
    days = api.get("/api/days").json()

    assert len(days) == 3
    assert [day["date"] for day in days] == sorted((day["date"] for day in days), reverse=True)
    for day in days:
        body = api.get(f"/api/days/{day['date']}").json()
        expected = independent_day_macros(api, body)
        for macro in MACROS:
            assert day["macros"][macro] == pytest.approx(expected[macro]), f"{day['date']} {macro}"


def test_reading_a_day_gives_its_sections_entries_and_figures(api: TestClient) -> None:
    day = today(api)
    body = api.get(f"/api/days/{day}").json()

    assert body["date"] == day
    assert set(body["sections"]) == set(SECTIONS)
    assert set(body["sectionMacros"]) == set(SECTIONS)
    assert set(body["macros"]) == set(MACROS)
    # The seeded day: 2 + 2 + 1 + 3, which is 8 of the seed's 17 entries.
    assert {section: len(entries) for section, entries in body["sections"].items()} == {
        "breakfast": 2,
        "lunch": 2,
        "dinner": 1,
        "snacks": 3,
    }
    for entry in body["sections"]["breakfast"]:
        assert entry["kind"] in {"food", "meal"}

    # The day's figures are its sections', and the section figures are their entries'.
    for macro in MACROS:
        assert body["macros"][macro] == pytest.approx(
            sum(body["sectionMacros"][section][macro] for section in SECTIONS)
        )


def test_a_date_with_nothing_on_it_is_an_empty_day_not_a_404(api: TestClient) -> None:
    """The point of the date being a column: an empty day needs nothing stored to exist."""
    body = api.get("/api/days/2030-01-01")

    assert body.status_code == 200
    assert body.json()["date"] == "2030-01-01"
    assert body.json()["macros"]["calories"] == 0
    assert all(entries == [] for entries in body.json()["sections"].values())
    assert "2030-01-01" not in [day["date"] for day in api.get("/api/days").json()]


def test_a_malformed_date_is_refused(api: TestClient) -> None:
    """FastAPI validates the date in the path, so a junk date never reaches the database."""
    assert api.get("/api/days/01-11-2026").status_code == 422
    assert api.get("/api/days/not-a-date").status_code == 422
    assert api.post(
        "/api/days/2026-02-31/entries", json={"section": "lunch", "food_id": "hummus", "quantity": 1}
    ).status_code == 422


# --- entries (R4, R6) ---------------------------------------------------------------------


def test_logging_a_date_beyond_the_seed_needs_no_day_first(api: TestClient) -> None:
    """This is the endpoint that used to exist: a day had to be created before it could be logged."""
    food = add_food(api, name="Tomorrow food", calories=200)
    assert "2030-01-01" not in [day["date"] for day in api.get("/api/days").json()]

    created = api.post(
        "/api/days/2030-01-01/entries", json={"section": "lunch", "food_id": food["id"], "quantity": 2}
    )

    assert created.status_code == 201
    listed = {day["date"]: day for day in api.get("/api/days").json()}
    assert listed["2030-01-01"]["macros"]["calories"] == pytest.approx(400)


def test_adding_a_food_entry_moves_the_days_figures(api: TestClient) -> None:
    day = today(api)
    before = api.get(f"/api/days/{day}").json()
    food = add_food(api, name="Entry food", calories=100, protein=10, carbs=20, fat=5)

    created = api.post(
        f"/api/days/{day}/entries",
        json={"section": "lunch", "food_id": food["id"], "quantity": 2},
    )

    assert created.status_code == 201
    body = created.json()
    assert body["kind"] == "food" and body["quantity"] == 2 and body["foodId"] == food["id"]
    assert body["macros"]["calories"] == pytest.approx(200)

    after = api.get(f"/api/days/{day}").json()
    assert after["macros"]["calories"] == pytest.approx(before["macros"]["calories"] + 200)
    assert after["macros"]["protein"] == pytest.approx(before["macros"]["protein"] + 20)
    assert after["sectionMacros"]["lunch"]["calories"] == pytest.approx(
        before["sectionMacros"]["lunch"]["calories"] + 200
    )
    assert after["sectionMacros"]["dinner"] == before["sectionMacros"]["dinner"]
    assert food["id"] in [entry["foodId"] for entry in after["sections"]["lunch"] if entry["kind"] == "food"]


def test_adding_a_meal_entry_contributes_the_meals_figures(api: TestClient) -> None:
    day = today(api)
    meal = {meal["name"]: meal for meal in api.get("/api/meals").json()}["Post-workout shake"]
    before = api.get(f"/api/days/{day}").json()
    before_snacks = before["sectionMacros"]["snacks"]["calories"]

    created = api.post(f"/api/days/{day}/entries", json={"section": "snacks", "meal_id": meal["id"]})

    assert created.status_code == 201
    assert created.json()["kind"] == "meal"
    after = api.get(f"/api/days/{day}").json()
    assert after["macros"]["calories"] == pytest.approx(before["macros"]["calories"] + meal["macros"]["calories"])
    assert after["sectionMacros"]["snacks"]["calories"] == pytest.approx(
        before_snacks + meal["macros"]["calories"]
    )


def test_removing_an_entry_puts_the_figures_back(api: TestClient) -> None:
    day = today(api)
    before = api.get(f"/api/days/{day}").json()["macros"]
    food = add_food(api, calories=150)
    entry = api.post(
        f"/api/days/{day}/entries", json={"section": "dinner", "food_id": food["id"], "quantity": 1}
    ).json()

    assert api.delete(f"/api/days/{day}/entries/{entry['id']}").status_code == 204

    after = api.get(f"/api/days/{day}").json()
    assert after["macros"]["calories"] == pytest.approx(before["calories"])


@pytest.mark.parametrize(
    "body",
    [
        {"section": "lunch"},
        {"section": "lunch", "food_id": "hummus", "meal_id": "pasta-night", "quantity": 1},
        {"section": "lunch", "meal_id": "pasta-night", "quantity": 2},
        {"section": "lunch", "food_id": "hummus"},
        {"section": "lunch", "food_id": "hummus", "quantity": 0},
        {"section": "brunch", "food_id": "hummus", "quantity": 1},
    ],
)
def test_a_malformed_entry_is_refused(api: TestClient, body: dict) -> None:
    day = today(api)

    assert api.post(f"/api/days/{day}/entries", json=body).status_code == 422


def test_an_entry_on_a_date_with_nothing_on_it_is_accepted(api: TestClient) -> None:
    """There is no "unknown day" any more: a valid date is loggable, empty or not."""
    response = api.post(
        "/api/days/2030-06-01/entries", json={"section": "lunch", "food_id": "hummus", "quantity": 1}
    )

    assert response.status_code == 201
    assert api.get("/api/days/2030-06-01").json()["sections"]["lunch"]


def test_an_entry_with_an_unknown_food_or_meal_is_404(api: TestClient) -> None:
    day = today(api)

    assert api.post(
        f"/api/days/{day}/entries", json={"section": "lunch", "food_id": "nope", "quantity": 1}
    ).status_code == 404
    assert api.post(f"/api/days/{day}/entries", json={"section": "lunch", "meal_id": "nope"}).status_code == 404


def test_removing_an_unknown_entry_is_404(api: TestClient) -> None:
    day = today(api)

    assert api.delete(f"/api/days/{day}/entries/nope").status_code == 404


def test_an_entry_cannot_be_removed_from_the_wrong_date(api: TestClient) -> None:
    """The entry exists, but not on that date, so it is not found there."""
    food = add_food(api)
    entry = api.post(
        f"/api/days/{today(api)}/entries",
        json={"section": "lunch", "food_id": food["id"], "quantity": 1},
    ).json()

    assert api.delete(f"/api/days/2030-01-01/entries/{entry['id']}").status_code == 404
    assert api.delete(f"/api/days/{today(api)}/entries/{entry['id']}").status_code == 204


# --- P6.3: one user cannot see or touch another's data -------------------------------------


@pytest.fixture
def someone_else(api: TestClient) -> dict:
    """Another user's records, written straight to the database - the API cannot create them."""
    with db.connect() as connection:
        connection.execute("INSERT INTO users (id, username) VALUES ('someone-else', 'someone-else')")
        connection.execute(
            "INSERT INTO foods (id, user_id, name, unit, calories, protein, carbs, fat)"
            " VALUES ('their-food', 'someone-else', 'Their food', 'cup', 99, 9, 9, 9)"
        )
        connection.execute("INSERT INTO meals (id, user_id, name) VALUES ('their-meal', 'someone-else', 'Their meal')")
        connection.execute(
            "INSERT INTO meal_foods (id, meal_id, food_id, quantity)"
            " VALUES ('their-mf', 'their-meal', 'their-food', 1)"
        )
        connection.execute(
            "INSERT INTO entries (id, user_id, date, section, food_id, quantity)"
            " VALUES ('their-entry', 'someone-else', '2020-02-02', 'lunch', 'their-food', 1)"
        )
        connection.commit()

    return {"food": "their-food", "meal": "their-meal", "date": "2020-02-02", "entry": "their-entry"}


def test_another_users_records_are_never_listed(api: TestClient, someone_else: dict) -> None:
    assert someone_else["food"] not in [food["id"] for food in api.get("/api/foods").json()]
    assert someone_else["meal"] not in meals_by_id(api)
    assert someone_else["date"] not in [day["date"] for day in api.get("/api/days").json()]
    assert len(api.get("/api/foods").json()) == 31


def test_another_users_record_is_404_not_403(api: TestClient, someone_else: dict) -> None:
    """403 would confirm the record exists. 404 says nothing either way."""
    assert api.put(f"/api/foods/{someone_else['food']}", json=food_body()).status_code == 404
    assert api.delete(f"/api/foods/{someone_else['food']}").status_code == 404
    assert api.delete(f"/api/meals/{someone_else['meal']}").status_code == 404


def test_another_users_date_reads_as_empty_not_as_theirs(api: TestClient, someone_else: dict) -> None:
    """Their date is a valid date, so it answers - with nothing of theirs in it."""
    body = api.get(f"/api/days/{someone_else['date']}").json()

    assert body["date"] == someone_else["date"]
    assert body["macros"]["calories"] == 0
    assert all(entries == [] for entries in body["sections"].values())


def test_two_users_can_log_the_same_date_without_seeing_each_other(api: TestClient, someone_else: dict) -> None:
    """The same calendar day for both, and neither sees the other's row."""
    food = add_food(api, calories=111)
    api.post(
        f"/api/days/{someone_else['date']}/entries",
        json={"section": "dinner", "food_id": food["id"], "quantity": 1},
    )

    mine = api.get(f"/api/days/{someone_else['date']}").json()

    assert mine["macros"]["calories"] == pytest.approx(111)
    assert len(mine["sections"]["lunch"]) == 0
    with db.connect() as connection:
        theirs = connection.execute("SELECT count(*) FROM entries WHERE user_id = 'someone-else'").fetchone()[0]
    assert theirs == 1


def test_another_users_entry_cannot_be_removed(api: TestClient, someone_else: dict) -> None:
    """The entry is theirs, so as far as I am concerned it does not exist."""
    assert api.delete(f"/api/days/{someone_else['date']}/entries/{someone_else['entry']}").status_code == 404

    with db.connect() as connection:
        theirs = connection.execute("SELECT count(*) FROM entries WHERE id = 'their-entry'").fetchone()[0]

    assert theirs == 1
