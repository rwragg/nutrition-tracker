"""Looking a food up in USDA (D20, R32, R34, R35, R37).

USDA is never called here: `usda.fetch` is replaced, so every answer is one written out below. The
shapes are those USDA's search returns - captured from real answers while building this - and the
point of several tests is a thing a real answer did: energy under 957 instead of 208, baby food and
branded products ranked above plain food, the same food in two datasets.
"""

import urllib.error
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from people import approve
from app import usda
from app.main import app

SEED = {"username": "user", "password": "password"}


def nutrients(calories=None, protein=0.0, carbs=0.0, fat=0.0, *, energy_number="208") -> list[dict]:
    found = [
        {"nutrientNumber": "203", "value": protein, "unitName": "G"},
        {"nutrientNumber": "205", "value": carbs, "unitName": "G"},
        {"nutrientNumber": "204", "value": fat, "unitName": "G"},
    ]
    if calories is not None:
        found.append({"nutrientNumber": energy_number, "value": calories, "unitName": "KCAL"})
    return found


def usda_food(fdc_id: int, description: str, data_type="SR Legacy", **kwargs) -> dict:
    return {
        "fdcId": fdc_id,
        "description": description,
        "dataType": data_type,
        "foodNutrients": nutrients(**kwargs) if kwargs or "calories" in kwargs else nutrients(100),
    }


BROWN_RICE = [
    usda_food(1, "Brown rice, puffed", "Foundation", calories=377, protein=7.81, carbs=80.3, fat=2.76),
    usda_food(2, "Rice flour, brown", calories=363, protein=7.23, carbs=76.5, fat=2.78),
    usda_food(3, "Snacks, rice cakes, brown rice, plain", calories=387, protein=8.2, carbs=81.5, fat=2.8),
    usda_food(4, "Pork sausage rice links, brown and serve, cooked", calories=316, protein=14, carbs=2, fat=27),
    usda_food(5, "Babyfood, peas and brown rice", calories=60, protein=2, carbs=11, fat=0.5),
    usda_food(6, "Rice, brown, parboiled, cooked, UNCLE BENS", calories=123, protein=2.7, carbs=25, fat=1),
    usda_food(
        7, "Rice, brown, long-grain, cooked (Includes foods for USDA's Food Distribution Program)",
        calories=123, protein=2.74, carbs=25.6, fat=0.97,
    ),
    usda_food(8, "Rice, brown, long-grain, raw", "Foundation", calories=362, protein=7.5, carbs=76.2, fat=2.68),
]


@pytest.fixture(autouse=True)
def forget_answers() -> Iterator[None]:
    """The cache is process-wide, so one test's answer must not be another's."""
    usda.forget()
    yield
    usda.forget()


@pytest.fixture
def with_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(usda.KEY_ENV, "test-key-not-real")


def answer(monkeypatch: pytest.MonkeyPatch, foods: list[dict]) -> list[str]:
    """Make USDA answer with these foods, and return the list of queries it was asked."""
    asked: list[str] = []

    def fake(query: str, api_key: str) -> dict:
        asked.append(query)
        return {"foods": foods}

    monkeypatch.setattr(usda, "fetch", fake)
    return asked


# --- reading and ranking an answer ---------------------------------------------------------


def test_plain_cooked_rice_beats_flour_baby_food_snacks_and_brands() -> None:
    names = [shown["name"] for shown in usda.rank("brown rice", BROWN_RICE)]

    # the branded one and the baby food are not offered at all
    assert not any("UNCLE" in name or name.startswith(("Babyfood", "Snacks")) for name in names)
    # rice leads, not a product that merely contains rice
    assert names[0] in {"Rice, brown, long-grain, cooked", "Rice, brown, long-grain, raw"}
    assert names.index("Rice, brown, long-grain, cooked") < names.index("Rice flour, brown")
    assert names.index("Rice, brown, long-grain, cooked") < names.index("Pork sausage rice links, brown and serve, cooked")


