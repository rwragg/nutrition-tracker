"""Tests for the Telegram front end (Part 9).

The bot is a second client of this API, so most of what can go wrong is not in the
network: it is a message parsed into the wrong arguments, a name resolved to the wrong
food, or a number reported that the app does not hold. Those are asserted here against a
stub client, and the two commands are exercised end to end through `handle` — the only
part that needs a real app is `Api`, which the container test covers.
"""

from collections.abc import Iterator
from typing import get_args
import urllib.error

import pytest

from app import bot
from app.api import Unit
from app.db import UNITS

TODAY = "2026-11-02"

FOODS = [
    {"id": "oats", "name": "Rolled oats, dry", "unit": "cup", "macros": {"calories": 300, "protein": 10, "carbs": 54, "fat": 6}},
    {"id": "yogurt-g", "name": "Greek yogurt, weighed", "unit": "g", "macros": {"calories": 0.61, "protein": 0.1, "carbs": 0.036, "fat": 0.017}},
    {"id": "yogurt-plain", "name": "Greek yogurt, plain", "unit": "cup", "macros": {"calories": 130, "protein": 23, "carbs": 9, "fat": 0.7}},
    {"id": "yogurt-vanilla", "name": "Greek yogurt, vanilla", "unit": "cup", "macros": {"calories": 150, "protein": 20, "carbs": 14, "fat": 1}},
]

MEALS = [
    {"id": "m1", "name": "Typical breakfast", "ingredients": []},
    {"id": "m2", "name": "Pasta night", "ingredients": []},
]


def day_payload(*, with_entries: bool = True, section_macros: dict | None = None) -> dict:
    breakfast = (
        [{"id": "e1", "kind": "food", "foodId": "oats", "quantity": 0.5},
         {"id": "e2", "kind": "meal", "mealId": "m1"}]
        if with_entries else []
    )
    return {
        "date": TODAY,
        "sections": {"breakfast": breakfast, "lunch": [], "dinner": [], "snacks": []},
        "sectionMacros": section_macros or {
            "breakfast": {"calories": 150, "protein": 5, "carbs": 27, "fat": 3},
            "lunch": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0},
            "dinner": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0},
            "snacks": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0},
        },
        "macros": {"calories": 150, "protein": 5, "carbs": 27, "fat": 3},
    }


class FakeApi:
    """Just enough of the client to run a message, recording what the bot asked for."""

    def __init__(self, foods: list[dict] | None = None, day: dict | None = None,
                 meals: list[dict] | None = None, post_fails: Exception | None = None) -> None:
        self._foods = FOODS if foods is None else foods
        self._meals = MEALS if meals is None else meals
        self._day = day or day_payload()
        self.post_fails = post_fails
        self.posted: list[tuple] = []
        self.signed_in = False

    def sign_in(self) -> None:
        self.signed_in = True

    def foods(self) -> list[dict]:
        return self._foods

    def meals(self) -> list[dict]:
        return self._meals

    def day(self, day: str) -> dict:
        return self._day

    def add_food_entry(self, day: str, section: str, food_id: str, quantity: float) -> dict:
        if self.post_fails:
            raise self.post_fails
        self.posted.append((day, section, food_id, quantity))
        return {"id": "new", "kind": "food", "foodId": food_id, "quantity": quantity}


@pytest.fixture
def api() -> Iterator[FakeApi]:
    yield FakeApi()


# --- parsing ----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text, expected",
    [
        ("/today", "today"),
        ("/day", "today"),
        ("/TODAY", "today"),
        ("/today@nutrition_bot", "today"),
        ("/help", "help"),
        ("/start", "help"),
        ("/log rice 1 cup", "log"),
        ("hello there", "unknown"),
        ("", "unknown"),
        ("/nonsense", "unknown"),
    ],
)
def test_a_message_becomes_one_command(text: str, expected: str) -> None:
    name, _ = bot.parse(text)
    assert name == expected


