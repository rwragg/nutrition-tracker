"""Linking a chat to an account (R26, D18).

The property under test is the one R26 names: **a chat is bound to exactly one account, and until it
is bound it can reach nothing.** So most of these turn on what an *unbound* chat cannot do, and on the
two ways a code can go wrong (spent, or expired) — because a pairing code that keeps working is a
pairing code somebody else can use.

The bot is a caller, not a browser: no session, a shared secret, and a header naming the chat. These
tests call the same routes with and without that header, so the two doors are shown to be one lock.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app import db, telegram
from app.auth import BOT_CHAT_HEADER, BOT_SECRET_HEADER
from app.main import app
from app.profile import SET_UP_FIRST
from people import approve, give_profile

SECRET = "a-bot-secret-for-tests"

ALICE = {"username": "alice", "email": "alice@example.com", "password": "correct-horse-battery"}
BOB = {"username": "bob", "email": "bob@example.com", "password": "bob-is-not-alice"}
SEED = {"username": "user", "password": "password"}


@pytest.fixture(autouse=True)
def bot_secret(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """The app and the caller share a secret, as they do in a deployment."""
    monkeypatch.setenv("TELEGRAM_BOT_SECRET", SECRET)
    yield


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def as_bot(chat_id: str, *, secret: str | None = SECRET) -> dict[str, str]:
    """The headers the bot sends: which chat it speaks for, and proof it is the bot."""
    headers = {BOT_CHAT_HEADER: chat_id}
    if secret is not None:
        headers[BOT_SECRET_HEADER] = secret
    return headers


def signed_in(client: TestClient, who: dict) -> None:
    approve(who["username"])
    assert client.post("/api/login", json={"username": who["username"], "password": who["password"]}).status_code == 200


def register(client: TestClient, who: dict) -> None:
    assert client.post("/api/register", json=who).status_code == 201


def code_for(client: TestClient, who: dict = SEED) -> str:
    signed_in(client, who)
    response = client.post("/api/telegram/code")
    assert response.status_code == 201, response.text
    return response.json()["code"]


def bind(client: TestClient, chat_id: str, code: str, *, secret: str | None = SECRET):
    return client.post(
        "/api/telegram/bind", json={"code": code, "chat_id": chat_id}, headers=as_bot(chat_id, secret=secret)
    )


# --- the code ---------------------------------------------------------------------------


def test_a_code_can_only_be_asked_for_by_someone_signed_in(client: TestClient) -> None:
    assert client.post("/api/telegram/code").status_code == 401


def test_a_code_is_six_characters_from_the_unambiguous_alphabet(client: TestClient) -> None:
    """No I, L, O, 0 or 1: a code is read off a screen and typed into a chat."""
    code = code_for(client)

    assert len(code) == telegram.CODE_LENGTH
    assert set(code) <= set(telegram.CODE_ALPHABET)
    assert not set(code) & set("ILO01")


def test_a_code_expires_about_fifteen_minutes_out(client: TestClient) -> None:
    signed_in(client, SEED)
    body = client.post("/api/telegram/code").json()

    minted = body["expires"]
    assert minted.endswith("Z")
    assert body["code"] not in minted

    from datetime import datetime, timezone

    expires = datetime.strptime(minted, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    lifetime = expires - datetime.now(timezone.utc).replace(microsecond=0)
    assert abs(lifetime - telegram.CODE_LIFETIME) < telegram.CODE_LIFETIME


def test_asking_for_a_second_code_retires_the_first(client: TestClient) -> None:
    """Two live codes would be two chances to bind, and someone asking for a second code is asking
    for the first to stop working."""
    first = code_for(client)
    second = code_for(client)

    assert first != second
    assert bind(client, "111", first).status_code == 404  # it is gone, not merely unused
    assert bind(client, "111", second).status_code == 200


def test_a_code_is_case_and_space_insensitive_when_redeemed(client: TestClient) -> None:
    code = code_for(client)

    response = bind(client, "111", f" {code.lower()} ")

    assert response.status_code == 200, response.text


# --- who may redeem ---------------------------------------------------------------------


def test_a_binding_must_come_from_the_bot(client: TestClient) -> None:
    code = code_for(client)

    assert bind(client, "111", code, secret=None).status_code == 401
    assert bind(client, "111", code, secret="not-the-secret").status_code == 401


def test_without_a_configured_secret_the_app_says_so_rather_than_refusing_the_caller(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A missing configuration is not the caller's fault, and answering 401 would invent a caller
    problem out of an operator one."""
    monkeypatch.delenv("TELEGRAM_BOT_SECRET")
    code = code_for(client)

    response = bind(client, "111", code)

    assert response.status_code == 503
    assert "TELEGRAM_BOT_SECRET" in response.json()["detail"]


@pytest.mark.parametrize("code", ["AAAAAA", "ZZZZZZ"])
def test_an_unknown_code_is_not_found(client: TestClient, code: str) -> None:
    assert bind(client, "111", code).status_code == 404