def test_a_name_starting_with_the_thing_asked_for_beats_one_that_only_contains_it() -> None:
    foods = [usda_food(1, "Pork sausage rice links, cooked"), usda_food(2, "Rice, white, cooked")]

    assert [shown["name"] for shown in usda.rank("rice", foods)] == [
        "Rice, white, cooked",
        "Pork sausage rice links, cooked",
    ]


def test_usda_bookkeeping_is_dropped_from_the_name() -> None:
    [shown] = usda.rank(
        "rice", [usda_food(7, "Rice, brown, long-grain, cooked (Includes foods for USDA's Food Distribution Program)")]
    )
    assert shown["name"] == "Rice, brown, long-grain, cooked"


def test_the_same_name_in_two_datasets_is_offered_once_from_the_better_measured_one() -> None:
    foods = [
        usda_food(10, "Yogurt, Greek, plain, nonfat", "SR Legacy", calories=59),
        usda_food(11, "Yogurt, Greek, plain, nonfat", "Foundation", calories=61),
    ]

    [shown] = usda.rank("greek yogurt", foods)

    assert (shown["fdcId"], shown["dataType"]) == ("11", "Foundation")


def test_at_most_five_are_offered() -> None:
    foods = [usda_food(number, f"Rice, variety {number}", calories=100) for number in range(20)]
    assert len(usda.rank("rice", foods)) == usda.RESULTS == 5


# --- the gram basis (R34, D13) -------------------------------------------------------------


def test_figures_are_stored_per_gram_so_183_g_logs_183_times_them() -> None:
    [shown] = usda.rank("tempeh", [usda_food(174272, "Tempeh", calories=192, protein=20.3, carbs=7.64, fat=10.8)])

    assert shown["unit"] == "g"
    assert shown["per100g"] == {"calories": 192, "protein": 20.3, "carbs": 7.64, "fat": 10.8}
    assert shown["macros"]["calories"] == pytest.approx(1.92)
    assert 183 * shown["macros"]["calories"] == pytest.approx(351.36)
    assert 183 * shown["macros"]["protein"] == pytest.approx(0.203 * 183)


def test_energy_is_read_from_957_or_958_when_208_is_not_there() -> None:
    """Foundation foods often carry the Atwater energy under another number. Without this they would
    be silently dropped, and the best-measured food would be the one that never showed."""
    for number in ("957", "958"):
        [shown] = usda.rank("puffed rice", [usda_food(1, "Brown rice, puffed", "Foundation", calories=377, energy_number=number)])
        assert shown["per100g"]["calories"] == 377


def test_a_food_with_no_energy_is_not_offered() -> None:
    assert usda.rank("tempeh", [usda_food(1, "Tempeh", calories=None)]) == []


def test_a_missing_macro_reads_as_zero_not_as_a_missing_food() -> None:
    """Oils carry no carbohydrate entry in some records; that is zero, not a reason to hide the oil."""
    food = {"fdcId": 5, "description": "Oil, olive", "dataType": "SR Legacy",
            "foodNutrients": [{"nutrientNumber": "208", "value": 884, "unitName": "KCAL"},
                              {"nutrientNumber": "204", "value": 100, "unitName": "G"}]}

    [shown] = usda.rank("olive oil", [food])

    assert shown["per100g"] == {"calories": 884, "protein": 0.0, "carbs": 0.0, "fat": 100}


# --- the route -----------------------------------------------------------------------------


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def signed_in(client: TestClient) -> TestClient:
    assert client.post("/api/login", json=SEED).status_code == 200
    return client


def test_lookup_needs_a_signed_in_caller(client: TestClient, with_key: None) -> None:
    assert client.get("/api/lookup/foods", params={"q": "tempeh"}).status_code == 401


