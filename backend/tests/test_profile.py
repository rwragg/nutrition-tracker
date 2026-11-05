"""The profile routes (Part 12, R38-R41, R46, R50, R53).

Every person here is invented. The clock is set, so ages and the weight's date are the same on any
day the suite runs.
"""

import logging
import sqlite3
from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient

from people import approve
from app import db, profile
from app.main import app

TODAY = date(2026, 11, 4)

SEED = {"username": "user", "password": "password"}
ALICE = {"username": "alice", "email": "alice@example.com", "password": "correct-horse-battery"}
BOB = {"username": "bob", "email": "bob@example.com", "password": "bob-is-not-alice"}

# Example A in the plan: 40, 178 cm, 82 kg, moderate, lose -> 2,150 kcal and 130 g.
ANA = {
    "display_name": "Ana Example",
    "sex": "male",
    "birth_date": "1986-03-01",
    "height_cm": 178,
    "weight_kg": 82,
    "activity": "moderate",
    "goal": "lose",
    "units": "metric",
}


@pytest.fixture(autouse=True)
def the_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(profile, "today", lambda: TODAY)


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def signed_in(who: dict) -> TestClient:
    approve(who["username"])
    other = TestClient(app)
    other.__enter__()
    response = other.post("/api/login", json={"username": who["username"], "password": who["password"]})
    assert response.status_code == 200, response.text
    return other


@pytest.fixture
def seeded(client: TestClient) -> TestClient:
    assert client.post("/api/login", json=SEED).status_code == 200
    return client


@pytest.fixture
def alice_and_bob(client: TestClient) -> Iterator[tuple[TestClient, TestClient]]:
    for who in (ALICE, BOB):
        assert client.post("/api/register", json=who).status_code == 201
    alice, bob = signed_in(ALICE), signed_in(BOB)
    try:
        yield alice, bob
    finally:
        alice.__exit__(None, None, None)
        bob.__exit__(None, None, None)


def rows() -> list[sqlite3.Row]:
    connection = db.connect()
    try:
        return connection.execute("SELECT * FROM profiles").fetchall()
    finally:
        connection.close()


# --- R38: no profile is an ordinary state ---------------------------------------------------


def test_an_account_with_no_profile_gets_nulls_not_an_error(seeded: TestClient) -> None:
    response = seeded.get("/api/profile")

    assert response.status_code == 200
    assert response.json() == {"profile": None, "targets": None}


def test_the_seeded_account_starts_with_no_profile(seeded: TestClient) -> None:
    assert rows() == []


# --- writing and reading --------------------------------------------------------------------


def test_saving_returns_the_profile_and_its_targets(seeded: TestClient) -> None:
    response = seeded.put("/api/profile", json=ANA)

    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["display_name"] == "Ana Example"
    assert body["targets"]["calories"] == 2150
    assert body["targets"]["protein"] == 130
    assert body["targets"]["working"]["age"] == 40
    assert body["targets"]["working"]["resting"] == 1737.5


def test_reading_it_back_matches_what_was_saved(seeded: TestClient) -> None:
    saved = seeded.put("/api/profile", json=ANA).json()

    assert seeded.get("/api/profile").json() == saved


def test_saving_again_replaces_it_and_there_is_still_one_row(seeded: TestClient) -> None:
    seeded.put("/api/profile", json=ANA)
    seeded.put("/api/profile", json={**ANA, "display_name": "Ana Renamed", "goal": "maintain"})

    assert len(rows()) == 1
    body = seeded.get("/api/profile").json()
    assert body["profile"]["display_name"] == "Ana Renamed"
    assert body["targets"]["calories"] == 2690  # 2,693.1 with no adjustment


def test_a_name_has_its_surrounding_space_removed(seeded: TestClient) -> None:
    body = seeded.put("/api/profile", json={**ANA, "display_name": "  Ana  "}).json()

    assert body["profile"]["display_name"] == "Ana"