# --- binding ----------------------------------------------------------------------------


def test_a_code_binds_the_chat_to_the_account_that_asked_for_it(client: TestClient) -> None:
    code = code_for(client, SEED)

    response = bind(client, "1234567890", code)

    assert response.status_code == 200, response.text
    assert response.json() == {"id": "user", "username": "user", "chat_id": "1234567890"}

    connection = db.connect()
    try:
        stored = connection.execute("SELECT telegram_id FROM users WHERE id = 'user'").fetchone()
    finally:
        connection.close()
    assert stored["telegram_id"] == "1234567890"


def test_a_code_works_once(client: TestClient) -> None:
    code = code_for(client)
    assert bind(client, "111", code).status_code == 200

    again = bind(client, "222", code)

    assert again.status_code == 409
    assert "already been used" in again.json()["detail"]


def test_an_expired_code_is_refused(client: TestClient) -> None:
    """Says "expired" rather than "no such code": the person did not mistype, they left it on
    screen."""
    code = code_for(client)

    connection = db.connect()
    try:
        with connection:
            connection.execute(
                "UPDATE telegram_codes SET expires = '2020-01-01T00:00:00Z' WHERE code = ?", (code,)
            )
    finally:
        connection.close()

    response = bind(client, "111", code)

    assert response.status_code == 409
    assert "expired" in response.json()["detail"]


def test_a_chat_cannot_be_bound_to_two_accounts(client: TestClient) -> None:
    register(client, ALICE)
    register(client, BOB)
    alice_code = code_for(client, ALICE)
    assert bind(client, "111", alice_code).status_code == 200

    bob_code = code_for(client, BOB)
    response = bind(client, "111", bob_code)

    assert response.status_code == 409
    assert "already linked to another account" in response.json()["detail"]


def test_an_account_cannot_be_bound_to_two_chats(client: TestClient) -> None:
    first = code_for(client, SEED)
    assert bind(client, "111", first).status_code == 200

    second = code_for(client, SEED)
    response = bind(client, "222", second)

    assert response.status_code == 409
    assert "already linked to another chat" in response.json()["detail"]


def test_rebinding_the_same_chat_to_the_same_account_is_allowed(client: TestClient) -> None:
    """Not a conflict: nothing changes, and refusing would mean a chat could never be re-linked after
    the person asked for a fresh code."""
    first = code_for(client, SEED)
    assert bind(client, "111", first).status_code == 200

    second = code_for(client, SEED)
    assert bind(client, "111", second).status_code == 200


def test_the_app_can_say_whether_this_account_is_linked(client: TestClient) -> None:
    signed_in(client, SEED)
    assert client.get("/api/telegram/link").json() == {"telegram_id": None}

    assert bind(client, "111", code_for(client, SEED)).status_code == 200
    signed_in(client, SEED)
    assert client.get("/api/telegram/link").json() == {"telegram_id": "111"}


def test_the_link_can_be_removed(client: TestClient) -> None:
    signed_in(client, SEED)
    code = client.post("/api/telegram/code").json()["code"]
    assert bind(client, "111", code).status_code == 200

    assert client.delete("/api/telegram/link").status_code == 204
    assert client.get("/api/telegram/link").json() == {"telegram_id": None}

    # and the chat is a stranger to the app again - checked signed out, because a live session is
    # the stronger claim and would answer for the request (see `auth.current_user`)
    client.post("/api/logout")
    assert client.get("/api/foods", headers=as_bot("111")).status_code == 403


# --- the bot's door into the nutrition routes -------------------------------------------


def test_an_unbound_chat_reaches_nothing(client: TestClient) -> None:
    """R26's first clause. Every route the bot uses, not just one, because each is a door."""
    headers = as_bot("999")

    assert client.get("/api/foods", headers=headers).status_code == 403
    assert client.get("/api/meals", headers=headers).status_code == 403
    assert client.get("/api/days/2026-11-02", headers=headers).status_code == 403
    assert client.get("/api/days", headers=headers).status_code == 403
    assert client.post(
        "/api/days/2026-11-02/entries",
        json={"section": "lunch", "food_id": "oats", "quantity": 1},
        headers=headers,
    ).status_code == 403


def test_a_bound_chat_logs_into_that_accounts_day(client: TestClient) -> None:
    """R26's second clause: once bound, /log writes into that account's day."""
    seed_code = code_for(client, SEED)
    give_profile(client)  # R54: an account with no profile cannot add anything, by the bot or the browser
    bind(client, "111", seed_code)
    client.post("/api/logout")  # the bot has no session; neither should this test

    headers = as_bot("111")
    foods = {food["name"]: food["id"] for food in client.get("/api/foods", headers=headers).json()}
    oats = foods["Rolled oats, dry"]

    before = client.get("/api/days/2026-11-02", headers=headers).json()["sectionMacros"]["lunch"]

    created = client.post(
        "/api/days/2026-11-02/entries",
        json={"section": "lunch", "food_id": oats, "quantity": 2},
        headers=headers,
    )

    assert created.status_code == 201, created.text

    # the section total, before and after: the seed already has a lunch on this day, so the claim
    # worth making is the difference the bot's write made, not the absolute figure
    after = client.get("/api/days/2026-11-02", headers=headers).json()["sectionMacros"]["lunch"]
    assert after["calories"] - before["calories"] == 600          # two cups of oats at 300
    assert after["protein"] - before["protein"] == 20             # and 10 g each


