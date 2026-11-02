"""Linking a chat to an account (R26, D18).

The bot has to act for a person who is not there to type a password, so something has to say which
account a chat belongs to. D18 chose how: **the app shows a code, the chat redeems it.** The
alternative — asking someone to type their password into Telegram — puts a password into a chat
history, a backup and a screenshot, which is reason enough not to.

The binding itself is `users.telegram_id`, which has been there since schema version 4 and is unique,
so the two rules R26 asks for are the index's:

- a chat is bound to **exactly one** account;
- an account has **at most one** chat — the same index, read the other way.

`telegram_codes` holds the codes rather than signing them, for one reason: single use. A signed code
cannot be made to stop working once redeemed, and a code that keeps working is one somebody else can
use.
"""

import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import BOT_SECRET_HEADER, Connection, User, require_bot

router = APIRouter(prefix="/api/telegram", tags=["telegram"])

# No I, L, O, 0 or 1: a code is read off a screen and typed into a chat, and those are the pairs
# people get wrong.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6
CODE_LIFETIME = timedelta(minutes=15)


def now() -> datetime:
    """The moment in UTC, to the second — the shape the column's CHECK requires."""
    return datetime.now(timezone.utc).replace(microsecond=0)


def stamp(moment: datetime | None = None) -> str:
    """A moment as the ISO 8601 UTC string the column stores.

    Fixed width and UTC, so two of them compare correctly as plain strings — which is what makes
    `expires <= now` a valid expiry test in SQL and in Python alike.
    """
    return (moment or now()).strftime("%Y-%m-%dT%H:%M:%SZ")


def new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


class Binding(BaseModel):
    """What the bot sends to redeem a code.

    Deliberately loose about the code's shape: it is normalised before it is judged. A person types a
    code off a screen into a chat, so spaces and lower case arrive, and refusing those as a malformed
    request would blame the typist for something the normalisation already fixed.
    """

    code: str = Field(min_length=1, max_length=32)
    chat_id: str = Field(min_length=1, max_length=32)


class Code(BaseModel):
    """What the app is shown. Both fields are for display; neither is a session."""

    code: str
    expires: str


def live_code(connection: sqlite3.Connection, code: str) -> sqlite3.Row:
    """The unusued, unexpired code, or the reason it cannot be redeemed.

    Each refusal says something different on purpose: "no such code" is a typo, "already used" is a
    code that worked once, "expired" is one that was left on screen. Collapsing them into one message
    would make all three look like the same mistake.
    """
    row = connection.execute(
        "SELECT code, user_id, expires, used FROM telegram_codes WHERE code = ?", (code,)
    ).fetchone()

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no such code")
    if row["used"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="that code has already been used — ask the app for a new one",
        )
    if row["expires"] <= stamp():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="that code has expired — ask the app for a new one",
        )

    return row


@router.post("/code", response_model=Code, status_code=status.HTTP_201_CREATED)
def mint_code(connection: Connection, user: User) -> Code:
    """A fresh pairing code for the signed-in account (D18).

    Any code this account has not used yet is thrown away first: two live codes would be two chances
    to bind, and the person asking for a second code is asking for the first to stop working.
    """
    code = new_code()
    expires = stamp(now() + CODE_LIFETIME)

    with connection:
        connection.execute("DELETE FROM telegram_codes WHERE user_id = ?", (user,))

        # `code` is the primary key, so a collision is a database answer rather than something to
        # check first. Six characters from a 31-letter alphabet make one unlikely; retrying makes it
        # impossible to hit, and five attempts is already absurd.
        for _ in range(5):
            try:
                connection.execute(
                    "INSERT INTO telegram_codes (code, user_id, expires, used) VALUES (?, ?, ?, 0)",
                    (code, user, expires),
                )
                break
            except sqlite3.IntegrityError:
                code = new_code()
        else:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="could not make a code just now — try again",
            )

    return Code(code=code, expires=expires)


@router.post("/bind")
def bind(
    body: Binding,
    connection: Connection,
    supplied_secret: str | None = Header(default=None, alias=BOT_SECRET_HEADER),
) -> dict[str, str | None]:
    """Redeem a code: bind this chat to the account that asked for it (R26).

    Called by the bot, never by a browser, so it takes the bot's secret instead of a session. The
    caller cannot choose which account it binds to — only which code it redeems — which is what stops
    this from being a way to attach any chat to any log.
    """
    require_bot(supplied_secret)

    code = body.code.strip().upper().replace(" ", "")
    chat_id = body.chat_id.strip()
    row = live_code(connection, code)

    bound_to_chat = connection.execute(
        "SELECT id, username FROM users WHERE telegram_id = ?", (chat_id,)
    ).fetchone()
    if bound_to_chat is not None and bound_to_chat["id"] != row["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="this chat is already linked to another account — unlink it there first",
        )

    bound_to_account = connection.execute(
        "SELECT telegram_id FROM users WHERE id = ?", (row["user_id"],)
    ).fetchone()
    existing = bound_to_account["telegram_id"] if bound_to_account else None
    if existing is not None and existing != chat_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="that account is already linked to another chat — unlink it in the app first",
        )

    with connection:
        connection.execute(
            "UPDATE users SET telegram_id = ? WHERE id = ?", (chat_id, row["user_id"])
        )
        # Burnt, used or not: a code that has done its job, and any other code this account was
        # holding, so a stale one cannot be redeemed later.
        connection.execute("UPDATE telegram_codes SET used = 1 WHERE user_id = ?", (row["user_id"],))

    account = connection.execute(
        "SELECT id, username FROM users WHERE id = ?", (row["user_id"],)
    ).fetchone()

    return {"id": account["id"], "username": account["username"], "chat_id": chat_id}


@router.get("/link")
def read_link(connection: Connection, user: User) -> dict[str, str | None]:
    """Whether this account has a chat linked, so the app can say so (D18)."""
    row = connection.execute("SELECT telegram_id FROM users WHERE id = ?", (user,)).fetchone()
    return {"telegram_id": row["telegram_id"] if row else None}


@router.delete("/link", status_code=status.HTTP_204_NO_CONTENT)
def unlink(connection: Connection, user: User) -> None:
    """Detach the chat. Without this, a link could be made but never moved — and a chat id can
    outlive the thing it named."""
    with connection:
        connection.execute("UPDATE users SET telegram_id = NULL WHERE id = ?", (user,))
