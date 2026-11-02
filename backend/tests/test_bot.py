"""Tests for the Telegram front end (Part 9).

The bot is a second client of this API, so most of what can go wrong is not in the
network: it is a message parsed into the wrong arguments, a name resolved to the wrong
food, or a number reported that the app does not hold. Those are asserted here against a
stub client, and the commands are exercised end to end through `handle` — the only part that needs
a real app is `Api`, which the container test covers.
"""

from collections.abc import Iterator
from typing import get_args
import io
import json
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
    """Just enough of the client to run a message, recording what the bot asked for.

    Every method takes the chat id, because that is the shape of the real client (R26): there is no
    such thing as asking the app a question without saying which chat is asking.
    """

    def __init__(self, foods: list[dict] | None = None, day: dict | None = None,
                 meals: list[dict] | None = None, post_fails: Exception | None = None,
                 bind_fails: Exception | None = None) -> None:
        self._foods = FOODS if foods is None else foods
        self._meals = MEALS if meals is None else meals
        self._day = day or day_payload()
        self.post_fails = post_fails
        self.bind_fails = bind_fails
        self.posted: list[tuple] = []
        self.bound: list[tuple] = []
        self.asked_as: set[str] = set()

    def foods(self, chat_id: str) -> list[dict]:
        self.asked_as.add(chat_id)
        return self._foods

    def meals(self, chat_id: str) -> list[dict]:
        self.asked_as.add(chat_id)
        return self._meals

    def day(self, chat_id: str, day: str) -> dict:
        self.asked_as.add(chat_id)
        return self._day

    def add_food_entry(self, chat_id: str, day: str, section: str, food_id: str,
                       quantity: float) -> dict:
        self.asked_as.add(chat_id)
        if self.post_fails:
            raise self.post_fails
        self.posted.append((chat_id, day, section, food_id, quantity))
        return {"id": "new", "kind": "food", "foodId": food_id, "quantity": quantity}

    def bind(self, chat_id: str, code: str) -> dict:
        self.asked_as.add(chat_id)
        if self.bind_fails:
            raise self.bind_fails
        self.bound.append((chat_id, code))
        return {"id": "user-1", "username": "alice", "chat_id": chat_id}


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


# --- the commands, end to end, as one chat ----------------------------------------------

CHAT = "8685521777"


def test_today_asks_the_api_for_the_machine_s_date(api: FakeApi) -> None:
    reply = bot.handle("/today", api, CHAT, today=TODAY)
    assert "150 kcal" in reply


def test_every_question_says_which_chat_is_asking(api: FakeApi) -> None:
    """There is no anonymous question (R26): the app cannot decide whose log this is without it."""
    bot.handle("/today", api, CHAT, today=TODAY)

    assert api.asked_as == {CHAT}


def test_log_posts_the_entry_and_reports_the_new_figures(api: FakeApi) -> None:
    reply = bot.handle("/log oats 1 cup", api, CHAT, today=TODAY)
    assert api.posted == [(CHAT, TODAY, "snacks", "oats", 1.0)]
    assert "Logged" in reply and "kcal" in reply


def test_log_writes_the_day_it_was_given_and_the_section_it_was_told(api: FakeApi) -> None:
    bot.handle("/log greek yogurt weighed 183 g breakfast", api, CHAT, today=TODAY)
    _, day, section, food_id, quantity = api.posted[0]
    assert (day, section, food_id, quantity) == (TODAY, "breakfast", "yogurt-g", 183.0)


def test_a_unit_that_disagrees_with_the_food_is_refused_before_anything_is_written(api: FakeApi) -> None:
    """A food is priced in the unit it was recorded in, so '183 g' of a food priced per cup
    is not a small error — it is a number that means nothing."""
    reply = bot.handle("/log greek yogurt weighed 2 cups", api, CHAT, today=TODAY)
    assert api.posted == []
    assert "recorded in g" in reply


def test_an_ambiguous_name_writes_nothing_and_asks(api: FakeApi) -> None:
    reply = bot.handle("/log greek yogurt 1 cup", api, CHAT, today=TODAY)
    assert api.posted == []
    assert "more than one food" in reply


def test_an_unknown_food_says_where_to_add_it(api: FakeApi) -> None:
    reply = bot.handle("/log unobtainium 1 cup", api, CHAT, today=TODAY)
    assert api.posted == []
    assert "no food called" in reply and "app first" in reply


def test_a_refusal_from_the_app_is_reported_and_nothing_is_claimed(api: FakeApi) -> None:
    api.post_fails = urllib.error.HTTPError("u", 409, "conflict", {}, None)  # type: ignore[arg-type]
    reply = bot.handle("/log oats 1 cup", api, CHAT, today=TODAY)
    assert "Nothing was logged" in reply


def test_the_apps_own_sentence_is_used_when_it_gives_one(api: FakeApi) -> None:
    """The app knows why it refused; the bot does not. Guessing would replace a specific answer
    with a vague one."""
    body = io.BytesIO(json.dumps({"detail": "that code has already been used"}).encode())
    api.post_fails = urllib.error.HTTPError("u", 409, "conflict", {}, body)  # type: ignore[arg-type]

    reply = bot.handle("/log oats 1 cup", api, CHAT, today=TODAY)

    assert "already been used" in reply
    assert "Nothing was logged" in reply


def test_an_unreachable_app_is_reported_rather_than_raised() -> None:
    api = FakeApi()
    api.post_fails = OSError("connection refused")
    reply = bot.handle("/log oats 1 cup", api, CHAT, today=TODAY)
    assert "could not reach the app" in reply


def test_free_text_gets_the_hint_not_a_guess(api: FakeApi) -> None:
    reply = bot.handle("I had two eggs and a coffee", api, CHAT, today=TODAY)
    assert reply == bot.HELP_HINT
    assert api.posted == []