def test_the_arguments_of_a_log_message() -> None:
    name, args = bot.parse("/log rolled oats 40 g breakfast")
    assert name == "log"
    assert args == {"name": "rolled oats", "quantity": 40.0, "unit": "g", "section": "breakfast"}


def test_the_section_defaults_when_it_is_left_out() -> None:
    _, args = bot.parse("/log banana 1 piece")
    assert args["section"] == bot.DEFAULT_SECTION


def test_a_multi_word_food_name_keeps_its_words() -> None:
    _, args = bot.parse("/log greek yogurt vanilla 183 g")
    assert args["name"] == "greek yogurt vanilla"


def test_a_section_name_is_not_part_of_the_food() -> None:
    """'lunch' at the end is the section, not another word of the food."""
    _, args = bot.parse("/log chicken salad 1 cup lunch")
    assert args["name"] == "chicken salad"
    assert args["section"] == "lunch"


@pytest.mark.parametrize(
    "text, fragment",
    [
        ("/log", "usage"),
        ("/log rice", "usage"),
        ("/log rice 1", "not a unit"),
        ("/log rice 1 bucket", "not a unit"),
        ("/log rice many cups", "not a quantity"),
        ("/log rice 0 cups", "greater than zero"),
        ("/log  1 cup", "which food"),
    ],
)
def test_a_malformed_log_is_explained_rather_than_raised(text: str, fragment: str) -> None:
    name, args = bot.parse(text)
    assert name == "log"
    assert fragment in args["error"]


def test_every_unit_the_api_accepts_is_one_the_bot_accepts() -> None:
    """The bot's unit list and the API's literal must not drift: a unit the app accepts but
    the bot rejects is a command that cannot be sent, and the reverse is a 422 the user
    cannot understand."""
    assert set(UNITS) == set(get_args(Unit))
    for unit in UNITS:
        name, args = bot.parse(f"/log something 1 {unit}")
        assert name == "log" and "error" not in args


# --- resolving a name -------------------------------------------------------------------


def test_an_exact_name_resolves() -> None:
    food, candidates = bot.find_food("Rolled oats, dry", FOODS)
    assert food is not None
    assert food["id"] == "oats" and candidates == []


def test_resolving_ignores_case() -> None:
    food, _ = bot.find_food("rolled OATS, dry", FOODS)
    assert food is not None and food["id"] == "oats"


def test_an_unambiguous_partial_name_resolves() -> None:
    food, candidates = bot.find_food("oats", FOODS)
    assert food is not None
    assert food["id"] == "oats" and candidates == []


def test_an_ambiguous_name_resolves_to_nothing_and_lists_the_candidates() -> None:
    """Three Greek yogurts, so guessing one would log the wrong macros — the failure this
    is here to prevent."""
    food, candidates = bot.find_food("greek yogurt", FOODS)
    assert food is None
    assert {candidate["id"] for candidate in candidates} == {"yogurt-g", "yogurt-plain", "yogurt-vanilla"}


def test_an_unknown_name_finds_nothing() -> None:
    food, candidates = bot.find_food("unobtainium", FOODS)
    assert food is None and candidates == []


# --- replies ----------------------------------------------------------------------------


def test_the_day_reads_back_with_its_food_names_and_sections() -> None:
    text = bot.format_day(day_payload(), FOODS, MEALS)
    assert TODAY in text
    assert "150 kcal" in text and "5 g protein" in text
    assert "Breakfast (150 kcal)" in text
    assert "Rolled oats, dry ×0.5" in text
    assert "Typical breakfast" in text       # a meal is named, not just counted
    assert "Lunch" not in text               # empty sections are left out rather than listed


def test_a_meal_entry_with_no_meal_left_behind_it_still_reads() -> None:
    """A name that cannot be resolved falls back to words rather than to the raw id."""
    payload = day_payload()
    payload["sections"]["breakfast"][1]["mealId"] = "gone"
    assert "a meal" in bot.format_day(payload, FOODS, MEALS)


def test_an_empty_day_says_so() -> None:
    assert "Nothing logged yet." in bot.format_day(day_payload(with_entries=False), FOODS, MEALS)


