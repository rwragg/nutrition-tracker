"""Accounts and isolation (R24, R25).

R2 has said "a signed-in user sees only their own data" since the beginning, and until now it
had never been tested against a second user, because there had only ever been one. Every test
here exists because of that gap: two accounts, and the assertions that neither can see or
change the other's log.

The seeded account is a third party in these tests on purpose - it holds 31 foods and 17
entries, so "a new account's day is empty" is a claim with something to be empty *of*.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
from app.passwords import hash_password, verify_password

SEED_CREDENTIALS = {"username": "user", "password": "password"}

ALICE = {
    "username": "alice",
    "email": "alice@example.com",
    "password": "correct-horse-battery",
}
BOB = {
    "username": "bob",
    "email": "bob@example.com",
    "password": "bob-is-not-alice",
}


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A fresh client per test, so a session cookie never leaks between them."""
    with TestClient(app) as test_client:
        yield test_client


def register(client: TestClient, who: dict) -> dict:
    response = client.post("/api/register", json=who)
    assert response.status_code == 201, response.text
    return response.json()


def signed_in(who: dict) -> TestClient:
    """A client of its own, signed in as one account (or as the seeded one)."""
    client = TestClient(app)
    client.__enter__()
    response = client.post("/api/login", json={"username": who["username"], "password": who["password"]})
    assert response.status_code == 200, response.text
    return client


@pytest.fixture
def alice_and_bob(client: TestClient) -> Iterator[tuple[TestClient, TestClient]]:
    """Two accounts, each with its own client, each holding something the other must not reach."""
    register(client, ALICE)
    register(client, BOB)

    alice = signed_in(ALICE)
    bob = signed_in(BOB)
    try:
        yield alice, bob
    finally:
        alice.__exit__(None, None, None)
        bob.__exit__(None, None, None)


# --- R24: an account can be made ---------------------------------------------------------


def test_a_new_account_is_created_and_can_sign_in(client: TestClient) -> None:
    created = register(client, ALICE)

    assert created["username"] == "alice"
    assert created["email"] == "alice@example.com"
    assert created["id"].startswith("user-")

    # no hash, and nothing else, comes back
    assert set(created) == {"id", "username", "email"}

    assert client.post(
        "/api/login", json={"username": "alice", "password": "correct-horse-battery"}
    ).status_code == 200


def test_two_accounts_can_both_be_made(client: TestClient) -> None:
    """The check R24 asks for: two registrations through the API alone, and a session each."""
    register(client, ALICE)
    register(client, BOB)

    for who in (ALICE, BOB):
        response = client.post(
            "/api/login", json={"username": who["username"], "password": who["password"]}
        )
        assert response.status_code == 200
        assert client.get("/api/session").json()["username"] == who["username"]
        client.post("/api/logout")


def test_the_seeded_account_still_signs_in_with_the_documented_credential(client: TestClient) -> None:
    """R1 is superseded, not broken: the app still opens with user / password."""
    assert client.post("/api/login", json=SEED_CREDENTIALS).status_code == 200
    assert client.get("/api/session").json()["username"] == "user"


def test_a_wrong_password_and_an_unknown_username_are_refused_the_same_way(client: TestClient) -> None:
    """The API does not tell a stranger which usernames exist."""
    register(client, ALICE)

    wrong_password = client.post("/api/login", json={"username": "alice", "password": "nope"})
    unknown_user = client.post("/api/login", json={"username": "nobody", "password": "nope"})

    assert wrong_password.status_code == unknown_user.status_code == 401
    assert wrong_password.json() == unknown_user.json()


@pytest.mark.parametrize(
    "who, field",
    [
        (dict(BOB, username="user"), "username"),          # the seeded account's name
        (dict(BOB, email=ALICE["email"]), "email"),
    ],
)
def test_a_second_account_cannot_reuse_a_username_or_email(
    client: TestClient, who: dict, field: str
) -> None:
    """One field collides at a time, so the refusal has to name the one that did."""
    register(client, ALICE)

    response = client.post("/api/register", json=who)

    assert response.status_code == 409
    assert response.json()["detail"] == f"that {field} is already registered"


def test_registration_cannot_claim_a_chat(client: TestClient) -> None:
    """A chat is bound by redeeming a code, never by typing its id into a form.

    Before this, registering with someone else's telegram id handed the attacker that person's chat:
    the bot served the attacker's log to them, and their own /bind was refused as "already linked".
    A telegram id in the body is now ignored, the chat is left unbound, and the real owner can link it.
    """
    created = client.post("/api/register", json={**ALICE, "telegram_id": "555111"})
    assert created.status_code == 201

    connection = db.connect()
    try:
        stored = connection.execute(
            "SELECT telegram_id FROM users WHERE username = 'alice'"
        ).fetchone()
    finally:
        connection.close()
    assert stored["telegram_id"] is None

    client.post("/api/login", json={"username": "alice", "password": ALICE["password"]})
    assert client.get("/api/telegram/link").json() == {"telegram_id": None}


