"""Approving who may use the app (Part 14 step 1, R65 to R70).

The properties under test are the ones the plan names, and most of them are about what a person who is *not* approved can
and cannot do:

- a registration is `pending` and cannot sign in, whatever the request says about itself (R65, R66);
- the refusal is specific only to someone who knew the password, so it tells a guesser nothing (R66);
- switching an account off ends the sessions it already has, on the next request, and silences its bound chat (R66);
- no web route changes a status, so a signed-in account cannot approve itself or anyone (R67);
- the admin is told once, in a line that is safe to paste, and no secret is in it (R68).
"""

import json
import os
import shlex
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import admin, db, notices
from app.auth import BOT_CHAT_HEADER, BOT_SECRET_HEADER
from app.main import app

SECRET = "a-bot-secret-for-tests"
ALICE = {"username": "alice", "email": "alice@example.com", "password": "correct-horse-battery"}
BOB = {"username": "bob", "email": "bob@example.com", "password": "bob-is-not-alice"}
SEED = {"username": "user", "password": "password"}
BOT = {BOT_SECRET_HEADER: SECRET}

WAITING = "Your account is waiting for approval."
DISABLED = "This account has been disabled."


@pytest.fixture(autouse=True)
def bot_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_SECRET", SECRET)


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def register(client: TestClient, who: dict = ALICE, **extra: object) -> dict:
    response = client.post("/api/register", json={**who, **extra})
    assert response.status_code == 201, response.text
    return response.json()


def sign_in(client: TestClient, who: dict = ALICE):
    return client.post("/api/login", json={"username": who["username"], "password": who["password"]})


def status_of(username: str) -> str:
    connection = db.connect()
    try:
        return connection.execute("SELECT status FROM users WHERE username = ?", (username,)).fetchone()[0]
    finally:
        connection.close()


def change(action: str, username: str) -> str:
    connection = db.connect()
    try:
        return admin.change(connection, action, username)
    finally:
        connection.close()


# --- R65 / R66: a registration waits, and cannot get in ------------------------------------------------------------


def test_a_new_registration_is_pending(client: TestClient) -> None:
    assert register(client)["status"] == "pending"
    assert status_of("alice") == "pending"


def test_a_registration_cannot_approve_itself_by_saying_so(client: TestClient) -> None:
    """The body is untrusted. A field that names the status, or anything like it, must change nothing."""
    register(client, status="approved", role="admin", approved=True, is_admin=True)

    assert status_of("alice") == "pending"
    assert sign_in(client).status_code == 403


def test_the_right_password_is_refused_with_a_sentence_until_approved(client: TestClient) -> None:
    register(client)

    refused = sign_in(client)
    assert refused.status_code == 403
    assert refused.json()["detail"] == WAITING
    assert client.get("/api/session").status_code == 401  # no session was made

    change("approve", "alice")
    assert sign_in(client).status_code == 200
    assert client.get("/api/session").json()["username"] == "alice"


def test_a_wrong_password_for_a_pending_account_is_the_same_answer_as_for_no_account(client: TestClient) -> None:
    """The waiting sentence is only said to someone who knew the password. A guesser learns nothing about the account."""
    register(client)

    wrong = client.post("/api/login", json={"username": "alice", "password": "not-the-password"})
    missing = client.post("/api/login", json={"username": "nobody", "password": "not-the-password"})

    assert wrong.status_code == missing.status_code == 401
    assert wrong.json() == missing.json()
    assert WAITING not in wrong.text


def test_a_disabled_account_is_refused_with_its_own_sentence(client: TestClient) -> None:
    register(client)
    change("approve", "alice")
    change("disable", "alice")

    refused = sign_in(client)
    assert refused.status_code == 403
    assert refused.json()["detail"] == DISABLED


