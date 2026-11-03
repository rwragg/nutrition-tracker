"""Looking a food up in USDA FoodData Central (D20, R32).

The app asks USDA when a person names a food that is not in their list. This module is the whole of
that: build the request, reduce the answer to the few candidates worth showing, and turn USDA's
per-100 g figures into the gram basis the app stores (D13).

Three things it is careful about, because each was found by looking at real answers:

- **USDA's own ranking is poor for this.** "brown rice" returns rice flour and rice cakes before rice,
  and the legacy dataset is full of baby food and branded products. So it asks for a wide page and
  ranks it again here: the name must start with the thing asked for, plain "cooked" or "raw" forms
  win, and processed forms, baby food, snacks and branded names (written in capitals in the data) lose.
- **Energy is not always nutrient 208.** Foundation foods often carry 957 or 958 instead, so all three
  are read, in that order.
- **The key is never in a URL.** It goes in a header, so it cannot end up in a log line or an error
  message. Errors say what happened, not where it was sent.

Standard library only. The network call is one function, `fetch`, so tests replace it and never touch
USDA.
"""

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.nal.usda.gov/fdc/v1/foods/search"
KEY_ENV = "USDA_API_KEY"

# Generic foods only (D22). Branded is large, noisy, and often not the product meant.
DATA_TYPES = "Foundation,SR Legacy"

# Short, because a person is waiting on it, and USDA being slow must never hold anything else up (R37).
TIMEOUT_SECONDS = 5

# A wide page to rank from, and how many survive. Five rather than three: even re-ranked, the right
# food is sometimes fourth, and a person can read five short lines.
PAGE_SIZE = 50
RESULTS = 5

CACHE_SECONDS = 60 * 60
CACHE_LIMIT = 200


class NotConfigured(Exception):
    """There is no USDA key, so lookup cannot be offered. A state of the app, not a failure."""


class Unavailable(Exception):
    """USDA did not give a usable answer. Carries a sentence that is safe to show a person."""


def key() -> str:
    return os.environ.get(KEY_ENV, "").strip()


def fetch(query: str, api_key: str) -> dict:
    """USDA's search answer for this query. The only function here that touches the network."""
    url = API + "?" + urllib.parse.urlencode(
        {
            "query": query,
            "pageSize": PAGE_SIZE,
            "requireAllWords": "true",
            "dataType": DATA_TYPES,
        }
    )
    request = urllib.request.Request(url, headers={"X-Api-Key": api_key})

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Never the URL, never the headers: only what USDA said about the request.
        raise Unavailable(f"the food lookup service answered {error.code}") from None
    except (urllib.error.URLError, OSError, ValueError):
        raise Unavailable("the food lookup service did not answer") from None


# --- reading an answer -------------------------------------------------------------------

# Nutrient numbers. Energy has three because Foundation foods use 957 and 958 where SR Legacy uses 208.
ENERGY = ("208", "957", "958")
PROTEIN, CARBS, FAT = "203", "205", "204"

# Words that mark a processed or prepared form of the thing asked for. Not a taste: "brown rice" should
# find rice before it finds rice flour, and "chicken breast" should find chicken before breaded tenders.
PROCESSED = {
    "puffed", "flour", "breaded", "tender", "deli", "dehydrated", "powder", "chip", "mix",
    "instant", "sliced", "prepackaged", "flavor", "roll",
}
# Categories the legacy dataset files under a first word that is not a food.
NOT_A_FOOD_FIRST = ("babyfood", "snacks")


def words(text: str) -> list[str]:
    """Lower-case words, with a plural folded to its singular."""
    found = re.sub(r"[^a-z0-9]+", " ", text.lower()).split()
    return [word[:-1] if len(word) > 3 and word.endswith("s") and not word.endswith("ss") else word for word in found]


def clean(description: str) -> str:
    """The name without USDA's bookkeeping: "(Includes foods for USDA's Food Distribution Program)"."""
    return " ".join(re.sub(r"\s*\([^)]*\)", "", description).split())


def is_branded(description: str) -> bool:
    """A brand is written in capitals in this data: "Yogurt, Greek, plain, CHOBANI"."""
    return any(re.fullmatch(r"[A-Z][A-Z'&.]{3,}", word) for word in re.split(r"[ ,]+", description))


