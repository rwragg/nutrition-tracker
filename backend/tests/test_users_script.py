"""scripts/users.sh (Part 14, R67): the admin's wrapper around `python -m app.admin`.

`docker` is a stand-in that records how it was called, so these never touch a real stack. What matters here is what the
script hands to the container (the right words, a username as ONE argument however odd it is, no terminal input
swallowed) and how it tells a refused change from a stack that is down.
"""

import json
import os
import shutil
import stat
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "users.sh"

DOCKER = r"""#!/usr/bin/env python3
import json, os, sys
with open(os.environ["STUB_LOG"], "a") as log:
    log.write(json.dumps({"argv": sys.argv[1:], "stdin": sys.stdin.read()}) + "\n")
if os.environ.get("STUB_SAY"):
    print(os.environ["STUB_SAY"])
sys.exit(int(os.environ.get("STUB_EXIT", "0")))
"""


@pytest.fixture
def stub(tmp_path: Path) -> dict:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    docker = bin_dir / "docker"
    docker.write_text(DOCKER)
    docker.chmod(docker.stat().st_mode | stat.S_IEXEC)
    return {"bin": bin_dir, "log": tmp_path / "calls.jsonl"}


def run(stub: dict, *arguments: str, env: dict | None = None, stdin: str = "typed at the terminal") -> subprocess.CompletedProcess:
    full_env = {**os.environ, "PATH": f"{stub['bin']}:{os.environ['PATH']}", "STUB_LOG": str(stub["log"]), **(env or {})}
    return subprocess.run(["bash", str(SCRIPT), *arguments], env=full_env, input=stdin, capture_output=True, text=True, timeout=30)


def calls(stub: dict) -> list[dict]:
    return [json.loads(line) for line in stub["log"].read_text().splitlines()] if stub["log"].exists() else []


def test_each_action_reaches_the_admin_command_inside_the_backend_container(stub: dict) -> None:
    for words in (["list"], ["approve", "alice"], ["reject", "bob"], ["disable", "carol"], ["enable", "dave"]):
        stub["log"].unlink(missing_ok=True)
        result = run(stub, *words)

        assert result.returncode == 0, result.stderr
        assert [c["argv"] for c in calls(stub)] == [["compose", "exec", "-T", "backend", "python", "-m", "app.admin", *words]]


def test_a_named_project_is_passed_to_compose(stub: dict) -> None:
    run(stub, "--project", "nutrition-shots", "approve", "alice")

    assert calls(stub)[0]["argv"] == ["compose", "-p", "nutrition-shots", "exec", "-T", "backend", "python", "-m", "app.admin", "approve", "alice"]


@pytest.mark.parametrize("name", ["x;touch pwned", "$(touch pwned)", "a b", "it's", "`id`", "-rf", "*"])
def test_a_username_goes_through_as_one_untouched_argument(stub: dict, name: str, tmp_path: Path) -> None:
    result = run(stub, "approve", name)

    assert result.returncode == 0, result.stderr
    assert calls(stub)[0]["argv"][-2:] == ["approve", name]  # one element, byte for byte
    assert not (Path.cwd() / "pwned").exists() and not (SCRIPT.parents[1] / "pwned").exists()


def test_it_does_not_swallow_the_terminals_input(stub: dict) -> None:
    """Docker reads stdin when it can; a person pasting into a terminal must not lose what they typed to it."""
    run(stub, "list", stdin="this belongs to the terminal")

    assert calls(stub)[0]["stdin"] == ""


@pytest.mark.parametrize(
    "arguments",
    [(), ("frobnicate", "alice"), ("approve",), ("approve", ""), ("approve", "alice", "extra"), ("list", "extra"), ("--nope", "list"), ("--project",)],
)
def test_a_malformed_command_prints_usage_and_never_calls_docker(stub: dict, arguments: tuple) -> None:
    result = run(stub, *arguments)

    assert result.returncode == 2
    assert "scripts/users.sh approve NAME" in result.stderr
    assert calls(stub) == []


def test_a_refused_change_is_passed_through_without_blaming_the_stack(stub: dict) -> None:
    """Exit 1 is the app saying no, in its own words, which it has already printed."""
    result = run(stub, "approve", "alice", env={"STUB_EXIT": "1"})

    assert result.returncode == 1
    assert "could not reach" not in result.stderr


def test_a_stack_that_is_down_is_said_to_be_down(stub: dict) -> None:
    result = run(stub, "approve", "alice", env={"STUB_EXIT": "125"})

    assert result.returncode == 125
    assert "could not reach the backend container" in result.stderr
    assert "up -d" in result.stderr


def test_without_docker_it_says_so(tmp_path: Path) -> None:
    only = tmp_path / "only"
    only.mkdir()
    for tool in ("dirname", "sed", "bash"):  # what the script itself needs before it looks for docker
        found = shutil.which(tool)
        assert found, tool
        (only / tool).symlink_to(found)

    result = subprocess.run(["bash", str(SCRIPT), "list"], env={"PATH": str(only)}, capture_output=True, text=True, timeout=30)

    assert result.returncode == 1
    assert "docker is not installed" in result.stderr
