# Backend

FastAPI app that serves the static site at `/` and owns `/api/*`. Part 2 of `docs/PLAN.md`; the
nutrition routes arrive in Part 6.

## Layout

- `app/main.py` - the FastAPI app: `/` serves the page, and `/api/health` and `/api/hello` are the
  Part 2 scaffolding routes that prove the stack runs.
- `app/static/index.html` - the hello-world page. It calls `/api/hello` on load, which is how a
  browser proves that static serving and the API both work.
- `tests/test_app.py` - unit tests, no docker needed.
- `tests/test_container.py` - integration: builds the image, runs the container, checks it answers.
  Skipped when the docker daemon is unreachable, so the unit suite still runs anywhere.
- `pyproject.toml` and `uv.lock` - dependencies, managed with uv.
- `Dockerfile` - based on the official uv image, installing with `--frozen` so the image matches the
  lock file exactly.

## Running

```
uv sync
uv run uvicorn app.main:app --reload --port 8000
uv run pytest
```

## Conventions

- Dependencies are named without versions in `pyproject.toml`; `uv.lock` holds what resolved. That
  keeps "latest versions" true without pinning by hand.
- PEP 8, type hints on the route handlers, and a docstring on each route.
- No emojis.