@pytest.mark.parametrize(
    "who",
    [
        dict(ALICE, username="al ice"),
        dict(ALICE, username="ab"),
        dict(ALICE, email="alice.example.com"),
        dict(ALICE, email="alice@localhost"),
        dict(ALICE, password="short"),
    ],
)
def test_a_registration_that_is_not_well_formed_is_refused(client: TestClient, who: dict) -> None:
    assert client.post("/api/register", json=who).status_code == 422


def test_nothing_is_created_when_a_registration_is_refused(client: TestClient) -> None:
    register(client, ALICE)

    client.post("/api/register", json=ALICE)  # same username: refused

    connection = db.connect()
    try:
        assert connection.execute("SELECT count(*) AS n FROM users").fetchone()["n"] == 2
    finally:
        connection.close()


# --- R25: two accounts cannot see or touch each other's log ------------------------------


def test_a_new_account_starts_with_no_log_of_its_own(alice_and_bob: tuple[TestClient, TestClient]) -> None:
    """Not the seed's log with someone else's name on it: nothing at all."""
    alice, _ = alice_and_bob

    assert alice.get("/api/foods").json() == []
    assert alice.get("/api/meals").json() == []
    assert alice.get("/api/days").json() == []

    day = alice.get("/api/days/2026-11-02").json()
    assert day["macros"] == {"calories": 0, "protein": 0, "carbs": 0, "fat": 0}
    assert all(entries == [] for entries in day["sections"].values())


def test_the_seeded_log_belongs_to_the_seeded_account_only(alice_and_bob: tuple[TestClient, TestClient]) -> None:
    """31 foods and 17 entries exist in the file; a new account sees none of them."""
    alice, _ = alice_and_bob

    assert len(alice.get("/api/foods").json()) == 0

    seeded = signed_in(SEED_CREDENTIALS)
    try:
        assert len(seeded.get("/api/foods").json()) == 31
    finally:
        seeded.__exit__(None, None, None)


def test_one_account_cannot_read_another_s_day(alice_and_bob: tuple[TestClient, TestClient]) -> None:
    alice, bob = alice_and_bob

    alice.post("/api/days/2026-11-01/entries", json={"section": "lunch", "food_id": _food(alice), "quantity": 2})

    assert bob.get("/api/days/2026-11-01").json()["macros"]["calories"] == 0
    assert bob.get("/api/days").json() == []


def test_one_account_cannot_read_or_change_another_s_food(alice_and_bob: tuple[TestClient, TestClient]) -> None:
    alice, bob = alice_and_bob
    food_id = _food(alice)

    # not in the list, so not readable at all, and the by-id routes refuse as if it did not exist
    assert bob.get("/api/foods").json() == []

    assert bob.put(
        f"/api/foods/{food_id}",
        json={"name": "Taken", "unit": "cup", "calories": 1, "protein": 1, "carbs": 1, "fat": 1},
    ).status_code == 404
    assert bob.delete(f"/api/foods/{food_id}").status_code == 404

    # and it is still alice's food, unchanged
    assert {food["id"]: food["name"] for food in alice.get("/api/foods").json()} == {
        food_id: "Alice's oats"
    }


def test_one_account_cannot_log_an_entry_against_another_s_food(alice_and_bob: tuple[TestClient, TestClient]) -> None:
    """The id is the only thing needed to try this, and it must not work."""
    alice, bob = alice_and_bob
    food_id = _food(alice)

    response = bob.post(
        "/api/days/2026-11-02/entries", json={"section": "lunch", "food_id": food_id, "quantity": 1}
    )

    assert response.status_code == 404
    assert bob.get("/api/days/2026-11-02").json()["macros"]["calories"] == 0
    assert alice.get("/api/days/2026-11-02").json()["macros"]["calories"] == 0


def test_one_account_cannot_delete_another_s_entry(alice_and_bob: tuple[TestClient, TestClient]) -> None:
    alice, bob = alice_and_bob
    food_id = _food(alice)
    entry = alice.post(
        "/api/days/2026-11-02/entries", json={"section": "lunch", "food_id": food_id, "quantity": 2}
    ).json()

    before = alice.get("/api/days/2026-11-02").json()["macros"]

    assert bob.delete(f"/api/days/2026-11-02/entries/{entry['id']}").status_code == 404

    assert alice.get("/api/days/2026-11-02").json()["macros"] == before