def score(query: str, food: dict) -> float | None:
    """How good a candidate this is for what was asked, or None to drop it."""
    description = clean(food.get("description", ""))
    if not description or is_branded(food.get("description", "")):
        return None

    wanted = words(query)
    segments = [segment.strip() for segment in description.split(",")]
    head = words(segments[0])
    rest = [word for segment in segments[1:] for word in words(segment)]
    present = set(words(description))

    total = sum(3 for word in wanted if word in head)
    total += sum(1 for word in wanted if word in rest and word not in head)
    if head and head[0] in wanted:
        total += 2  # "Rice, brown" and "Brown rice" start with the thing; "Pork sausage rice links" does not
    total -= 0.5 * (len(segments) - 1)  # plain names are short
    if segments[0].lower().startswith(NOT_A_FOOD_FIRST):
        total -= 5
    if present & {"cooked", "raw"}:
        total += 1
    if present & PROCESSED:
        total -= 4  # enough to put rice ahead of puffed rice even when the puffed name matches word for word
    if food.get("dataType") == "Foundation":
        total += 0.25  # the better-measured dataset, when two are otherwise equal

    return total


def per_100g(food: dict) -> dict[str, float] | None:
    """Calories, protein, carbs and fat per 100 g, or None when energy is missing."""
    values: dict[str, float] = {}
    for nutrient in food.get("foodNutrients", []):
        number = str(nutrient.get("nutrientNumber", ""))
        value = nutrient.get("value")
        if isinstance(value, (int, float)) and number not in values:
            values[number] = float(value)

    energy = next((values[number] for number in ENERGY if number in values), None)
    if energy is None:
        return None

    return {
        "calories": energy,
        "protein": values.get(PROTEIN, 0.0),
        "carbs": values.get(CARBS, 0.0),
        "fat": values.get(FAT, 0.0),
    }


def candidate(food: dict) -> dict | None:
    """One result in the shape the app uses, with the gram-basis figures worked out here."""
    per100 = per_100g(food)
    if per100 is None or any(value < 0 for value in per100.values()):
        return None

    return {
        "fdcId": str(food["fdcId"]),
        "name": clean(food["description"]),
        "dataType": food.get("dataType", ""),
        "unit": "g",
        "per100g": {key: round(value, 2) for key, value in per100.items()},
        # D13: per gram, so 183 g logs 183 times this. Six places keeps the arithmetic exact enough.
        "macros": {key: round(value / 100, 6) for key, value in per100.items()},
    }


def rank(query: str, foods: list[dict]) -> list[dict]:
    """The candidates worth showing, best first, with duplicates (the same name in two datasets) merged."""
    best: dict[str, tuple[float, dict]] = {}

    for food in foods:
        points = score(query, food)
        shown = candidate(food) if points is not None else None
        if shown is None or points is None:
            continue
        if shown["name"] not in best or points > best[shown["name"]][0]:
            best[shown["name"]] = (points, shown)

    ordered = sorted(best.values(), key=lambda pair: (-pair[0], len(pair[1]["name"]), pair[1]["name"]))
    return [shown for _, shown in ordered[:RESULTS]]


# --- asking ------------------------------------------------------------------------------

_cache: dict[str, tuple[float, list[dict]]] = {}


def search(query: str) -> list[dict]:
    """Candidates for a food name. Raises NotConfigured without a key, Unavailable when USDA fails.

    Remembered for an hour per query, so a person trying "tempeh" twice, or two people trying it, cost
    USDA one request. USDA's limit is generous (3,600 an hour per key) and this keeps it that way.
    """
    api_key = key()
    if not api_key:
        raise NotConfigured("food lookup is not configured")

    cache_key = " ".join(words(query))
    cached = _cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < CACHE_SECONDS:
        return cached[1]

    results = rank(query, fetch(query, api_key).get("foods", []))

    if len(_cache) >= CACHE_LIMIT:
        _cache.pop(next(iter(_cache)))
    _cache[cache_key] = (time.monotonic(), results)
    return results


def forget() -> None:
    """Empty the cache. For tests, which must not see each other's answers."""
    _cache.clear()
