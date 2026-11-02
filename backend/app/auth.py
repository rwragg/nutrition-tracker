"""Accounts: registration, sign-in, the session, and the guard every protected route takes.

Separate from the nutrition routes so that the thing guarding them is not defined inside them,
and the connection dependency lives here because both routers need it and the thing that guards
a route should not be declared inside the routes it guards.

Two rules are load-bearing:

- **A user is an id.** The session carries the user id, every route scopes by it (R2), and the
  id is generated rather than derived from the username, because a username is something a
  person may want to change and a primary key is not.
- **A password is never stored, compared or returned as a string.** It is hashed on the way in
  and verified with a constant-time comparison on the way back (`app.passwords`), and no route
  answers with a hash. A wrong username and a wrong password give the same refusal, so the API
  does not tell a stranger which usernames exist.

R1's hardcoded credential is superseded here rather than deleted: the account it named is
seeded with it (see `db.SEED_PASSWORD`), so the app still opens with the documented
`user` / `password` and gains the way to have others (R3, R24).
"""

import hmac
import os
import secrets
import sqlite3
import uuid
from typing import Annotated, TypeAlias

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, model_validator

from app.db import database
from app.passwords import hash_password, verify_password

# A fresh secret each start. Sessions are stateless, so restarting the container signs everyone
# out - honest for an MVP, and a persisted secret belongs with the database rather than the image.
SESSION_SECRET = secrets.token_hex(32)

# How the bot identifies itself and the chat it is speaking for (R26). The bot holds a secret
# because it has to act for someone who is not there to type a password: it is trusted, and it can
# only ever speak for a chat that has already been bound to an account.
BOT_SECRET_ENV = "TELEGRAM_BOT_SECRET"
BOT_SECRET_HEADER = "X-Bot-Secret"
BOT_CHAT_HEADER = "X-Telegram-Chat"

router = APIRouter(prefix="/api", tags=["session"])

Connection: TypeAlias = Annotated[sqlite3.Connection, Depends(database)]


class Credentials(BaseModel):
    username: str
    password: str


class Registration(BaseModel):
    """What a new account sends: R3 asks for a username, an email and a telegram id."""

    username: str = Field(min_length=3, max_length=64)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=256)
    telegram_id: str | None = Field(default=None, max_length=32)

    @model_validator(mode="after")
    def well_formed(self) -> "Registration":
        # A username is an identifier, not a display name: whitespace in one is a typo waiting
        # to be unreproducible.
        self.username = self.username.strip()
        if any(character.isspace() for character in self.username):
            raise ValueError("a username has no spaces")

        self.email = self.email.strip()
        local, _, domain = self.email.partition("@")
        if not local or not domain or "." not in domain:
            raise ValueError("that does not look like an email address")

        if self.telegram_id is not None:
            self.telegram_id = self.telegram_id.strip() or None
            if self.telegram_id is not None and not self.telegram_id.isdigit():
                raise ValueError("a telegram id is digits")

        return self


def bot_secret() -> str:
    """The secret the bot presents. Empty means this app cannot take a binding at all, which is a
    configuration answer rather than a refusal of the caller."""
    return os.environ.get(BOT_SECRET_ENV, "").strip()


def require_bot(supplied: str | None) -> None:
    """401/503 the caller if it is not the bot. Compared in constant time, and a missing
    configuration is its own answer: without a secret there is nothing to compare against, and
    saying so beats refusing every request as if the caller were wrong."""
    expected = bot_secret()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"no {BOT_SECRET_ENV} is configured, so no chat can be bound",
        )
    if not supplied or not hmac.compare_digest(expected, supplied):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not the bot")


def bound_user(connection: sqlite3.Connection, chat_id: str) -> str:
    """The account a chat is bound to (R26), or 403.

    403 rather than 404: this is not a record the caller cannot see, it is a caller who has not
    said who they are yet - and the refusal is the instruction to go and bind.
    """
    row = connection.execute(
        "SELECT id FROM users WHERE telegram_id = ?", (chat_id,)
    ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="this chat is not linked to an account yet",
        )

    return row["id"]


