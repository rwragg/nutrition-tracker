"""The Telegram front end: a second client of this API, not a second implementation of it.

Three commands:

    /bind <code>                             link this chat to an account
    /today                                   read the day back
    /log <food> <quantity> <unit> [section]   log a food into today

Everything the bot knows it asks the API for — it holds no records and computes no macros.
So a food edited in the web app moves the figures the bot reports, and the bot cannot
disagree with the app about anything, because it has no opinion to disagree with.

**It speaks for a chat, not for an account** (R26). Each request names the chat it is answering and
carries a secret that proves it is the bot; the app decides which account that chat has been linked
to, and answers 403 until it has been. So a chat that was never linked can read nothing and write
nothing, and two linked chats cannot see each other's log. `/bind` is how a chat stops being a
stranger: the person is shown a code in the app and sends it here.

Deliberate limits, for this cut:

- **No natural-language parsing.** Text that is not one of the commands gets a one-line hint.
  Turning "a cup of rice and a banana" into entries needs a model or a grammar, and that decision
  (AI in or out) is not taken yet — see docs/PLAN.md, D15.
- **The targets are not here.** They live in one place, `frontend/lib/targets.ts` (R10), and
  the API returns sums rather than judgements. The bot therefore reports the day's figures
  and does not grade them against a target it would have to duplicate.
- **Voice is not here.** A voice note is not text, so it is ignored rather than guessed at; that is
  step 3 of Part 10, gated on D16.

Standard library only: long polling and the app's own API are both a handful of HTTP calls,
and a bot that needs no dependency is a bot the image already contains.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date as calendar_date
from http import HTTPStatus
from typing import Any, Protocol

from app.api import SECTIONS
from app.db import UNITS

API = os.environ.get("NUTRITION_API", "http://127.0.0.1:8000").rstrip("/")
TELEGRAM = "https://api.telegram.org"

# The bot's own identity (R26). It holds a secret rather than a password because there is nobody
# there to type one: it speaks for whichever chat it is answering, and the app decides which account
# that chat is - 403 until the chat has been bound with a code from the app.
BOT_SECRET = os.environ.get("TELEGRAM_BOT_SECRET", "").strip()
BOT_SECRET_HEADER = "X-Bot-Secret"
BOT_CHAT_HEADER = "X-Telegram-Chat"

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
    if command in ("/bind", "/link"):
        code = " ".join(parts[1:]).strip().upper().replace(" ", "")
        if not code:
            return "bind", {"error": "usage: /bind <code> — the app shows you one"}
        return "bind", {"code": code}
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

# What `handle` needs of a client, stated as a shape rather than a class: the tests drive the
# commands against a stand-in, and a stub that satisfies this is as good as the real thing.
# Every method takes a chat id, because that is the real client's shape (R26).
class Client(Protocol):
    """What `handle` needs: the API, understood as one particular chat."""

    def foods(self, chat_id: str) -> list[dict]: ...
    def meals(self, chat_id: str) -> list[dict]: ...
    def day(self, chat_id: str, day: str) -> dict: ...
    def add_food_entry(self, chat_id: str, day: str, section: str, food_id: str,
                       quantity: float) -> dict: ...
    def bind(self, chat_id: str, code: str) -> dict: ...


class Api:
    """The app's API, seen as whichever chat is asking.

    No sign-in: the bot has no password to sign in with, and no business holding one. Every request
    carries the bot's secret and the chat it is speaking for, and the app decides which account that
    is (R26) - or answers 403, which is the bot's cue to tell the person how to link.
    """

    def __init__(self, base: str = API, secret: str = BOT_SECRET, timeout: int = 15) -> None:
        self.base = base.rstrip("/")
        self.secret = secret
        self.timeout = timeout

    def request(self, path: str, chat_id: str, method: str = "GET", body: dict | None = None) -> Any:
        data = json.dumps(body).encode() if body is not None else None
        headers = {
            BOT_SECRET_HEADER: self.secret,
            BOT_CHAT_HEADER: str(chat_id),
        }
        if data:
            headers["Content-Type"] = "application/json"

        request = urllib.request.Request(
            f"{self.base}{path}", data=data, method=method, headers=headers
        )
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            payload = response.read().decode()
        return json.loads(payload) if payload else {}

    def foods(self, chat_id: str) -> list[dict]:
        return self.request("/api/foods", chat_id)

    def meals(self, chat_id: str) -> list[dict]:
        return self.request("/api/meals", chat_id)

    def day(self, chat_id: str, day: str) -> dict:
        return self.request(f"/api/days/{urllib.parse.quote(day)}", chat_id)

    def add_food_entry(self, chat_id: str, day: str, section: str, food_id: str,
                       quantity: float) -> dict:
        return self.request(
            f"/api/days/{urllib.parse.quote(day)}/entries",
            chat_id,
            "POST",
            {"section": section, "food_id": food_id, "quantity": quantity},
        )

    def bind(self, chat_id: str, code: str) -> dict:
        return self.request("/api/telegram/bind", chat_id, "POST",
                            {"code": code, "chat_id": str(chat_id)})


# ---------------------------------------------------------------------------- replies ---


def macros_line(macros: dict) -> str:
    return (f"{round(macros['calories'])} kcal · {round(macros['protein'])} g protein · "
            f"{round(macros['carbs'])} g carbs · {round(macros['fat'])} g fat")


def format_day(payload: dict, foods: list[dict], meals: list[dict]) -> str:
    """The day, as text. Sums only — no target is applied here (see the module docstring).

    A meal is named, not just counted: "a meal" in a log read back is indistinguishable from every
    other meal, and the whole point of reading the day back is recognising it.
    """
    names = {food["id"]: food["name"] for food in foods}
    meal_names = {meal["id"]: meal["name"] for meal in meals}
    lines = [f"{payload['date']} — {macros_line(payload['macros'])}"]

    for section, entries in payload["sections"].items():
        if not entries:
            continue
        lines.append(f"\n{section.capitalize()} ({round(payload['sectionMacros'][section]['calories'])} kcal)")
        for entry in entries:
            if entry["kind"] == "food":
                lines.append(f"  · {names.get(entry['foodId'], entry['foodId'])} ×{entry['quantity']:g}")
            else:
                lines.append(f"  · {meal_names.get(entry.get('mealId'), 'a meal')}")

    if len(lines) == 1:
        lines.append("Nothing logged yet.")
    return "\n".join(lines)


def format_help() -> str:
    return (
        "I can do two things with the day, once this chat is linked to your account:\n\n"
        "/today — what is logged today\n"
        "/log <food> <quantity> <unit> [section] — log a food into today\n\n"
        "For example: /log rolled oats 40 g breakfast\n"
        f"units: {', '.join(UNITS)}\n"
        f"sections: {', '.join(SECTIONS)} (default {DEFAULT_SECTION})\n\n"
        "Not linked yet? In the app, press Telegram in the header: it gives you a code, and "
        "/bind <code> here does the rest."
    )


HELP_HINT = "I only do /today, /log and /bind. Send /help to see how."

LINK_INSTRUCTIONS = (
    "This chat is not linked to an account yet.\n"
    "In the app, press Telegram in the header — it shows a code — then send me /bind <code>."
)


def app_refusal(error: urllib.error.HTTPError, suffix: str = "") -> str:
    """What to say about a refusal from the app.

    The app's own sentence is used when it has one, because it knows why ("no such code", "that code
    has expired", "this chat is already linked to another account") and this module does not. A 403 is
    the one case with something better to say: it is not a refusal of the command but of the caller,
    and the useful reply is how to stop being in that position.
    """
    if error.code == HTTPStatus.FORBIDDEN:
        return LINK_INSTRUCTIONS

    try:
        detail = json.loads(error.read().decode()).get("detail")
    except (OSError, ValueError, AttributeError):
        detail = None

    message = detail if isinstance(detail, str) and detail else f"the app refused that ({error.code})"
    return f"{message}{suffix}"


def handle(text: str, api: Client, chat_id: str, today: str | None = None) -> str:
    """One message in, one reply out, as one chat. Never raises: a bot that dies on a bad message is
    a bot that stops answering, and the failure would look like the app being down."""
    today = today or calendar_date.today().isoformat()
    name, args = parse(text)

    if name == "help":
        return format_help()
    if name == "unknown":
        return HELP_HINT
    if name == "bind":
        if "error" in args:
            return args["error"]
        try:
            account = api.bind(chat_id, args["code"])
        except urllib.error.HTTPError as error:
            return app_refusal(error)
        except (OSError, ValueError):
            return "I could not reach the app, so nothing was linked."
        return (f"Linked. This chat is {account['username']}'s log now — "
                f"/today to read it back, /log to add to it.")

    try:
        if name == "today":
            return format_day(api.day(chat_id, today), api.foods(chat_id), api.meals(chat_id))

        # name == "log"
        if "error" in args:
            return args["error"]

        foods = api.foods(chat_id)
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

        api.add_food_entry(chat_id, today, args["section"], food["id"], args["quantity"])
    except urllib.error.HTTPError as error:
        return app_refusal(error, ". Nothing was logged.")
    except (OSError, ValueError):
        # ValueError is a body that was not JSON: a proxy's error page, say. Not the person's mistake
        # and not worth dying over.
        return "I could not reach the app. Nothing was logged."

    # The entry is written. Reading the day back is only to report it, so if that fails the person is
    # told the truth - it was logged - instead of the bot dying with the write already done.
    try:
        day = api.day(chat_id, today)
    except (urllib.error.HTTPError, OSError, ValueError):
        return (f"Logged {args['quantity']:g} {args['unit']} of {food['name']} to {args['section']}, "
                "but I could not read the day back to give you the totals.")

    entry = day["sectionMacros"][args["section"]]
    return (f"Logged {args['quantity']:g} {args['unit']} of {food['name']} to "
            f"{args['section']}.\n{args['section'].capitalize()} now {round(entry['calories'])} kcal · "
            f"{round(entry['protein'])} g protein.\n{today}: {macros_line(day['macros'])}")


# ---------------------------------------------------------------------- telegram loop ---


# Telegram refuses a message over 4096 characters; a long /today could reach it.
MESSAGE_LIMIT = 4096


def send(token: str, chat_id: int, text: str) -> None:
    for start in range(0, max(len(text), 1), MESSAGE_LIMIT):
        urllib.request.urlopen(
            f"{TELEGRAM}/bot{token}/sendMessage",
            data=urllib.parse.urlencode(
                {"chat_id": chat_id, "text": text[start:start + MESSAGE_LIMIT]}
            ).encode(),
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

            try:
                answer_update(token, api, allowed, update)
            except Exception as error:  # noqa: BLE001 - one bad update must not stop the bot
                # A user who blocked the bot, a network blip on send, a reply Telegram refused: none
                # of these is a reason to stop answering everyone else. The update is already
                # marked handled above, so it is not retried into the same failure.
                print(f"update {update.get('update_id')} failed: {type(error).__name__}: {error}", flush=True)


def answer_update(token: str, api: Api, allowed: set[str], update: dict) -> None:
    """Reply to one update. Anything it raises is the caller's to log."""
    message = update.get("message") or {}
    chat_id = (message.get("chat") or {}).get("id")
    text = message.get("text") or ""
    if chat_id is None or not text:
        return
    if allowed and str(chat_id) not in allowed:
        send(token, chat_id, "This log is not yours.")
        return
    send(token, chat_id, handle(text, api, str(chat_id)))


