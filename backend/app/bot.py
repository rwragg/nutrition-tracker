"""The Telegram front end: a second client of this API, not a second implementation of it.

Two commands, one each way:

    /today                                  read the day back
    /log <food> <quantity> <unit> [section]  log a food into today

Everything the bot knows it asks the API for — it holds no records and computes no macros.
So a food edited in the web app moves the figures the bot reports, and the bot cannot
disagree with the app about anything, because it has no opinion to disagree with.

Deliberate limits, for the first cut:

- **No natural-language parsing.** Text that is not one of the two commands gets a one-line
  hint. Turning "a cup of rice and a banana" into entries needs a model or a grammar, and
  that decision (AI in or out) is not taken yet — see docs/PLAN.md, Part 9.
- **The targets are not here.** They live in one place, `frontend/lib/targets.ts` (R10), and
  the API returns sums rather than judgements. The bot therefore reports the day's figures
  and does not grade them against a target it would have to duplicate.
- **One user.** It signs in with the MVP credential, so every chat that is allowed to talk
  to it writes the same log. Per-user accounts are R3 and are not built.

Standard library only: long polling and the app's own API are both a handful of HTTP calls,
and a bot that needs no dependency is a bot the image already contains.
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date as calendar_date
from typing import Any, Protocol

from app.api import SECTIONS
from app.db import UNITS

API = os.environ.get("NUTRITION_API", "http://127.0.0.1:8000").rstrip("/")
TELEGRAM = "https://api.telegram.org"

# The account the bot signs in as. The seeded account's documented credential (R1) while the
# bot is one log for one person, which is D14 - and the thing R26 replaces, when a chat is bound
# to an account of its own. Overridable, so it does not have to be the seeded one.
ACCOUNT = (
    os.environ.get("NUTRITION_API_USER", "user"),
    os.environ.get("NUTRITION_API_PASSWORD", "password"),
)

# Where a /log with no section named lands. Snacks, because it is the section people log
# into most often and the one least likely to be wrong about what was eaten.
DEFAULT_SECTION = "snacks"


# --------------------------------------------------------------------------- parsing ---


def normalise(value: str) -> str:
    """A name reduced to words: case, punctuation and spacing thrown away.

    A food is stored as it was entered — "Greek yogurt, weighed" — and dictated without the
    comma. Matching on the raw string makes the comma load-bearing, so both sides are
    reduced to words before they are compared.
    """
    cleaned = re.sub(r"[^a-z0-9]+", " ", (value or "").lower())
    return " ".join(cleaned.split())


def as_unit(token: str) -> str | None:
    """The unit a token names, tolerating the plural a person types: cups -> cup."""
    lowered = token.strip().lower()
    if lowered in UNITS:
        return lowered
    if lowered.endswith("s") and lowered[:-1] in UNITS:
        return lowered[:-1]
    return None


def parse(text: str) -> tuple[str, dict]:
    """Turn a message into a command. Returns `(name, args)`.

    A command may arrive addressed to one bot in a group (`/today@some_bot`), so the
    @suffix is dropped. Anything unrecognised is `unknown` rather than an error: the
    caller decides what to say, and this function never raises on user input.
    """
    parts = (text or "").strip().split()
    if not parts:
        return "unknown", {}

    command = parts[0].split("@", 1)[0].lower()

    if command in ("/today", "/day"):
        return "today", {}
    if command in ("/help", "/start"):
        return "help", {}
    if command != "/log":
        return "unknown", {}

    # /log <food> <quantity> <unit> [section] — the food name may be several words, so the
    # unit and the quantity are read off the end and everything before them is the name.
    usage = "usage: /log <food> <quantity> <unit> [section]"
    rest = parts[1:]
    if len(rest) < 2:
        return "log", {"error": usage}

    section = DEFAULT_SECTION
    if len(rest) > 2 and rest[-1].lower() in SECTIONS:
        section = rest[-1].lower()
        rest = rest[:-1]

    unit = as_unit(rest[-1])
    quantity_raw = rest[-2]
    name = " ".join(rest[:-2]).strip()

    if unit is None:
        return "log", {"error": f"'{rest[-1]}' is not a unit I know. Try one of: {', '.join(UNITS)}."}
    try:
        quantity = float(quantity_raw)
    except ValueError:
        return "log", {"error": f"'{quantity_raw}' is not a quantity."}
    if quantity <= 0:
        return "log", {"error": "the quantity has to be greater than zero."}
    if not name:
        return "log", {"error": "which food?"}

    return "log", {"name": name, "quantity": quantity, "unit": unit, "section": section}


def find_food(name: str, foods: list[dict]) -> tuple[dict | None, list[dict]]:
    """Resolve a dictated name against the user's foods.

    Returns `(food, candidates)`: the food when exactly one matches, otherwise None with
    the candidates. Exact name first (case-insensitive), then substring, both on the
    normalised form. A name matching several foods yields none of them — the alternative is
    picking one, and a wrong food is written into the log as if it were eaten.
    """
    wanted = normalise(name)
    exact = [food for food in foods if normalise(food["name"]) == wanted]
    if len(exact) == 1:
        return exact[0], []
    if exact:
        return None, exact

    partial = [food for food in foods if wanted in normalise(food["name"])]
    if len(partial) == 1:
        return partial[0], []
    return None, partial


# ---------------------------------------------------------------------------- client ---

# What `handle` needs of a client, stated as a shape rather than a class: the tests drive
# the two commands against a stand-in, and a stub that satisfies this is as good as the
# real thing.
class Client(Protocol):
    def foods(self) -> list[dict]: ...
    def day(self, day: str) -> dict: ...
    def add_food_entry(self, day: str, section: str, food_id: str, quantity: float) -> dict: ...


class Api:
    """The app's API, with the session the app issues to any other client."""

    def __init__(self, base: str = API, timeout: int = 15) -> None:
        self.base = base.rstrip("/")
        self.timeout = timeout
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )

    def request(self, path: str, method: str = "GET", body: dict | None = None) -> Any:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(
            f"{self.base}{path}",
            data=data,
            method=method,
            headers={"Content-Type": "application/json"} if data else {},
        )
        with self.opener.open(request, timeout=self.timeout) as response:
            payload = response.read().decode()
        return json.loads(payload) if payload else {}

    def sign_in(self) -> None:
        username, password = ACCOUNT
        self.request("/api/login", "POST", {"username": username, "password": password})

    def foods(self) -> list[dict]:
        return self.request("/api/foods")

    def day(self, day: str) -> dict:
        return self.request(f"/api/days/{urllib.parse.quote(day)}")

    def add_food_entry(self, day: str, section: str, food_id: str, quantity: float) -> dict:
        return self.request(
            f"/api/days/{urllib.parse.quote(day)}/entries",
            "POST",
            {"section": section, "food_id": food_id, "quantity": quantity},
        )


