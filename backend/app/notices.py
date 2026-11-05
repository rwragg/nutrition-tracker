"""The queue of things the admin should be told (Part 14, R68).

The app never talks to Telegram itself. It writes a notice here; the bot, which is the only thing that does talk to
Telegram, fetches the notices that are still waiting, sends them to the admin's chat, and says so. A notice therefore
survives the bot being down and goes out once it is back, and it goes out once: `delivered` is what stops a second send.

A notice is plain text for a person to read. It never holds a password, a token or a hash, and the one thing in it that
a stranger chooses (a username) is shell-quoted where it is part of a command, so pasting the line cannot run
something the stranger wrote.
"""

import shlex
import sqlite3
from datetime import datetime, timezone

WAITING_LIMIT = 20  # what one fetch returns: a burst of registrations is delivered over a few rounds, not one wall of text


def _stamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def queue(connection: sqlite3.Connection, kind: str, body: str) -> int:
    """Queue a notice. Does not commit: it is written in the same transaction as the thing it announces, so a
    registration and its notice both exist or neither does."""
    cursor = connection.execute(
        "INSERT INTO notices (kind, body, created) VALUES (?, ?, ?)", (kind, body, _stamp())
    )
    return int(cursor.lastrowid or 0)


def registration_body(username: str) -> str:
    """What the admin reads when someone has registered. The username is quoted for a shell on purpose."""
    return (
        f"Approval requested: {username} has registered and is waiting.\n"
        f"Approve:  scripts/users.sh approve {shlex.quote(username)}\n"
        f"Or:       scripts/users.sh reject {shlex.quote(username)}"
    )


def waiting(connection: sqlite3.Connection, limit: int = WAITING_LIMIT) -> list[dict]:
    """The notices not yet delivered, oldest first."""
    rows = connection.execute(
        "SELECT id, kind, body FROM notices WHERE delivered IS NULL ORDER BY id LIMIT ?", (limit,)
    ).fetchall()
    return [{"id": row["id"], "kind": row["kind"], "body": row["body"]} for row in rows]


def mark_delivered(connection: sqlite3.Connection, notice_id: int) -> bool:
    """Record that the bot sent it. False if there is no such notice or it was already delivered, so a repeated
    acknowledgement is harmless and a wrong id is noticed."""
    with connection:
        cursor = connection.execute(
            "UPDATE notices SET delivered = ? WHERE id = ? AND delivered IS NULL", (_stamp(), notice_id)
        )
    return cursor.rowcount == 1
