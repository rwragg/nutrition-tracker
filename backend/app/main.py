"""FastAPI application for the nutrition tracker.

Part 2 of the plan: prove the stack runs - a static hello-world page served at
"/" and an API route the page calls. The nutrition routes arrive in Part 6.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="Nutrition Tracker")


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness check, used by the start script and by the tests."""
    return {"status": "ok"}


@app.get("/api/hello")
def hello() -> dict[str, str]:
    """Example API route, called by the hello-world page to prove the API answers."""
    return {"message": "Hello from the API"}


@app.get("/")
def index() -> FileResponse:
    """The hello-world page."""
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