def test_help_lists_the_commands_and_the_vocabulary() -> None:
    text = bot.handle("/help", FakeApi(), CHAT, today=TODAY)
    assert "/today" in text and "/log" in text and "/bind" in text
    for unit in UNITS:
        assert unit in text


# --- the chat is not linked yet (R26) ----------------------------------------------------


def unbound() -> urllib.error.HTTPError:
    """What the app answers when a chat has not been bound: 403, from `auth.bound_user`."""
    body = io.BytesIO(json.dumps({"detail": "this chat is not linked to an account yet"}).encode())
    return urllib.error.HTTPError("u", 403, "forbidden", {}, body)  # type: ignore[arg-type]


def test_an_unlinked_chat_is_told_how_to_link_rather_than_what_it_asked_for() -> None:
    """The refusal is an instruction, not a dead end: the app's words for a 403 are about the caller,
    and the person needs to know what to do next."""
    api = FakeApi()
    api.post_fails = unbound()

    reply = bot.handle("/log oats 1 cup", api, CHAT, today=TODAY)

    assert reply == bot.LINK_INSTRUCTIONS
    assert api.posted == []


def test_an_unlinked_chat_cannot_read_the_day_either() -> None:
    """/today is the other way in, and a 403 there must not read as an empty day."""
    api = FakeApi()

    def refuse(chat_id: str, day: str) -> dict:
        raise unbound()

    api.day = refuse  # type: ignore[method-assign]

    reply = bot.handle("/today", api, CHAT, today=TODAY)

    assert reply == bot.LINK_INSTRUCTIONS
    assert "Nothing logged" not in reply


# --- /bind -------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text, expected",
    [
        ("/bind K7M2QP", "K7M2QP"),
        ("/bind k7m2qp", "K7M2QP"),
        ("/bind  K7 M2 QP ", "K7M2QP"),
        ("/link K7M2QP", "K7M2QP"),
    ],
)
def test_a_bind_message_yields_the_code_however_it_is_typed(text: str, expected: str) -> None:
    """Read off a screen and typed into a chat: case and stray spaces are certainties, not errors."""
    name, args = bot.parse(text)
    assert name == "bind"
    assert args == {"code": expected}


def test_bind_without_a_code_says_what_it_needs() -> None:
    name, args = bot.parse("/bind")
    assert name == "bind"
    assert "usage" in args["error"]


def test_binding_sends_the_code_as_this_chat(api: FakeApi) -> None:
    reply = bot.handle("/bind K7M2QP", api, CHAT)

    assert api.bound == [(CHAT, "K7M2QP")]
    assert "Linked" in reply and "alice" in reply


def test_a_code_that_does_not_work_is_explained_in_the_apps_words(api: FakeApi) -> None:
    body = io.BytesIO(json.dumps({"detail": "that code has expired — ask the app for a new one"}).encode())
    api.bind_fails = urllib.error.HTTPError("u", 409, "conflict", {}, body)  # type: ignore[arg-type]

    reply = bot.handle("/bind K7M2QP", api, CHAT)

    assert "expired" in reply


def test_bind_says_so_when_the_app_cannot_be_reached(api: FakeApi) -> None:
    api.bind_fails = OSError("connection refused")
    reply = bot.handle("/bind K7M2QP", api, CHAT)
    assert "could not reach the app" in reply


# --- starting up ------------------------------------------------------------------------


def test_the_bot_refuses_to_start_without_a_token(monkeypatch: pytest.MonkeyPatch,
                                                  capsys: pytest.CaptureFixture) -> None:
    """A bot with no token has nothing to listen on. Returning non-zero with a reason beats
    a process that sits there looking healthy."""
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    assert bot.main() == 1
    assert "TELEGRAM_BOT_TOKEN is not set" in capsys.readouterr().err


def test_the_bot_refuses_to_start_without_a_secret(monkeypatch: pytest.MonkeyPatch,
                                                   capsys: pytest.CaptureFixture) -> None:
    """R26: the bot acts for a chat, so without the secret it cannot be told whose log a chat is, and
    starting anyway would mean every chat being refused with no explanation."""
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "a-token")
    monkeypatch.delenv("TELEGRAM_BOT_SECRET", raising=False)

    assert bot.main() == 1
    assert "TELEGRAM_BOT_SECRET is not set" in capsys.readouterr().err


def test_the_preflight_reports_what_the_app_said(monkeypatch: pytest.MonkeyPatch) -> None:
    """A mismatched secret is otherwise invisible until someone tries to log something, and then it
    looks like their mistake."""

    class Failing:
        base = "http://nowhere:8000"

        def foods(self, chat_id: str):
            raise urllib.error.HTTPError("u", 401, "unauthorized", {}, None)  # type: ignore[arg-type]

    ok, message = bot.preflight(Failing())  # type: ignore[arg-type]

    assert ok is False
    assert "TELEGRAM_BOT_SECRET" in message


def test_the_preflight_accepts_an_unbound_chat_as_the_right_answer() -> None:
    """403 for chat "0" is exactly right: the secret was accepted and the chat has no log."""

    class Unbound:
        base = "http://nowhere:8000"

        def foods(self, chat_id: str):
            raise urllib.error.HTTPError("u", 403, "forbidden", {}, None)  # type: ignore[arg-type]

    ok, message = bot.preflight(Unbound())  # type: ignore[arg-type]

    assert ok is True
    assert "accepted the bot secret" in message


def test_the_allowed_list_is_read_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_ALLOWED_USERS", " 8685521777 , 42 ,")
    assert bot.allowed_users() == {"8685521777", "42"}
    monkeypatch.setenv("TELEGRAM_ALLOWED_USERS", "")
    assert bot.allowed_users() == set()