def test_switching_an_account_off_ends_a_session_that_is_already_open(client: TestClient) -> None:
    """The check is on every request, not at sign-in, so it does not wait for the cookie to expire.

    The first request after the switch gets the reason and the session is cleared; any later one is simply signed out.
    So each route is tried on its own freshly signed-in session."""
    register(client)
    change("approve", "alice")

    for path in ("/api/session", "/api/days", "/api/foods", "/api/meals", "/api/profile", "/api/telegram/link"):
        assert sign_in(client).status_code == 200, path
        assert client.get("/api/days").status_code == 200  # in, and working
        change("disable", "alice")

        response = client.get(path)
        assert response.status_code == 401, path
        assert response.json()["detail"] == DISABLED, path

        assert client.get("/api/session").json()["detail"] == "Not signed in"  # the session was cleared, not just refused
        change("enable", "alice")
        assert client.get("/api/session").status_code == 401  # switching it back on does not revive the old session


def test_a_disabled_accounts_bound_chat_is_told_why_and_not_to_link_again(client: TestClient) -> None:
    """The bot reads a 403 as 'this chat is not linked' and says how to link. That would be wrong here, so it is a 409."""
    register(client)
    change("approve", "alice")
    sign_in(client)
    code = client.post("/api/telegram/code").json()["code"]
    assert client.post("/api/telegram/bind", json={"code": code, "chat_id": "424242"}, headers=BOT).status_code == 200

    # the bot is its own caller: no cookie, a secret, and a header naming the chat (it never shares the browser's session)
    chat = {**BOT, BOT_CHAT_HEADER: "424242"}
    with TestClient(app) as the_bot:
        assert the_bot.get("/api/days", headers=chat).status_code == 200

        change("disable", "alice")

        response = the_bot.get("/api/days", headers=chat)
        assert response.status_code == 409
        assert response.json()["detail"] == DISABLED

        change("enable", "alice")
        assert the_bot.get("/api/days", headers=chat).status_code == 200  # nothing about the link was lost


# --- R67: only the console changes a status ------------------------------------------------------------------------


def test_no_route_in_the_app_can_change_a_status(client: TestClient) -> None:
    """Read from the route table, so a route added later is caught too."""
    changing = [
        (method, path)
        for path, operations in app.openapi()["paths"].items()
        for method in operations
        if method in {"post", "put", "patch", "delete"}
    ]
    words = ("approve", "reject", "enable", "disable", "status", "admin", "user")
    suspect = [(m, p) for m, p in changing if any(word in p.lower() for word in words)]
    assert suspect == [], f"a route that could change who may sign in: {suspect}"


def test_a_signed_in_account_cannot_reach_another_accounts_status(client: TestClient) -> None:
    register(client, BOB)
    assert client.post("/api/login", json=SEED).status_code == 200

    for method, path in (("put", "/api/users/bob"), ("patch", "/api/users/bob"), ("post", "/api/users/bob/approve"),
                         ("post", "/api/admin/approve"), ("patch", "/api/session")):
        response = client.request(method, path, json={"status": "approved"})
        assert response.status_code in {404, 405}, (method, path, response.status_code)
    assert status_of("bob") == "pending"


# --- R68: the admin is told, once, safely --------------------------------------------------------------------------


def test_a_registration_queues_one_notice_that_names_the_account_and_holds_no_secret(client: TestClient) -> None:
    register(client)

    connection = db.connect()
    try:
        queued = notices.waiting(connection)
    finally:
        connection.close()

    assert len(queued) == 1
    body = queued[0]["body"]
    assert queued[0]["kind"] == "registration"
    assert "alice" in body and "scripts/users.sh approve alice" in body
    assert ALICE["password"] not in body
    assert "pbkdf2" not in body  # no hash either