# ---------------------------------------------------------------------------- replies ---


def macros_line(macros: dict) -> str:
    return (f"{round(macros['calories'])} kcal · {round(macros['protein'])} g protein · "
            f"{round(macros['carbs'])} g carbs · {round(macros['fat'])} g fat")


def format_day(payload: dict, foods: list[dict]) -> str:
    """The day, as text. Sums only — no target is applied here (see the module docstring)."""
    names = {food["id"]: food["name"] for food in foods}
    lines = [f"{payload['date']} — {macros_line(payload['macros'])}"]

    for section, entries in payload["sections"].items():
        if not entries:
            continue
        lines.append(f"\n{section.capitalize()} ({round(payload['sectionMacros'][section]['calories'])} kcal)")
        for entry in entries:
            if entry["kind"] == "food":
                lines.append(f"  · {names.get(entry['foodId'], entry['foodId'])} ×{entry['quantity']:g}")
            else:
                lines.append("  · a meal")

    if len(lines) == 1:
        lines.append("Nothing logged yet.")
    return "\n".join(lines)


def format_help() -> str:
    return (
        "I can do two things:\n\n"
        "/today — what is logged today\n"
        "/log <food> <quantity> <unit> [section] — log a food into today\n\n"
        "For example: /log rolled oats 40 g breakfast\n"
        f"units: {', '.join(UNITS)}\n"
        f"sections: {', '.join(SECTIONS)} (default {DEFAULT_SECTION})"
    )


HELP_HINT = "I only do /today and /log. Send /help to see how."


