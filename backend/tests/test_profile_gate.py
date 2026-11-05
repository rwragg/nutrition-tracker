"""Part 12, R54: a profile comes before adding anything.

An account with no profile cannot create an entry, a food or a meal. It can still read, look a food up,
edit, delete and remove, so nothing already in the log is trapped. Only invented people are used (R51).
"""

import urllib.error
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app import bot
from app.main import app
from app.profile import SET_UP_FIRST
from people import approve, give_profile

SEED = {"username": "user", "password": "password"}
DAY = "2026-11-02"


@pytest.fixture
def seeded() -> Iterator[TestClient]:
    """Signed in as the seeded account, which has no profile."""
    with TestClient(app) as client:
        assert client.post("/api/login", json=SEED).status_code == 200
        yield client


def food_body(**overrides) -> dict:
    return {"name": "Gate test food", "unit": "cup", "calories": 100, "protein": 10, "carbs": 20, "fat": 5, **overrides}


def counts(client: TestClient) -> tuple[int, int, int]:
    """Foods, meals, and entries on the test day - what a refusal must leave exactly as it found it."""
    entries = sum(len(v) for v in client.get(f"/api/days/{DAY}").json()["sections"].values())
    return len(client.get("/api/foods").json()), len(client.get("/api/meals").json()), entries


def a_food_and_a_meal(client: TestClient) -> tuple[str, str]:
    foods = client.get("/api/foods").json()
    meals = client.get("/api/meals").json()
    return foods[0]["id"], meals[0]["id"]


def test_each_create_is_refused_without_a_profile_and_writes_nothing(seeded: TestClient) -> None:
    food_id, meal_id = a_food_and_a_meal(seeded)
    before = counts(seeded)

    refused = [
        seeded.post("/api/foods", json=food_body()),
        seeded.post("/api/meals", json={"name": "Gate test meal", "ingredients": [{"food_id": food_id, "quantity": 1}]}),
        seeded.post(f"/api/days/{DAY}/entries", json={"section": "lunch", "food_id": food_id, "quantity": 1}),
        seeded.post(f"/api/days/{DAY}/entries", json={"section": "lunch", "meal_id": meal_id}),
    ]

    assert [response.status_code for response in refused] == [409, 409, 409, 409]
    assert {response.json()["detail"] for response in refused} == {SET_UP_FIRST}
    assert counts(seeded) == before  # not a food, not a meal, not an entry, and no orphan food left behind


def test_a_looked_up_food_cannot_be_added_without_a_profile_and_leaves_no_food(seeded: TestClient) -> None:
    """The screen adds a looked-up food by creating the food and then the entry. The first is refused, so
    the second is never asked for and nothing is left behind (D33)."""
    before = counts(seeded)

    created = seeded.post(
        "/api/foods",
        json=food_body(name="Rice, brown, cooked", unit="g", source="usda", source_id="168880"),
    )

    assert created.status_code == 409
    assert counts(seeded) == before


def test_everything_that_does_not_create_still_works_without_a_profile(seeded: TestClient) -> None:
    """Reading, looking up, editing, deleting and removing an entry are not gated: the rule traps nothing."""
    # arrange: make things while a profile exists, then take the profile away
    give_profile(seeded)
    food = seeded.post("/api/foods", json=food_body()).json()
    spare = seeded.post("/api/foods", json=food_body(name="Spare food")).json()
    meal = seeded.post("/api/meals", json={"name": "Gate meal", "ingredients": [{"food_id": food["id"], "quantity": 1}]}).json()
    entry = seeded.post(f"/api/days/{DAY}/entries", json={"section": "lunch", "food_id": food["id"], "quantity": 1}).json()
    assert seeded.delete("/api/profile").status_code == 204

    assert seeded.get("/api/foods").status_code == 200
    assert seeded.get("/api/meals").status_code == 200
    assert seeded.get("/api/days").status_code == 200
    assert seeded.get(f"/api/days/{DAY}").status_code == 200
    assert seeded.get("/api/profile").status_code == 200

    lookup = seeded.get("/api/lookup/foods", params={"q": "rice"})
    assert lookup.status_code != 409  # whatever the lookup answers (it may have no key here), it is not this rule
    assert SET_UP_FIRST not in lookup.text

    assert seeded.put(f"/api/foods/{food['id']}", json=food_body(name="Gate test food, renamed")).status_code == 200
    assert seeded.put(f"/api/meals/{meal['id']}", json={"name": "Gate meal, renamed", "ingredients": [{"food_id": food["id"], "quantity": 2}]}).status_code == 200
    assert seeded.delete(f"/api/days/{DAY}/entries/{entry['id']}").status_code == 204
    assert seeded.delete(f"/api/meals/{meal['id']}").status_code == 204
    assert seeded.delete(f"/api/foods/{spare['id']}").status_code == 204


def test_the_same_call_succeeds_once_a_profile_exists_and_is_refused_again_after_it_is_removed(seeded: TestClient) -> None:
    food_id, _ = a_food_and_a_meal(seeded)
    entry = {"section": "snacks", "food_id": food_id, "quantity": 1}

    assert seeded.post(f"/api/days/{DAY}/entries", json=entry).status_code == 409

    give_profile(seeded)
    assert seeded.post(f"/api/days/{DAY}/entries", json=entry).status_code == 201

    assert seeded.delete("/api/profile").status_code == 204
    assert seeded.post(f"/api/days/{DAY}/entries", json=entry).status_code == 409


def test_a_profile_belongs_to_its_account_so_one_account_does_not_unlock_another(seeded: TestClient) -> None:
    """Alice having a profile must not let the seeded account add: the check is per account, not global."""
    alice = {"username": "alice", "email": "alice@example.com", "password": "alice-example-password"}
    with TestClient(app) as other:
        assert other.post("/api/register", json=alice).status_code == 201
        approve("alice")
        assert other.post("/api/login", json={"username": "alice", "password": alice["password"]}).status_code == 200
        give_profile(other)
        assert other.post("/api/foods", json=food_body()).status_code == 201

    assert seeded.post("/api/foods", json=food_body()).status_code == 409


def test_a_signed_out_caller_is_still_unauthorised_not_asked_for_a_profile() -> None:
    """The order of the two refusals matters: who you are comes before what you have set up."""
    with TestClient(app) as anonymous:
        assert anonymous.post("/api/foods", json=food_body()).status_code == 401


def test_the_refusal_is_a_409_not_a_403_so_the_bot_does_not_call_it_an_unlinked_chat() -> None:
    """bot.app_refusal reads a 403 as 'this chat is not linked'. The profile refusal must reach the person
    in its own words, with the usual 'nothing was logged' after it."""
    import io
    import json

    body = io.BytesIO(json.dumps({"detail": SET_UP_FIRST}).encode())
    error = urllib.error.HTTPError("u", 409, "conflict", {}, body)  # type: ignore[arg-type]

    reply = bot.app_refusal(error, ". Nothing was logged.")

    assert reply == f"{SET_UP_FIRST}. Nothing was logged."
    assert bot.LINK_INSTRUCTIONS not in reply