@pytest.mark.parametrize(
    "username", ["alice", "x;touch pwned", "$(touch pwned)", "a&b|c", "it's", "back`touch pwned`", 'q"uote', "a$HOME", "x>pwned", "-rf"]
)
def test_a_username_in_a_notice_cannot_become_another_command_when_pasted(username: str, tmp_path: Path) -> None:
    """A stranger chooses the username, and the admin may paste the line the notice contains.

    Run through a real shell, not a word splitter: the danger is `;`, `$( )`, backticks and redirection, which a splitter
    does not treat as a shell does. `set --` stands in for running the script, so what it receives is what is counted.
    """
    body = notices.registration_body(username)
    commands = [line.split(":", 1)[1].strip() for line in body.splitlines() if line.startswith(("Approve:", "Or:"))]
    assert len(commands) == 2

    for command in commands:
        arguments = command.replace("scripts/users.sh", "", 1)  # what follows the script name is what a shell would parse
        probe = f'set --{arguments}; printf "%s\\n" "$#"; printf "%s" "$1"'
        result = subprocess.run(["sh", "-c", probe], cwd=tmp_path, capture_output=True, text=True, timeout=20)

        assert result.returncode == 0, (command, result.stderr)
        count, _, first = result.stdout.partition("\n")
        assert count == "2", f"{command!r} became {count} arguments"  # the action and the name, nothing else
        assert not list(tmp_path.iterdir()), f"{command!r} ran something or wrote a file: {list(tmp_path.iterdir())}"


def test_a_failed_registration_queues_no_notice(client: TestClient) -> None:
    """The notice is written in the same transaction as the account, so a refusal tells no one."""
    register(client)
    duplicate = client.post("/api/register", json=ALICE)
    assert duplicate.status_code == 409

    connection = db.connect()
    try:
        assert len(notices.waiting(connection)) == 1
    finally:
        connection.close()


def test_the_notice_routes_are_the_bots_alone(client: TestClient) -> None:
    register(client)

    assert client.get("/api/telegram/notices").status_code == 401  # no secret
    assert client.get("/api/telegram/notices", headers={BOT_SECRET_HEADER: "wrong"}).status_code == 401
    assert client.post("/api/telegram/notices/1/delivered").status_code == 401

    # and a signed-in browser is not the bot: a session opens nothing here
    assert client.post("/api/login", json=SEED).status_code == 200
    assert client.get("/api/telegram/notices").status_code == 401
    assert client.post("/api/telegram/notices/1/delivered").status_code == 401


def test_a_delivered_notice_is_not_offered_again(client: TestClient) -> None:
    register(client)
    register(client, BOB)

    first = client.get("/api/telegram/notices", headers=BOT).json()
    assert [n["id"] for n in first] == [1, 2]
    assert set(first[0]) == {"id", "kind", "body"}

    assert client.post("/api/telegram/notices/1/delivered", headers=BOT).status_code == 204
    assert [n["id"] for n in client.get("/api/telegram/notices", headers=BOT).json()] == [2]

    # saying so twice is harmless, and an id that never existed is noticed
    assert client.post("/api/telegram/notices/1/delivered", headers=BOT).status_code == 204
    assert client.post("/api/telegram/notices/999/delivered", headers=BOT).status_code == 404


def test_a_burst_of_registrations_is_delivered_a_page_at_a_time(client: TestClient) -> None:
    connection = db.connect()
    try:
        for number in range(notices.WAITING_LIMIT + 5):
            notices.queue(connection, "registration", f"n{number}")
        connection.commit()
    finally:
        connection.close()

    page = client.get("/api/telegram/notices", headers=BOT).json()
    assert len(page) == notices.WAITING_LIMIT
    assert [n["id"] for n in page] == sorted(n["id"] for n in page)  # oldest first


# --- the admin's own operations ------------------------------------------------------------------------------------