def test_one_account_cannot_read_or_change_another_s_meal(alice_and_bob: tuple[TestClient, TestClient]) -> None:
    alice, bob = alice_and_bob
    food_id = _food(alice)
    meal = alice.post("/api/meals", json={"name": "Alice's lunch", "ingredients": [{"food_id": food_id, "quantity": 1}]}).json()

    assert meal["id"] not in [candidate["id"] for candidate in bob.get("/api/meals").json()]
    assert bob.delete(f"/api/meals/{meal['id']}").status_code == 404
    assert bob.post(
        f"/api/days/2026-11-02/entries", json={"section": "lunch", "meal_id": meal["id"]}
    ).status_code == 404


def test_a_day_list_holds_only_the_signed_in_account_s_days(alice_and_bob: tuple[TestClient, TestClient]) -> None:
    alice, bob = alice_and_bob
    food_id = _food(alice)
    alice.post("/api/days/2026-10-20/entries", json={"section": "lunch", "food_id": food_id, "quantity": 1})

    assert [day["date"] for day in alice.get("/api/days").json()] == ["2026-10-20"]
    assert bob.get("/api/days").json() == []


def test_deleting_a_food_another_account_still_uses_is_not_possible(
    alice_and_bob: tuple[TestClient, TestClient]
) -> None:
    """Bob's refusal must be 'no such food', not 'it is in use': the second would confirm a
    record exists in a log he cannot see."""
    alice, bob = alice_and_bob
    food_id = _food(alice)
    alice.post("/api/days/2026-11-02/entries", json={"section": "lunch", "food_id": food_id, "quantity": 1})

    response = bob.delete(f"/api/foods/{food_id}")

    assert response.status_code == 404
    assert food_id not in response.text


def test_signing_out_ends_the_session(client: TestClient) -> None:
    register(client, ALICE)
    signed_in(ALICE)

    assert client.post("/api/logout").status_code == 200
    assert client.get("/api/session").status_code == 401
    assert client.get("/api/foods").status_code == 401