def preflight(api: Api) -> tuple[bool, str]:
    """Ask the app one question whose answer proves the two sides agree about the secret.

    Chat id "0" is not a real chat, so the three possible answers are all informative: 403 means the
    secret was accepted and the chat is simply not bound (which is correct), 401 means the app did not
    accept the secret, and 503 means the app has no secret at all. Without this, a mismatched secret is
    invisible until somebody tries to log something, and then it looks like their own mistake.
    """
    try:
        api.foods("0")
    except urllib.error.HTTPError as error:
        if error.code == HTTPStatus.FORBIDDEN:
            return True, "the app accepted the bot secret"
        if error.code == HTTPStatus.UNAUTHORIZED:
            return False, "the app did not accept TELEGRAM_BOT_SECRET - the two sides disagree"
        if error.code == HTTPStatus.SERVICE_UNAVAILABLE:
            return False, "the app has no TELEGRAM_BOT_SECRET set, so no chat can be bound"
        return False, f"the app answered {error.code} to the bot - unexpected"
    except OSError as error:
        return False, f"cannot reach the app at {api.base}: {error}"

    # A 200 means the app treated an unbound chat as somebody's log, which it must never do.
    return False, "the app answered the bot as if chat 0 had a log - refusing to run"


def main() -> int:
    """Refuse to start without what it needs, and say why — silence reads as the app being down."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        print("TELEGRAM_BOT_TOKEN is not set; the bot has nothing to listen on.", file=sys.stderr)
        return 1

    if not BOT_SECRET:
        print(
            "TELEGRAM_BOT_SECRET is not set. The bot acts for a chat, not for a single account, so "
            "without a secret it cannot be told which log a chat is (R26).",
            file=sys.stderr,
        )
        return 1

    api = Api()
    ok, message = preflight(api)
    print(f"  {message}", file=sys.stdout if ok else sys.stderr, flush=True)
    if not ok:
        return 1

    poll(token, api)
    return 0


if __name__ == "__main__":
    sys.exit(main())
