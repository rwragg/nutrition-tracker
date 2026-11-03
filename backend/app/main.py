"""FastAPI application for the nutrition tracker.

Serves the statically exported frontend at "/" and owns the API under /api. The export is built by
`next build` and copied into app/static when the image is built, so this module never runs a build
itself.

This module wires the app together; the routes live where they belong - sign-in in `auth.py`, the
nutrition routes in `api.py`, the storage in `db.py`.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.api import router as nutrition_router
from app.auth import SESSION_SECRET
from app.auth import router as session_router
from app.db import initialise
from app.lookup import router as lookup_router
from app.telegram import router as telegram_router

STATIC_DIR = Path(__file__).parent / "static"


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



@app.exception_handler(RequestValidationError)
async def refuse_invalid(_: Request, error: RequestValidationError) -> JSONResponse:
    """A 422 that does not repeat what was sent.

    The default body echoes each rejected value back as `input`. For a number that is not finite that
    crashed the response itself (`inf` is not JSON), turning a refusal into a 500; and for a password
    that was too short it handed the password back in the response. The location and the reason are
    what a client needs; the value is not.
    """
    detail = [
        {key: value for key, value in item.items() if key not in ("input", "ctx")}
        for item in error.errors()
    ]
    return JSONResponse({"detail": detail}, status_code=422)


app.include_router(session_router)
app.include_router(telegram_router)
app.include_router(lookup_router)
app.include_router(nutrition_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness check. Open on purpose: the container healthcheck and start script use it."""
    return {"status": "ok"}


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