def handle(text: str, api: Client, today: str | None = None) -> str:
    """One message in, one reply out. Never raises: a bot that dies on a bad message is
    a bot that stops answering, and the failure would look like the app being down."""
    today = today or calendar_date.today().isoformat()
    name, args = parse(text)

    try:
        if name == "help":
            return format_help()
        if name == "unknown":
            return HELP_HINT
        if name == "today":
            return format_day(api.day(today), api.foods())

        # name == "log"
        if "error" in args:
            return args["error"]

        foods = api.foods()
        food, candidates = find_food(args["name"], foods)
        if food is None:
            if not candidates:
                return f"I have no food called '{args['name']}'. Add it in the app first."
            listed = "\n".join(f"  · {candidate['name']}" for candidate in candidates)
            return f"'{args['name']}' matches more than one food — say which:\n{listed}"
        if food["unit"] != args["unit"]:
            # Not a refusal: the app prices a food in the unit it was recorded in, so a
            # quantity in a different unit would be silently wrong by orders of magnitude.
            return (f"{food['name']} is recorded in {food['unit']}, not {args['unit']}. "
                    f"Try: /log {food['name']} <quantity> {food['unit']} {args['section']}")

        api.add_food_entry(today, args["section"], food["id"], args["quantity"])
    except urllib.error.HTTPError as error:
        return f"The app refused that ({error.code}). Nothing was logged."
    except OSError:
        return "I could not reach the app. Nothing was logged."

    day = api.day(today)
    entry = day["sectionMacros"][args["section"]]
    return (f"Logged {args['quantity']:g} {args['unit']} of {food['name']} to "
            f"{args['section']}.\n{args['section'].capitalize()} now {round(entry['calories'])} kcal · "
            f"{round(entry['protein'])} g protein.\n{today}: {macros_line(day['macros'])}")


# ---------------------------------------------------------------------- telegram loop ---


def send(token: str, chat_id: int, text: str) -> None:
    urllib.request.urlopen(
        f"{TELEGRAM}/bot{token}/sendMessage",
        data=urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode(),
        timeout=30,
    ).read()


def allowed_users() -> set[str]:
    return {user.strip() for user in os.environ.get("TELEGRAM_ALLOWED_USERS", "").split(",") if user.strip()}


def poll(token: str, api: Api) -> None:
    """Long polling, so the bot needs no public URL and no webhook to be reachable.

    Updates are acknowledged by offset. An id already handled is skipped rather than
    processed twice: a redelivered message would otherwise log the same food again, and a
    duplicated entry in a food log is indistinguishable from having eaten it twice.
    """
    allowed = allowed_users()
    handled: set[int] = set()
    offset = 0

    print(f"listening (app at {api.base}, {len(allowed)} allowed chat(s))", flush=True)
    while True:
        try:
            url = f"{TELEGRAM}/bot{token}/getUpdates?timeout=30&offset={offset}"
            with urllib.request.urlopen(url, timeout=60) as response:
                updates = json.load(response).get("result", [])
        except (urllib.error.URLError, OSError, json.JSONDecodeError) as error:
            print(f"poll failed: {error}", flush=True)
            time.sleep(5)
            continue

        for update in updates:
            offset = max(offset, update["update_id"] + 1)
            if update["update_id"] in handled:
                continue
            handled.add(update["update_id"])
            handled = set(sorted(handled)[-200:])

            message = update.get("message") or {}
            chat_id = (message.get("chat") or {}).get("id")
            text = message.get("text") or ""
            if chat_id is None or not text:
                continue
            if allowed and str(chat_id) not in allowed:
                send(token, chat_id, "This log is not yours. Ask Robert for access.")
                continue
            send(token, chat_id, handle(text, api))


def main() -> int:
    """Refuse to start without a token, and say so — silence would read as the app being
    down."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        print("TELEGRAM_BOT_TOKEN is not set; the bot has nothing to listen on.", file=sys.stderr)
        return 1

    api = Api()
    try:
        api.sign_in()
    except (urllib.error.URLError, OSError) as error:
        print(f"cannot reach the app at {api.base}: {error}", file=sys.stderr)
        return 1

    print(f"signed in to {api.base}", flush=True)
    poll(token, api)
    return 0


if __name__ == "__main__":
    sys.exit(main())
