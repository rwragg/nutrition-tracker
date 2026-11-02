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


def current_user(request: Request) -> str:
    """The signed-in user id, or 401. Every protected route depends on this (R2)."""
    user_id = request.session.get("user_id")

    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in")

    return user_id


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
    row = account(connection, current_user(request))
    return {"username": row["username"], "email": row["email"], "telegram_id": row["telegram_id"]}