def _food(client: TestClient) -> str:
    """A food owned by this client, so the tests above have something of each account's own."""
    response = client.post(
        "/api/foods",
        json={"name": "Alice's oats", "unit": "g", "calories": 3.8, "protein": 0.13, "carbs": 0.67, "fat": 0.07},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


# --- the password itself ------------------------------------------------------------------


def test_a_password_is_stored_only_as_a_hash(client: TestClient) -> None:
    register(client, ALICE)

    connection = db.connect()
    try:
        stored = connection.execute(
            "SELECT password_hash FROM users WHERE username = 'alice'"
        ).fetchone()["password_hash"]
    finally:
        connection.close()

    assert "correct-horse-battery" not in stored
    assert stored.startswith("pbkdf2_sha256$")
    assert verify_password("correct-horse-battery", stored)
    assert not verify_password("correct-horse-battery ", stored)


def test_a_hash_is_never_returned_by_a_route(client: TestClient) -> None:
    register(client, ALICE)
    signed_in(ALICE)

    for response in (client.get("/api/session"), client.post("/api/login", json={"username": "alice", "password": "correct-horse-battery"})):
        assert "pbkdf2" not in response.text
        assert "password" not in response.text


@pytest.mark.parametrize(
    "stored",
    [None, "", "nonsense", "pbkdf2_sha256$200000$nothex$alsonothex", "pbkdf2_sha256$0$aa$bb", "md5$1$aa$bb"],
)
def test_a_missing_or_malformed_hash_fails_closed(stored: str | None) -> None:
    assert verify_password("password", stored) is False


def test_the_same_password_hashes_differently_each_time() -> None:
    """A salt per account, so two people who chose the same password are not visibly the same
    row, and one table of hashes is not a list of shared passwords."""
    assert hash_password("password") != hash_password("password")


# --- a stranger cannot read which usernames exist, or how fast to try ----------------------


def test_an_unknown_username_costs_a_password_hash_like_a_wrong_password(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Answering an unknown username without hashing made it about ten times faster than a wrong
    password, which is a way to read which usernames exist. Both now do the same work."""
    from app import auth

    checked: list[str] = []
    real = auth.verify_password

    def counting(password: str, stored: str | None) -> bool:
        checked.append(password)
        return real(password, stored)

    monkeypatch.setattr(auth, "verify_password", counting)

    client.post("/api/login", json={"username": "user", "password": "wrong-one"})
    client.post("/api/login", json={"username": "nobody", "password": "wrong-two"})

    assert checked == ["wrong-one", "wrong-two"]


def test_the_dummy_hash_never_matches_a_password(client: TestClient) -> None:
    from app.passwords import DUMMY_HASH

    assert not verify_password("password", DUMMY_HASH)
    assert not verify_password("", DUMMY_HASH)


def test_an_old_hash_is_upgraded_when_its_owner_signs_in(client: TestClient) -> None:
    """The stored value carries its own iteration count, so raising the constant invalidates nothing;
    this is how the old hashes catch up, at the one moment the password is in hand."""
    from app.passwords import ITERATIONS, needs_rehash

    old = hash_password("password", iterations=1_000)
    connection = db.connect()
    try:
        with connection:
            connection.execute("UPDATE users SET password_hash = ? WHERE id = 'user'", (old,))
    finally:
        connection.close()
    assert needs_rehash(old)

    assert client.post("/api/login", json=SEED_CREDENTIALS).status_code == 200

    connection = db.connect()
    try:
        stored = connection.execute("SELECT password_hash FROM users WHERE id = 'user'").fetchone()[0]
    finally:
        connection.close()
    assert stored != old
    assert stored.split("$")[1] == str(ITERATIONS)
    assert verify_password("password", stored)


def test_a_wrong_password_does_not_upgrade_or_change_the_hash(client: TestClient) -> None:
    old = hash_password("password", iterations=1_000)
    connection = db.connect()
    try:
        with connection:
            connection.execute("UPDATE users SET password_hash = ? WHERE id = 'user'", (old,))
    finally:
        connection.close()

    assert client.post("/api/login", json={"username": "user", "password": "wrong"}).status_code == 401

    connection = db.connect()
    try:
        assert connection.execute("SELECT password_hash FROM users WHERE id = 'user'").fetchone()[0] == old
    finally:
        connection.close()


@pytest.mark.parametrize(
    "stored, expected",
    [(None, False), ("", False), ("md5$1$aa$bb", False), ("pbkdf2_sha256$x$aa$bb", False),
     ("pbkdf2_sha256$1000$aa$bb", True)],
)
def test_which_stored_values_want_upgrading(stored: str | None, expected: bool) -> None:
    from app.passwords import needs_rehash

    assert needs_rehash(stored) is expected


def test_the_current_cost_is_not_upgraded_again() -> None:
    from app.passwords import needs_rehash

    assert not needs_rehash(hash_password("anything"))


def test_repeated_wrong_passwords_for_one_username_are_stopped(client: TestClient) -> None:
    from app.ratelimit import LOGIN_FAILURES_BY_USER

    for _ in range(LOGIN_FAILURES_BY_USER.limit):
        assert client.post("/api/login", json={"username": "user", "password": "no"}).status_code == 401

    blocked = client.post("/api/login", json={"username": "user", "password": "no"})
    assert blocked.status_code == 429

    # Blocked even for the right password: the point is that guessing cannot be tried at speed.
    assert client.post("/api/login", json=SEED_CREDENTIALS).status_code == 429


def test_a_successful_sign_in_clears_the_count_for_that_username(client: TestClient) -> None:
    from app.ratelimit import LOGIN_FAILURES_BY_USER

    for _ in range(LOGIN_FAILURES_BY_USER.limit - 1):
        client.post("/api/login", json={"username": "user", "password": "no"})
    assert client.post("/api/login", json=SEED_CREDENTIALS).status_code == 200

    for _ in range(LOGIN_FAILURES_BY_USER.limit - 1):
        assert client.post("/api/login", json={"username": "user", "password": "no"}).status_code == 401


def test_one_address_cannot_walk_through_many_usernames(client: TestClient) -> None:
    from app.ratelimit import LOGIN_FAILURES_BY_ADDRESS

    for number in range(LOGIN_FAILURES_BY_ADDRESS.limit):
        client.post("/api/login", json={"username": f"nobody-{number}", "password": "no"})

    assert client.post("/api/login", json={"username": "another", "password": "no"}).status_code == 429


def test_registrations_are_limited_per_address(client: TestClient) -> None:
    from app.ratelimit import REGISTRATIONS

    for number in range(REGISTRATIONS.limit):
        who = {"username": f"person{number}", "email": f"p{number}@example.com", "password": "long-enough-1"}
        assert client.post("/api/register", json=who).status_code == 201

    over = {"username": "onemore", "email": "more@example.com", "password": "long-enough-1"}
    assert client.post("/api/register", json=over).status_code == 429


def test_the_limiter_forgets_attempts_outside_its_window(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import ratelimit

    now = [1000.0]
    monkeypatch.setattr(ratelimit.time, "monotonic", lambda: now[0])
    limiter = ratelimit.Limiter(limit=2, window=60, what="things")

    limiter.check("k")
    limiter.check("k")
    assert limiter.blocked("k")

    now[0] += 61
    assert not limiter.blocked("k")
    limiter.check("k")