def test_an_unknown_food_id_is_shown_as_its_id_rather_than_hidden() -> None:
    payload = day_payload()
    payload["sections"]["breakfast"][0]["foodId"] = "gone"
    assert "gone" in bot.format_day(payload, FOODS, MEALS)


# --- the two commands, end to end -------------------------------------------------------


def test_today_asks_the_api_for_the_machine_s_date(api: FakeApi) -> None:
    reply = bot.handle("/today", api, today=TODAY)
    assert "150 kcal" in reply


def test_log_posts_the_entry_and_reports_the_new_figures(api: FakeApi) -> None:
    reply = bot.handle("/log oats 1 cup", api, today=TODAY)
    assert api.posted == [(TODAY, "snacks", "oats", 1.0)]
    assert "Logged" in reply and "kcal" in reply


def test_log_writes_the_day_it_was_given_and_the_section_it_was_told(api: FakeApi) -> None:
    bot.handle("/log greek yogurt weighed 183 g breakfast", api, today=TODAY)
    day, section, food_id, quantity = api.posted[0]
    assert (day, section, food_id, quantity) == (TODAY, "breakfast", "yogurt-g", 183.0)


def test_a_unit_that_disagrees_with_the_food_is_refused_before_anything_is_written(api: FakeApi) -> None:
    """A food is priced in the unit it was recorded in, so '183 g' of a food priced per cup
    is not a small error — it is a number that means nothing."""
    reply = bot.handle("/log greek yogurt weighed 2 cups", api, today=TODAY)
    assert api.posted == []
    assert "recorded in g" in reply


def test_an_ambiguous_name_writes_nothing_and_asks(api: FakeApi) -> None:
    reply = bot.handle("/log greek yogurt 1 cup", api, today=TODAY)
    assert api.posted == []
    assert "more than one food" in reply


def test_an_unknown_food_says_where_to_add_it(api: FakeApi) -> None:
    reply = bot.handle("/log unobtainium 1 cup", api, today=TODAY)
    assert api.posted == []
    assert "no food called" in reply and "app first" in reply


def test_a_refusal_from_the_app_is_reported_and_nothing_is_claimed(api: FakeApi) -> None:
    api.post_fails = urllib.error.HTTPError("u", 409, "conflict", {}, None)  # type: ignore[arg-type]
    reply = bot.handle("/log oats 1 cup", api, today=TODAY)
    assert "refused" in reply and "Nothing was logged" in reply


def test_an_unreachable_app_is_reported_rather_than_raised() -> None:
    api = FakeApi()
    api.post_fails = OSError("connection refused")
    reply = bot.handle("/log oats 1 cup", api, today=TODAY)
    assert "could not reach the app" in reply


def test_free_text_gets_the_hint_not_a_guess(api: FakeApi) -> None:
    reply = bot.handle("I had two eggs and a coffee", api, today=TODAY)
    assert reply == bot.HELP_HINT
    assert api.posted == []


def test_help_lists_both_commands_and_the_vocabulary() -> None:
    text = bot.handle("/help", FakeApi(), today=TODAY)
    assert "/today" in text and "/log" in text
    for unit in UNITS:
        assert unit in text


# --- starting up ------------------------------------------------------------------------


def test_the_bot_refuses_to_start_without_a_token(monkeypatch: pytest.MonkeyPatch,
                                                  capsys: pytest.CaptureFixture) -> None:
    """A bot with no token has nothing to listen on. Returning non-zero with a reason beats
    a process that sits there looking healthy."""
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    assert bot.main() == 1
    assert "TELEGRAM_BOT_TOKEN is not set" in capsys.readouterr().err


def test_the_allowed_list_is_read_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_ALLOWED_USERS", " 8685521777 , 42 ,")
    assert bot.allowed_users() == {"8685521777", "42"}
    monkeypatch.setenv("TELEGRAM_ALLOWED_USERS", "")
    assert bot.allowed_users() == set()