def test_lookup_returns_candidates_and_writes_nothing(
    signed_in: TestClient, with_key: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """R33: a lookup is a question. Whether to add the food is a separate act."""
    answer(monkeypatch, [usda_food(174272, "Tempeh", calories=192, protein=20.3, carbs=7.64, fat=10.8)])
    before = signed_in.get("/api/foods").json()

    response = signed_in.get("/api/lookup/foods", params={"q": "tempeh"})

    assert response.status_code == 200
    body = response.json()
    assert body["query"] == "tempeh"
    assert [shown["name"] for shown in body["results"]] == ["Tempeh"]
    assert body["results"][0]["fdcId"] == "174272"
    assert signed_in.get("/api/foods").json() == before


def test_lookup_says_it_is_not_configured_when_there_is_no_key(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv(usda.KEY_ENV, raising=False)
    asked = answer(monkeypatch, [])

    response = signed_in.get("/api/lookup/foods", params={"q": "tempeh"})

    assert response.status_code == 503
    assert response.json()["detail"] == "food lookup is not configured"
    assert asked == []  # and USDA was not called


def test_not_configured_does_not_spend_the_allowance(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.ratelimit import LOOKUPS_PER_MINUTE

    monkeypatch.delenv(usda.KEY_ENV, raising=False)
    for _ in range(LOOKUPS_PER_MINUTE.limit + 3):
        assert signed_in.get("/api/lookup/foods", params={"q": "tempeh"}).status_code == 503


@pytest.mark.parametrize("q", ["", "a", " ", "x" * 81])
def test_a_query_that_cannot_be_a_food_is_refused_before_usda_is_asked(
    signed_in: TestClient, with_key: None, monkeypatch: pytest.MonkeyPatch, q: str
) -> None:
    asked = answer(monkeypatch, [])

    assert signed_in.get("/api/lookup/foods", params={"q": q}).status_code == 422
    assert asked == []


def test_usda_failing_is_a_502_with_a_plain_sentence_and_the_rest_of_the_app_still_works(
    signed_in: TestClient, with_key: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """R37: USDA being down must never be the app being down."""

    def down(query: str, api_key: str) -> dict:
        raise usda.Unavailable("the food lookup service did not answer")

    monkeypatch.setattr(usda, "fetch", down)

    response = signed_in.get("/api/lookup/foods", params={"q": "tempeh"})

    assert response.status_code == 502
    assert response.json()["detail"] == "the food lookup service did not answer"
    assert signed_in.get("/api/foods").status_code == 200
    assert signed_in.get("/api/health").status_code == 200


@pytest.mark.parametrize(
    "failure",
    [
        urllib.error.URLError("timed out"),
        TimeoutError("timed out"),
        ConnectionResetError("reset"),
        ValueError("not json"),
    ],
)
def test_every_way_the_network_can_fail_becomes_unavailable(
    monkeypatch: pytest.MonkeyPatch, failure: Exception
) -> None:
    def broken(*args, **kwargs):
        raise failure

    monkeypatch.setattr(usda.urllib.request, "urlopen", broken)

    with pytest.raises(usda.Unavailable):
        usda.fetch("tempeh", "k")


def test_an_http_error_from_usda_says_the_status_and_never_the_key_or_the_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "a-very-secret-key"

    def refused(request, timeout=None):
        raise urllib.error.HTTPError(request.full_url, 429, "Too Many Requests", {}, None)  # type: ignore[arg-type]

    monkeypatch.setattr(usda.urllib.request, "urlopen", refused)

    with pytest.raises(usda.Unavailable) as raised:
        usda.fetch("tempeh", secret)

    assert "429" in str(raised.value)
    assert secret not in str(raised.value) and "api.nal.usda.gov" not in str(raised.value)


def test_the_key_travels_in_a_header_not_in_the_url(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = {}

    class Reply:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self, *args):
            return b'{"foods": []}'

    def capture(request, timeout=None):
        seen["url"], seen["headers"], seen["timeout"] = request.full_url, dict(request.header_items()), timeout
        return Reply()

    monkeypatch.setattr(usda.urllib.request, "urlopen", capture)

    usda.fetch("tempeh", "the-key")

    assert "the-key" not in seen["url"] and "api_key" not in seen["url"]
    assert seen["headers"]["X-api-key"] == "the-key"
    assert seen["timeout"] == usda.TIMEOUT_SECONDS <= 10  # short: a person is waiting
    assert "Foundation" in seen["url"] and "Branded" not in seen["url"]  # D22: generic foods only


def test_the_key_is_never_in_a_response(
    signed_in: TestClient, with_key: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    answer(monkeypatch, [usda_food(1, "Tempeh", calories=192)])

    response = signed_in.get("/api/lookup/foods", params={"q": "tempeh"})

    assert "test-key-not-real" not in response.text
    assert "test-key-not-real" not in signed_in.get("/").text


def test_an_account_has_a_per_minute_allowance(
    signed_in: TestClient, with_key: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.ratelimit import LOOKUPS_PER_MINUTE

    answer(monkeypatch, [usda_food(1, "Tempeh", calories=192)])

    for number in range(LOOKUPS_PER_MINUTE.limit):
        assert signed_in.get("/api/lookup/foods", params={"q": f"tempeh {number}"}).status_code == 200

    over = signed_in.get("/api/lookup/foods", params={"q": "one more"})
    assert over.status_code == 429
    assert "food lookups" in over.json()["detail"]


def test_an_account_has_a_daily_allowance(
    signed_in: TestClient, with_key: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.ratelimit import LOOKUPS_PER_DAY, LOOKUPS_PER_MINUTE

    answer(monkeypatch, [usda_food(1, "Tempeh", calories=192)])
    LOOKUPS_PER_DAY.limit = 3
    LOOKUPS_PER_MINUTE.limit = 1000
    try:
        for number in range(3):
            assert signed_in.get("/api/lookup/foods", params={"q": f"tempeh {number}"}).status_code == 200
        assert signed_in.get("/api/lookup/foods", params={"q": "tempeh again"}).status_code == 429
    finally:
        LOOKUPS_PER_DAY.limit = 100
        LOOKUPS_PER_MINUTE.limit = 10


def test_one_accounts_use_does_not_spend_anothers(
    client: TestClient, with_key: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.ratelimit import LOOKUPS_PER_MINUTE

    answer(monkeypatch, [usda_food(1, "Tempeh", calories=192)])
    client.post("/api/register", json={"username": "other", "email": "o@example.com", "password": "long-enough-1"})
    approve("other")

    client.post("/api/login", json=SEED)
    for number in range(LOOKUPS_PER_MINUTE.limit):
        client.get("/api/lookup/foods", params={"q": f"tempeh {number}"})
    assert client.get("/api/lookup/foods", params={"q": "tempeh x"}).status_code == 429

    client.post("/api/logout")
    client.post("/api/login", json={"username": "other", "password": "long-enough-1"})
    assert client.get("/api/lookup/foods", params={"q": "tempeh x"}).status_code == 200


def test_the_same_question_twice_asks_usda_once(
    signed_in: TestClient, with_key: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    asked = answer(monkeypatch, [usda_food(1, "Tempeh", calories=192)])

    signed_in.get("/api/lookup/foods", params={"q": "Tempeh"})
    signed_in.get("/api/lookup/foods", params={"q": "  tempeh "})

    assert asked == ["Tempeh"]


def test_a_lookup_that_failed_is_not_remembered(
    signed_in: TestClient, with_key: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = {"count": 0}

    def flaky(query: str, api_key: str) -> dict:
        calls["count"] += 1
        if calls["count"] == 1:
            raise usda.Unavailable("the food lookup service did not answer")
        return {"foods": [usda_food(1, "Tempeh", calories=192)]}

    monkeypatch.setattr(usda, "fetch", flaky)

    assert signed_in.get("/api/lookup/foods", params={"q": "tempeh"}).status_code == 502
    assert signed_in.get("/api/lookup/foods", params={"q": "tempeh"}).status_code == 200


def test_the_cache_does_not_grow_without_bound(with_key: None, monkeypatch: pytest.MonkeyPatch) -> None:
    answer(monkeypatch, [usda_food(1, "Tempeh", calories=192)])

    for number in range(usda.CACHE_LIMIT + 50):
        usda.search(f"food {number}")

    assert len(usda._cache) <= usda.CACHE_LIMIT
