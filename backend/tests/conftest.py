"""Shared fixtures.

Every test gets its own database file, so nothing a test does can reach the real one - and
so the app's startup can create a schema without needing a writable /data directory.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def temporary_database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """Point the app at a throwaway database."""
    path = tmp_path / "nutrition-test.db"
    monkeypatch.setenv("NUTRITION_DB", str(path))
    yield path


@pytest.fixture(autouse=True)
def fresh_limits() -> Iterator[None]:
    """The limiters are process-wide, so one test's failed sign-ins must not count against the next."""
    from app import ratelimit

    for limiter in ratelimit.ALL:
        limiter.reset()
    yield
