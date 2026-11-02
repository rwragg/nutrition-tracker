"""FastAPI application for the nutrition tracker.

Serves the statically exported frontend at "/" and owns the API under /api.
The export is built by `next build` and copied into app/static when the image is
built, so this module never runs a build itself.
"""

import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from app.db import initialise

STATIC_DIR = Path(__file__).parent / "static"

# R1: the MVP signs in against fixed credentials. The session carries a user id, so
# Part 6 can scope every row by user (R2) and the deferred registration (R3) can land
# later without a migration (D4).
CREDENTIALS = {"user": "password"}

# A fresh secret each start. Sessions are stateless, so restarting the container signs
# everyone out - honest for an MVP, and a persisted secret belongs with the database
# in Part 5/6 rather than in the image.
SESSION_SECRET = secrets.token_hex(32)

@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Create the database if it is absent, and seed it the first time (R17, R14)."""
    initialise().close()
    yield


app = FastAPI(title="Nutrition Tracker", lifespan=lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    same_site="lax",
    https_only=False,
)


class Credentials(BaseModel):
    username: str
    password: str


def current_user(request: Request) -> str:
    """The signed-in user id, or 401. Every protected route depends on this (R2)."""
    user_id = request.session.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in")
    return user_id


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness check. Open on purpose: the container healthcheck and start script use it."""
    return {"status": "ok"}


@app.post("/api/login")
def login(credentials: Credentials, request: Request) -> dict[str, str]:
    """Sign in with the MVP credentials and start a session (R1)."""
    expected = CREDENTIALS.get(credentials.username)

    if expected is None or not secrets.compare_digest(expected, credentials.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    request.session["user_id"] = credentials.username
    return {"username": credentials.username}


@app.post("/api/logout")
def logout(request: Request) -> dict[str, str]:
    """End the session."""
    request.session.clear()
    return {"status": "signed out"}


@app.get("/api/session")
def session(user: str = Depends(current_user)) -> dict[str, str]:
    """Who is signed in. The app calls this on load to decide what to render."""
    return {"username": user}


@app.get("/api/hello", dependencies=[Depends(current_user)])
def hello() -> dict[str, str]:
    """Example route from Part 2, now behind the session - which is what the guard does."""
    return {"message": "Hello from the API"}


# Mounted last, so the API routes above win the match. html=True serves index.html
# at "/". The directory exists in a bare checkout (it holds a .gitkeep) and its
# contents arrive when the image is built, so an unbuilt checkout answers 404 rather
# than raising: Starlette re-checks the directory on every request, which is why
# check_dir=False at construction time is not enough on its own.
#
# The mount is deliberately not gated. A static export is markup and JavaScript the
# browser has to fetch, so no server-side check can hide it; what is protected is the
# data - every route above depends on a session. See P4.2 in docs/PLAN.md.
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="site")
