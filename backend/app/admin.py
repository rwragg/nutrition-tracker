"""The admin's side of accounts (Part 14, R65 to R67).

Run on the machine, inside the backend container, by whoever holds the shell:

    python -m app.admin list
    python -m app.admin approve NAME     a pending account may sign in
    python -m app.admin reject NAME      a pending account is deleted (it has no data; it could not sign in)
    python -m app.admin disable NAME     an approved account is switched off, sessions included
    python -m app.admin enable NAME      a disabled account is switched back on

`scripts/users.sh` wraps this for the host. **There is deliberately no web route that changes a status** (R67): a signed-in
account cannot approve itself or anyone else, because the only way to change one is to be on the machine. Every change is
written to `admin_log`: when, who (the console), what, and which account. Never a password, a token or a hash.
"""

import argparse
import sqlite3
import sys
from datetime import datetime, timezone

from app import db

WHO = "console"

# action -> (status it may start from, status it ends in). `reject` is separate: it deletes.
TRANSITIONS = {
    "approve": ("pending", "approved"),
    "enable": ("disabled", "approved"),
    "disable": ("approved", "disabled"),
}

# What to say when the account is in the wrong state for the action, so the admin is pointed at the right one.
HINTS = {
    ("approve", "disabled"): "it was disabled, not waiting: use enable",
    ("approve", "approved"): "it is already approved",
    ("enable", "pending"): "it was never approved: use approve",
    ("enable", "approved"): "it is already enabled",
    ("disable", "pending"): "it is waiting, not approved: use reject to refuse it",
    ("disable", "disabled"): "it is already disabled",
}


class AdminError(Exception):
    """A change that was refused, in a sentence for the person at the console."""


def _stamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def accounts(connection: sqlite3.Connection) -> list[dict]:
    rows = connection.execute(
        "SELECT username, email, status, telegram_id IS NOT NULL AS linked FROM users ORDER BY status, username"
    ).fetchall()
    return [
        {"username": r["username"], "email": r["email"], "status": r["status"], "linked": bool(r["linked"])}
        for r in rows
    ]


def _record(connection: sqlite3.Connection, action: str, username: str, detail: str) -> None:
    connection.execute(
        "INSERT INTO admin_log (at, who, action, username, detail) VALUES (?, ?, ?, ?, ?)",
        (_stamp(), WHO, action, username, detail),
    )


def _find(connection: sqlite3.Connection, username: str) -> sqlite3.Row:
    row = connection.execute("SELECT id, username, status FROM users WHERE username = ?", (username,)).fetchone()
    if row is None:
        raise AdminError(f"there is no account called '{username}'")
    return row


def change(connection: sqlite3.Connection, action: str, username: str) -> str:
    """Do one thing to one account and say what happened. Raises AdminError, writing nothing, if it should not be done."""
    row = _find(connection, username)
    current = row["status"]

    if action == "reject":
        if current != "pending":
            raise AdminError(f"'{username}' is {current}, not waiting: only a waiting account can be rejected")
        try:
            with connection:
                connection.execute("DELETE FROM users WHERE id = ?", (row["id"],))
                _record(connection, action, username, "deleted a pending account")
        except sqlite3.IntegrityError:
            raise AdminError(f"'{username}' has records attached, so it was not deleted; use disable") from None
        return f"rejected '{username}': the waiting account was deleted"

    if action not in TRANSITIONS:
        raise AdminError(f"unknown action '{action}'")

    start, end = TRANSITIONS[action]
    if current != start:
        raise AdminError(f"'{username}' is {current}: {HINTS.get((action, current), f'{action} does not apply')}")

    if action == "disable":
        others = connection.execute(
            "SELECT count(*) FROM users WHERE status = 'approved' AND id != ?", (row["id"],)
        ).fetchone()[0]
        if others == 0:
            raise AdminError(f"'{username}' is the only approved account; disabling it would lock everyone out")

    with connection:
        connection.execute("UPDATE users SET status = ? WHERE id = ?", (end, row["id"]))
        _record(connection, action, username, f"{start} -> {end}")
    return f"{action}d '{username}': {start} -> {end}"  # approved, enabled, disabled


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.admin", description="Approve who may use the app.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list", help="every account and its status")
    for name in ("approve", "reject", "disable", "enable"):
        commands.add_parser(name, help=f"{name} an account").add_argument("username")
    args = parser.parse_args(argv)

    path = db.db_path()
    if not path.exists():
        print(f"admin: there is no database at {path}", file=sys.stderr)
        return 1

    connection = db.connect()
    try:
        if args.command == "list":
            rows = accounts(connection)
            width = max((len(r["username"]) for r in rows), default=8)
            print(f"{'ACCOUNT':<{width}}  {'STATUS':<9}  BOT CHAT  EMAIL")
            for r in rows:
                print(f"{r['username']:<{width}}  {r['status']:<9}  {'linked' if r['linked'] else '-':<8}  {r['email'] or '-'}")
            waiting = sum(1 for r in rows if r["status"] == "pending")
            print(f"\n{waiting} waiting for approval." if waiting else "\nNobody is waiting.")
            return 0

        try:
            print(change(connection, args.command, args.username))
        except AdminError as error:
            print(f"admin: {error}", file=sys.stderr)
            return 1
        return 0
    finally:
        connection.close()


if __name__ == "__main__":
    sys.exit(main())
