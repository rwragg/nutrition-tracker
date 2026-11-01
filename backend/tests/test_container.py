"""Integration test: build the image, run the container, check that it answers.

Skipped when the docker CLI is missing or the daemon is unreachable, so the unit
suite stays runnable on a machine without docker.
"""

import shutil
import subprocess
import time
from collections.abc import Iterator
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
IMAGE = "nutrition-backend:test"
CONTAINER = "nutrition-backend-test"
BASE_URL = "http://127.0.0.1:8123"


def docker_is_reachable() -> bool:
    if shutil.which("docker") is None:
        return False
    return subprocess.run(["docker", "info"], capture_output=True).returncode == 0


pytestmark = pytest.mark.skipif(
    not docker_is_reachable(),
    reason="docker daemon is not reachable from this user",
)


@pytest.fixture(scope="module")
def container() -> Iterator[str]:
    """Build the image, run it, and wait for the health check."""
    subprocess.run(["docker", "build", "-t", IMAGE, "."], cwd=BACKEND_DIR, check=True, capture_output=True)
    subprocess.run(["docker", "rm", "-f", CONTAINER], capture_output=True)
    subprocess.run(
        ["docker", "run", "-d", "--name", CONTAINER, "-p", "8123:8000", IMAGE],
        check=True,
        capture_output=True,
    )

    for _ in range(60):
        try:
            urlopen(f"{BASE_URL}/api/health", timeout=1)
            break
        except URLError:
            time.sleep(1)

    yield BASE_URL

    subprocess.run(["docker", "rm", "-f", CONTAINER], capture_output=True)


def test_container_serves_the_page(container: str) -> None:
    response = urlopen(container, timeout=5)

    assert response.status == 200
    assert "Hello world" in response.read().decode()


def test_container_answers_the_api(container: str) -> None:
    response = urlopen(f"{container}/api/hello", timeout=5)

    assert response.status == 200
    assert b"Hello from the API" in response.read()