def test_a_bound_chat_cannot_see_another_accounts_log(client: TestClient) -> None:
    """The heart of it: the bot is trusted, the chat is not. Two bound chats, two logs."""
    register(client, ALICE)
    bind(client, "111", code_for(client, SEED))
    alice_code = code_for(client, ALICE)
    give_profile(client)  # alice may add things, so the refusal below is about whose food it is, not a missing profile
    bind(client, "222", alice_code)
    client.post("/api/logout")

    seeded = client.get("/api/foods", headers=as_bot("111")).json()
    alices = client.get("/api/foods", headers=as_bot("222")).json()

    assert len(seeded) == 31
    assert alices == []

    # and the empty one cannot be filled from the full one: alice's chat cannot use the seed's food
    oats = next(food["id"] for food in seeded)
    response = client.post(
        "/api/days/2026-11-02/entries",
        json={"section": "lunch", "food_id": oats, "quantity": 1},
        headers=as_bot("222"),
    )
    assert response.status_code == 404


def test_the_bots_door_needs_the_secret_as_well_as_the_chat(client: TestClient) -> None:
    bind(client, "111", code_for(client, SEED))
    # signed out, or the session answers for the request instead of the chat header
    client.post("/api/logout")

    assert client.get("/api/foods", headers={BOT_CHAT_HEADER: "111"}).status_code == 401
    assert client.get("/api/foods", headers=as_bot("111", secret="wrong")).status_code == 401
    assert client.get("/api/foods", headers=as_bot("111")).status_code == 200


def test_a_browser_cannot_reach_the_nutrition_routes_by_claiming_to_be_a_chat(client: TestClient) -> None:
    """The header is not a login: without the secret it buys nothing, and with it the caller is the
    bot by definition."""
    bind(client, "111", code_for(client, SEED))
    client.post("/api/logout")

    assert client.get("/api/foods", headers={BOT_CHAT_HEADER: "111"}).status_code == 401


# --- guessing a code, and two binds at once ------------------------------------------------


def test_failed_attempts_to_redeem_a_code_are_limited_per_chat(client: TestClient) -> None:
    from app.ratelimit import BIND_FAILURES

    for _ in range(BIND_FAILURES.limit):
        assert bind(client, "777", "AAAAAA").status_code == 404

    assert bind(client, "777", "AAAAAA").status_code == 429

    # Another chat is not held up by this one's guessing.
    assert bind(client, "888", "AAAAAA").status_code == 404


def test_a_good_code_clears_the_failures_for_its_chat(client: TestClient) -> None:
    from app.ratelimit import BIND_FAILURES

    for _ in range(BIND_FAILURES.limit - 1):
        bind(client, "777", "AAAAAA")
    code = code_for(client)

    assert bind(client, "777", code).status_code == 200
    assert not BIND_FAILURES.blocked("777")


def test_losing_a_race_to_bind_a_chat_is_a_409_not_a_server_error(client: TestClient) -> None:
    """Two binds to one chat can both pass the up-front checks, and the unique index then decides. The
    loser used to get an unhandled IntegrityError. A trigger stands in for the other bind landing in
    between: it makes the UPDATE fail the way the unique index would."""
    code = code_for(client)
    connection = db.connect()
    try:
        with connection:
            connection.execute(
                "CREATE TRIGGER lost_the_race BEFORE UPDATE OF telegram_id ON users "
                "BEGIN SELECT RAISE(ABORT, 'UNIQUE constraint failed: users.telegram_id'); END"
            )
    finally:
        connection.close()

    response = bind(client, "999", code)

    assert response.status_code == 409
    assert "already linked" in response.json()["detail"]


def test_a_bound_chat_of_an_account_with_no_profile_can_read_but_not_add_and_still_cannot_see_a_profile(client: TestClient) -> None:
    """R54 through the door the bot uses. The gate asks only whether a profile exists, so the bot is refused in
    the app's own words (a 409, not the 403 it reads as "this chat is not linked") and learns nothing else (R53)."""
    bind(client, "111", code_for(client, SEED))
    client.post("/api/logout")
    headers = as_bot("111")

    foods = client.get("/api/foods", headers=headers)
    assert foods.status_code == 200  # reading is not gated

    refused = client.post(
        "/api/days/2026-11-02/entries",
        json={"section": "lunch", "food_id": foods.json()[0]["id"], "quantity": 1},
        headers=headers,
    )
    assert refused.status_code == 409
    assert refused.json()["detail"] == SET_UP_FIRST

    assert client.get("/api/profile", headers=headers).status_code == 401  # and it still cannot read one
