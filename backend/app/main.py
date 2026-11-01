"""FastAPI application for the nutrition tracker.

Serves the statically exported frontend at "/" and owns the API under /api.
The export is built by `next build` and copied into app/static when the image is
built, so this module never runs a build itself.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="Nutrition Tracker")


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness check, used by the start script and by the tests."""
    return {"status": "ok"}


@app.get("/api/hello")
def hello() -> dict[str, str]:
    """Example route from Part 2, kept while the nutrition routes arrive in Part 6."""
    return {"message": "Hello from the API"}


# Mounted last, so the API routes above win the match. html=True serves index.html
# at "/". The directory exists in a bare checkout (it holds a .gitkeep) and its
# contents arrive when the image is built, so an unbuilt checkout answers 404
# rather than raising: Starlette re-checks the directory on every request, which is
# why check_dir=False at construction time is not enough on its own.
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="site")