def test_the_route_stores_metric_and_keeps_the_units_preference(seeded: TestClient) -> None:
    """The units setting is what the form shows. The API takes and stores metric and nothing else,
    so the arithmetic has one set of units and the conversion lives in one place, the browser (D25)."""
    seeded.put("/api/profile", json={**ANA, "units": "imperial", "weight_kg": 74.84, "height_cm": 175.3})

    stored = rows()[0]
    assert (stored["weight_kg"], stored["height_cm"], stored["units"]) == (74.84, 175.3, "imperial")


# --- the weight is dated, by the server -----------------------------------------------------


def test_a_new_profile_dates_the_weight_today(seeded: TestClient) -> None:
    body = seeded.put("/api/profile", json=ANA).json()

    assert body["profile"]["weight_on"] == "2026-11-04"


def test_the_date_stays_when_the_weight_does(seeded: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    seeded.put("/api/profile", json=ANA)
    monkeypatch.setattr(profile, "today", lambda: date(2026, 12, 20))

    body = seeded.put("/api/profile", json={**ANA, "goal": "maintain"}).json()

    assert body["profile"]["weight_on"] == "2026-11-04"


def test_a_converted_weight_is_not_a_new_weigh_in(seeded: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """165 lb round-tripped through kilograms never lands on the exact stored figure."""
    seeded.put("/api/profile", json={**ANA, "weight_kg": 74.84274})
    monkeypatch.setattr(profile, "today", lambda: date(2026, 12, 20))

    body = seeded.put("/api/profile", json={**ANA, "weight_kg": 74.8}).json()

    assert body["profile"]["weight_on"] == "2026-11-04"


def test_a_changed_weight_takes_the_new_date_and_a_new_target(seeded: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    before = seeded.put("/api/profile", json=ANA).json()
    monkeypatch.setattr(profile, "today", lambda: date(2026, 12, 20))

    after = seeded.put("/api/profile", json={**ANA, "weight_kg": 78}).json()

    assert after["profile"]["weight_on"] == "2026-12-20"
    assert after["targets"]["protein"] < before["targets"]["protein"]
    assert after["targets"]["calories"] < before["targets"]["calories"]


# --- R46: overrides -------------------------------------------------------------------------


def test_an_own_figure_is_in_force_and_the_computed_one_is_still_shown(seeded: TestClient) -> None:
    body = seeded.put("/api/profile", json={**ANA, "kcal_override": 2300, "protein_override": 145}).json()

    targets = body["targets"]
    assert (targets["calories"], targets["protein"]) == (2300, 145)
    assert (targets["calories_from"], targets["protein_from"]) == ("own", "own")
    assert targets["computed"] == {"calories": 2150, "protein": 130}


def test_clearing_an_override_returns_to_the_computed_figure(seeded: TestClient) -> None:
    seeded.put("/api/profile", json={**ANA, "kcal_override": 2300})

    body = seeded.put("/api/profile", json=ANA).json()

    assert body["targets"]["calories"] == 2150
    assert body["targets"]["calories_from"] == "profile"


# --- R40: what the form refuses, both sides of every bound ---------------------------------


def refused(client: TestClient, **changes) -> dict:
    response = client.put("/api/profile", json={**ANA, **changes})
    assert response.status_code == 422, response.text
    return response.json()


def accepted(client: TestClient, **changes) -> None:
    response = client.put("/api/profile", json={**ANA, **changes})
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("field, low_bad, low_ok, high_ok, high_bad", [
    ("height_cm", 119.9, 120, 230, 230.1),
    ("weight_kg", 29.9, 30, 300, 300.1),
    ("kcal_override", 799, 800, 6000, 6001),
    ("protein_override", 19, 20, 400, 401),
])
def test_each_number_is_held_to_its_bounds_on_both_sides(seeded, field, low_bad, low_ok, high_ok, high_bad) -> None:
    for bad in (low_bad, high_bad):
        detail = refused(seeded, **{field: bad})["detail"]
        assert detail[0]["loc"] == ["body", field]
    for good in (low_ok, high_ok):
        accepted(seeded, **{field: good})


@pytest.mark.parametrize("born, ok", [
    ("2008-11-05", False),   # 17 years, 364 days
    ("2008-11-04", True),    # 18 today
    ("1926-11-04", True),    # 100 today
    ("1925-11-04", False),   # 101
    ("2030-01-01", False),   # not born yet
])
def test_the_age_limits_are_the_equations_not_a_guess(seeded, born, ok) -> None:
    if ok:
        accepted(seeded, birth_date=born)
    else:
        assert refused(seeded, birth_date=born)["detail"][0]["loc"] == ["body", "birth_date"]


@pytest.mark.parametrize("name, ok", [("A", True), ("x" * 40, True), ("x" * 41, False), ("", False), ("   ", False)])
def test_a_name_is_one_to_forty_characters_and_not_blank(seeded, name, ok) -> None:
    if ok:
        accepted(seeded, display_name=name)
    else:
        assert refused(seeded, display_name=name)["detail"][0]["loc"] == ["body", "display_name"]


@pytest.mark.parametrize("field, value", [
    ("sex", "other"), ("activity", "couch"), ("goal", "bulk"), ("units", "furlongs"),
])
def test_a_closed_list_stays_closed(seeded, field, value) -> None:
    assert refused(seeded, **{field: value})["detail"][0]["loc"] == ["body", field]


def test_a_number_that_is_not_finite_is_refused_not_stored(seeded: TestClient) -> None:
    assert refused(seeded, height_cm="nan")["detail"][0]["loc"] == ["body", "height_cm"]
    assert refused(seeded, weight_kg="inf")["detail"][0]["loc"] == ["body", "weight_kg"]


def test_a_refusal_writes_nothing_and_leaves_the_old_profile(seeded: TestClient) -> None:
    seeded.put("/api/profile", json=ANA)
    before = [dict(row) for row in rows()]

    refused(seeded, display_name="Changed", height_cm=5)

    assert [dict(row) for row in rows()] == before


def test_a_refusal_on_a_first_save_leaves_no_row(seeded: TestClient) -> None:
    refused(seeded, weight_kg=1)

    assert rows() == []


def test_delete_is_idempotent_and_returns_the_account_to_no_profile(seeded: TestClient) -> None:
    seeded.put("/api/profile", json=ANA)

    assert seeded.delete("/api/profile").status_code == 204
    assert seeded.delete("/api/profile").status_code == 204
    assert seeded.get("/api/profile").json() == {"profile": None, "targets": None}
    assert rows() == []


# --- R41: private to the account ------------------------------------------------------------


def test_each_account_sees_only_its_own_profile(alice_and_bob) -> None:
    alice, bob = alice_and_bob
    alice.put("/api/profile", json={**ANA, "display_name": "Alice"})

    assert bob.get("/api/profile").json() == {"profile": None, "targets": None}

    bob.put("/api/profile", json={**ANA, "display_name": "Bob", "goal": "gain"})

    assert alice.get("/api/profile").json()["profile"]["display_name"] == "Alice"
    assert bob.get("/api/profile").json()["profile"]["display_name"] == "Bob"
    assert alice.get("/api/profile").json()["targets"]["calories"] == 2150
    assert bob.get("/api/profile").json()["targets"]["calories"] == 2960  # 2,693.1 x 1.1


def test_one_account_cannot_replace_or_remove_anothers(alice_and_bob) -> None:
    alice, bob = alice_and_bob
    alice.put("/api/profile", json={**ANA, "display_name": "Alice"})

    bob.put("/api/profile", json={**ANA, "display_name": "Bob"})
    bob.delete("/api/profile")

    assert alice.get("/api/profile").json()["profile"]["display_name"] == "Alice"
    assert len(rows()) == 1


def test_there_is_no_route_that_takes_a_user_id() -> None:
    """Read off the OpenAPI schema, which lists what is served however the routers are nested."""
    paths = {path: set(methods) for path, methods in app.openapi()["paths"].items() if "profile" in path}

    assert paths == {"/api/profile": {"get", "put", "delete"}}


@pytest.mark.parametrize("method", ["get", "put", "delete"])
def test_signed_out_is_refused(client: TestClient, method: str) -> None:
    kwargs = {"json": ANA} if method == "put" else {}

    assert getattr(client, method)("/api/profile", **kwargs).status_code == 401


# --- R53: the bot cannot reach it -----------------------------------------------------------


def test_the_bot_can_reach_foods_but_not_the_profile(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """The contrast is the point: the same credentials open the nutrition routes and not this one."""
    monkeypatch.setenv("TELEGRAM_BOT_SECRET", "test-bot-secret")
    connection = db.connect()
    connection.execute("UPDATE users SET telegram_id = '4242' WHERE id = 'user'")
    connection.commit()
    connection.close()
    bot = {"X-Bot-Secret": "test-bot-secret", "X-Telegram-Chat": "4242"}

    assert client.get("/api/foods", headers=bot).status_code == 200
    assert client.get("/api/profile", headers=bot).status_code == 401
    assert client.put("/api/profile", json=ANA, headers=bot).status_code == 401
    assert client.delete("/api/profile", headers=bot).status_code == 401
    assert rows() == []


# --- R50: the figures stay where they were put ---------------------------------------------


def test_nothing_that_was_submitted_reaches_the_logs_or_a_refusal(seeded: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    secret_name = "Zephyrine Quillfeather"
    caplog.set_level(logging.DEBUG)

    seeded.put("/api/profile", json={**ANA, "display_name": secret_name, "birth_date": "1971-07-19"})
    invalid = seeded.put(
        "/api/profile",
        json={**ANA, "display_name": secret_name, "birth_date": "1971-07-19", "height_cm": 1234.5678},
    )

    assert invalid.status_code == 422
    for text in (invalid.text, caplog.text):
        assert secret_name not in text
        assert "1971-07-19" not in text
        assert "1234.5678" not in text


# --- the storage is a backstop for the route ------------------------------------------------


def test_the_table_itself_refuses_what_the_route_would(seeded: TestClient) -> None:
    connection = db.connect()
    try:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "INSERT INTO profiles (user_id, display_name, sex, birth_date, height_cm, weight_kg,"
                " weight_on, activity, goal) VALUES ('user', 'X', 'male', '1986-03-01', 10, 82,"
                " '2026-11-04', 'light', 'lose')"
            )
    finally:
        connection.close()


@pytest.mark.parametrize("born, weighed", [
    ("2026-02-31", "2026-11-04"),        # impossible: strftime/date normalise it, so IS catches it
    ("1986-03-01", "2026-02-30"),
    ("1986-03-01 12:00", "2026-11-04"),  # a timestamp is not a date
    ("not a date", "2026-11-04"),        # unparseable gives NULL, and a CHECK of NULL would pass
])
def test_the_table_refuses_a_date_that_is_not_one(seeded: TestClient, born: str, weighed: str) -> None:
    """The same trap docs/DATABASE.md records for entries: `= date` lets an unparseable string through
    because NULL passes a CHECK, so these use IS."""
    connection = db.connect()
    try:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "INSERT INTO profiles (user_id, display_name, sex, birth_date, height_cm, weight_kg,"
                " weight_on, activity, goal) VALUES ('user', 'X', 'male', ?, 170, 80, ?, 'light', 'lose')",
                (born, weighed),
            )
    finally:
        connection.close()


def test_an_account_with_a_profile_cannot_be_deleted_out_from_under_it(seeded: TestClient) -> None:
    """RESTRICT, as everywhere else: leaving an account (Part 10 step 4) must remove the profile first."""
    seeded.put("/api/profile", json=ANA)
    connection = db.connect()
    try:
        connection.execute("DELETE FROM telegram_codes")
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("DELETE FROM users WHERE id = 'user'")
    finally:
        connection.close()


def test_the_lists_the_route_and_the_schema_use_agree() -> None:
    """A level added to one and not the other would be a 422 for a value the table allows, or a
    500 for one the route allows and the table refuses."""
    from typing import get_args

    assert set(get_args(profile.Sex)) == set(db.SEXES)
    assert set(get_args(profile.Activity)) == set(db.ACTIVITY_LEVELS)
    assert set(get_args(profile.Goal)) == set(db.GOALS)
    assert set(get_args(profile.UnitSystem)) == set(db.UNIT_SYSTEMS)