def current_user(request: Request, connection: Connection) -> str:
    """Who is asking: a signed-in session, or the bot speaking for a chat it talks to (R26).

    Every protected route depends on this (R2), so there is exactly one place where "who is this"
    is decided, and the bot cannot reach a route by a path a browser cannot.
    """
    user_id = request.session.get("user_id")

    if user_id is not None:
        # A session wins if a request somehow carries both: a browser that is signed in is signed
        # in, and that is the stronger claim. The bot never sends cookies, so in practice the two
        # never meet - which is why this is worth stating rather than discovering.
        return user_id

    chat_id = request.headers.get(BOT_CHAT_HEADER)
    if chat_id is not None:
        require_bot(request.headers.get(BOT_SECRET_HEADER))
        return bound_user(connection, chat_id)

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in")


# The guarded caller, as a dependency. Here rather than in the routers because both of them take
# it and the thing that guards a route should not be declared inside the routes it guards.
User: TypeAlias = Annotated[str, Depends(current_user)]


def account(connection: sqlite3.Connection, user_id: str) -> sqlite3.Row:
    """One account by id, or 404. For the routes that deal with an account rather than a log."""
    row = connection.execute(
        "SELECT id, username, email, telegram_id FROM users WHERE id = ?", (user_id,)
    ).fetchone()

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such account")

    return row


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: Registration, connection: Connection) -> dict[str, str | None]:
    """Create an account (R3, R24). Does not sign anyone in: signing in is its own step, and a
    route that does both cannot be tested for either."""
    # A list of the fields that actually collided, not a dict of every lookup: a dict with three
    # keys is truthy even when all three values are None, which is how this read as "taken" for a
    # registration on an empty database.
    taken = [
        column
        for column, value in (
            ("username", body.username),
            ("email", body.email),
            ("telegram_id", body.telegram_id),
        )
        if value is not None
        and connection.execute(
            f"SELECT 1 FROM users WHERE {column} = ?", (value,)  # noqa: S608 - fixed column names
        ).fetchone()
        is not None
    ]
    if taken:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"that {', '.join(taken)} is already registered",
        )

    user_id = f"user-{uuid.uuid4().hex[:12]}"
    try:
        with connection:
            connection.execute(
                "INSERT INTO users (id, username, email, telegram_id, password_hash)"
                " VALUES (?, ?, ?, ?, ?)",
                (
                    user_id,
                    body.username,
                    body.email,
                    body.telegram_id,
                    hash_password(body.password),
                ),
            )
    except sqlite3.IntegrityError:
        # The unique indexes are the backstop for the gap between the check above and this
        # insert. The same answer either way, because to a caller they are the same fact.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="that username, email or telegram id is already registered",
        ) from None

    return {
        "id": user_id,
        "username": body.username,
        "email": body.email,
        "telegram_id": body.telegram_id,
    }


@router.post("/login")
def login(credentials: Credentials, request: Request, connection: Connection) -> dict[str, str]:
    """Sign in and start a session (R1, R24)."""
    row = connection.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (credentials.username,)
    ).fetchone()

    # One refusal for both cases: whether a username exists is not a stranger's business.
    if row is None or not verify_password(credentials.password, row["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    request.session["user_id"] = row["id"]
    return {"username": credentials.username}


@router.post("/logout")
def logout(request: Request) -> dict[str, str]:
    """End the session."""
    request.session.clear()
    return {"status": "signed out"}


@router.get("/session")
def session(request: Request, connection: Connection) -> dict[str, str | None]:
    """Who is signed in, and what the app may show about them. The app calls this on load to
    decide what to render."""
    row = account(connection, current_user(request, connection))
    return {"username": row["username"], "email": row["email"], "telegram_id": row["telegram_id"]}
