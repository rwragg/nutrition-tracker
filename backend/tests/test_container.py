"""Integration test: build the image, run the container, check that it answers.

Skipped when the docker CLI is missing or the daemon is unreachable, so the unit
suite stays runnable on a machine without docker.
"""

import re
import shutil
import subprocess
import time
from collections.abc import Iterator
from pathlib import Path
from urllib.request import urlopen

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent
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


def wait_until_ready(timeout: float = 60.0) -> None:
    """Wait for the container to answer.

    Docker's port proxy accepts a connection as soon as the port is published,
    before uvicorn is listening, and then resets it - so an early attempt can fail
    with a reset rather than a refusal. Both are OSError, so retry on any of them.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urlopen(f"{BASE_URL}/api/health", timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            pass
        time.sleep(1)
    raise AssertionError(f"the container never answered on {BASE_URL} within {timeout:.0f}s")


@pytest.fixture(scope="module")
def container() -> Iterator[str]:
    """Build the image, run it, and wait for the health check.

    The build context is the project root, not backend/ - the Dockerfile builds the
    frontend first and copies its export in, so it needs both directories.
    """
    subprocess.run(
        ["docker", "build", "-f", "backend/Dockerfile", "-t", IMAGE, "."],
        cwd=ROOT_DIR,
        check=True,
        capture_output=True,
    )
    subprocess.run(["docker", "rm", "-f", CONTAINER], capture_output=True)
    subprocess.run(
        ["docker", "run", "-d", "--name", CONTAINER, "-p", "8123:8000", IMAGE],
        check=True,
        capture_output=True,
    )

    try:
        wait_until_ready()
        yield BASE_URL
    finally:
        subprocess.run(["docker", "rm", "-f", CONTAINER], capture_output=True)


def test_container_serves_the_app_at_root(container: str) -> None:
    response = urlopen(container, timeout=5)
    body = response.read().decode()

    assert response.status == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "<title>Nutrition Tracker</title>" in body


def test_container_serves_the_built_bundles(container: str) -> None:
    """The HTML alone proves little - the hashed Next bundles must be served too."""
    body = urlopen(container, timeout=5).read().decode()
    assets = re.findall(r'src="(/_next/[^"]+)"', body)

    assert assets, "the exported HTML references no Next assets"
    for path in assets[:3]:
        assert urlopen(f"{container}{path}", timeout=5).status == 200


def test_container_answers_the_api(container: str) -> None:
    response = urlopen(f"{container}/api/hello", timeout=5)

    assert response.status == 200
    assert b"Hello from the API" in response.read()
