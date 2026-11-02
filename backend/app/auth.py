"""Sign-in: the MVP credentials, the session, and the guard every protected route takes.

Separate from the nutrition routes so that the thing guarding them is not defined inside them.
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

# R1: the MVP signs in against fixed credentials, and this is the only place they exist. The
# session carries a user id, so every other route scopes by user (R2), and the registration R3
# defers can arrive later without a migration (D4).
CREDENTIALS = {"user": "password"}

# A fresh secret each start. Sessions are stateless, so restarting the container signs everyone
# out - honest for an MVP, and a persisted secret belongs with the database rather than the image.
SESSION_SECRET = secrets.token_hex(32)

router = APIRouter(prefix="/api", tags=["session"])


class Credentials(BaseModel):
    username: str
    password: str


def current_user(request: Request) -> str:
    """The signed-in user id, or 401. Every protected route depends on this (R2)."""
    user_id = request.session.get("user_id")

    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in")

    return user_id


@router.post("/login")
def login(credentials: Credentials, request: Request) -> dict[str, str]:
    """Sign in with the MVP credentials and start a session (R1)."""
    expected = CREDENTIALS.get(credentials.username)

    if expected is None or not secrets.compare_digest(expected, credentials.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    request.session["user_id"] = credentials.username
    return {"username": credentials.username}


@router.post("/logout")
def logout(request: Request) -> dict[str, str]:
    """End the session."""
    request.session.clear()
    return {"status": "signed out"}


@router.get("/session")
def session(user: str = Depends(current_user)) -> dict[str, str]:
    """Who is signed in. The app calls this on load to decide what to render."""
    return {"username": user}