def test_every_transition_and_every_refusal(client: TestClient) -> None:
    register(client)
    register(client, BOB)

    assert status_of("alice") == "pending"
    for action, username, fragment in [
        ("enable", "alice", "use approve"),        # never approved
        ("disable", "alice", "use reject"),        # waiting, not approved
        ("approve", "ghost", "no account called"),
        ("frobnicate", "alice", "unknown action"),
    ]:
        with pytest.raises(admin.AdminError, match=fragment):
            change(action, username)
    assert status_of("alice") == "pending"  # a refusal changes nothing

    assert "approved" in change("approve", "alice")
    with pytest.raises(admin.AdminError, match="already approved"):
        change("approve", "alice")
    assert "disabled" in change("disable", "alice")
    with pytest.raises(admin.AdminError, match="use enable"):
        change("approve", "alice")
    with pytest.raises(admin.AdminError, match="already disabled"):
        change("disable", "alice")
    assert "enabled" in change("enable", "alice")
    assert status_of("alice") == "approved"


def test_reject_deletes_only_a_waiting_account(client: TestClient) -> None:
    register(client)
    register(client, BOB)
    change("approve", "bob")

    with pytest.raises(admin.AdminError, match="only a waiting account"):
        change("reject", "bob")  # an approved one is not removed by a typo
    assert status_of("bob") == "approved"

    assert "rejected" in change("reject", "alice")
    connection = db.connect()
    try:
        assert connection.execute("SELECT count(*) FROM users WHERE username = 'alice'").fetchone()[0] == 0
    finally:
        connection.close()
    assert sign_in(client).status_code == 401  # and it no longer exists to be told about


def test_the_last_approved_account_cannot_be_disabled(client: TestClient) -> None:
    """Switching off the only account that can sign in would lock the admin out of the app they are administering."""
    with pytest.raises(admin.AdminError, match="only approved account"):
        change("disable", "user")
    assert status_of("user") == "approved"

    register(client)
    change("approve", "alice")
    assert "disabled" in change("disable", "user")  # with a second account it is allowed


def test_every_change_is_logged_without_a_secret(client: TestClient) -> None:
    register(client)
    change("approve", "alice")
    change("disable", "alice")
    with pytest.raises(admin.AdminError):
        change("approve", "alice")  # refused, so not logged as done

    connection = db.connect()
    try:
        rows = [tuple(r) for r in connection.execute("SELECT who, action, username, detail FROM admin_log ORDER BY id")]
    finally:
        connection.close()
    assert rows == [
        ("console", "approve", "alice", "pending -> approved"),
        ("console", "disable", "alice", "approved -> disabled"),
    ]
    assert ALICE["password"] not in json.dumps(rows) and "pbkdf2" not in json.dumps(rows)


# --- the command line a person actually runs -----------------------------------------------------------------------


def run_cli(*arguments: str, env_db: Path | None = None) -> subprocess.CompletedProcess:
    env = {**os.environ, "NUTRITION_DB": str(env_db or db.db_path())}
    return subprocess.run(
        [sys.executable, "-m", "app.admin", *arguments], env=env, cwd=Path(__file__).resolve().parents[1],
        capture_output=True, text=True, timeout=60,
    )


def test_the_command_line_lists_approves_and_refuses(client: TestClient) -> None:
    register(client)

    listed = run_cli("list")
    assert listed.returncode == 0
    assert "alice" in listed.stdout and "pending" in listed.stdout and "1 waiting for approval" in listed.stdout
    assert "user" in listed.stdout and "approved" in listed.stdout
    assert ALICE["password"] not in listed.stdout + listed.stderr

    done = run_cli("approve", "alice")
    assert done.returncode == 0 and "approved 'alice'" in done.stdout
    assert status_of("alice") == "approved"

    again = run_cli("approve", "alice")
    assert again.returncode == 1 and "already approved" in again.stderr and again.stdout == ""

    assert run_cli("approve", "ghost").returncode == 1
    assert run_cli("approve").returncode == 2  # argparse: a name is required
    assert "Nobody is waiting" in run_cli("list").stdout


def test_the_command_line_does_not_create_a_database_that_is_not_there(tmp_path: Path) -> None:
    """A typo in the path must not quietly make an empty database and approve nobody in it."""
    missing = tmp_path / "nope.db"
    result = run_cli("list", env_db=missing)

    assert result.returncode == 1
    assert "no database" in result.stderr
    assert not missing.exists()
