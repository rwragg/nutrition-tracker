"""scripts/link-bot.sh (R55): ask for a bot token, prove it, start the bot beside a throwaway stack, print the bind.

The script handles a secret and sits beside the live bot, so what it must NOT do is tested as hard as what it does:
no secret on a command line or in any output, no touching the live project, no reusing a token another process polls.
`curl` and `docker` are stand-ins that record how they were called, so these tests never reach Telegram, a real stack
or a real token. Every token, password and id here is invented.
"""

import json
import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "link-bot.sh"

GOOD = "123456789:AAHdefGHIjklMNOpqrSTUvwxYZ_0123456789-ab"  # a token Telegram "accepts" in these tests
LIVE = "987654321:ZZZlive-token-of-the-running-bot-0123456789"
PROFILE = "555555555:QQQ-token-of-a-hermes-profile-bot-0123456789"
PASSWORD = "correct-horse-battery-staple"

CURL = r"""#!/usr/bin/env python3
import json, os, re, sys
argv = sys.argv[1:]
stdin = sys.stdin.read() if "-K" in argv else ""
url = next((a for a in reversed(argv) if a.startswith("http")), "")
if "-K" in argv:
    url = stdin.split('"')[1]
with open(os.environ["STUB_LOG"], "a") as log:
    log.write(json.dumps({"tool": "curl", "argv": argv, "url": re.sub(r"/bot[^/]+/", "/bot<token>/", url)}) + "\n")
if "api.telegram.org" in url:
    ok = ("/bot" + os.environ["STUB_GOOD_TOKEN"] + "/getMe") in url
    print(json.dumps({"ok": True, "result": {"username": "link_test_bot"}} if ok else {"ok": False, "description": "Unauthorized"}))
elif url.endswith("/api/health"):
    sys.stdout.write(os.environ.get("STUB_HEALTH", "200"))
elif url.endswith("/api/login"):
    sys.stdout.write(os.environ.get("STUB_LOGIN", "200"))
elif url.endswith("/api/telegram/code"):
    print("{}" if os.environ.get("STUB_CODE_EMPTY") else json.dumps({"code": "K7M2QX", "expires": "2026-11-04T17:00:00Z"}))
"""

DOCKER = r"""#!/usr/bin/env python3
import json, os, sys
argv = sys.argv[1:]
with open(os.environ["STUB_LOG"], "a") as log:
    log.write(json.dumps({
        "tool": "docker", "argv": argv,
        "token_in_env": os.environ.get("TELEGRAM_BOT_TOKEN") == os.environ["STUB_GOOD_TOKEN"],
        "port_in_env": os.environ.get("NUTRITION_PORT"),
    }) + "\n")
if "logs" in argv:
    print(os.environ.get("STUB_BOT_LOG", "bot-1  | listening (app at http://backend:8000, 1 allowed chat(s))"))
elif "up" in argv:
    sys.exit(int(os.environ.get("STUB_UP_EXIT", "0")))
"""


@pytest.fixture
def world(tmp_path: Path):
    """A throwaway home: stand-in curl and docker, an environment file, and a Hermes home with one profile bot."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in (("curl", CURL), ("docker", DOCKER)):
        path = bin_dir / name
        path.write_text(body)
        path.chmod(path.stat().st_mode | stat.S_IEXEC)

    env_file = tmp_path / "live.env"
    env_file.write_text(f"TELEGRAM_BOT_TOKEN={LIVE}\nTELEGRAM_BOT_SECRET=invented-secret\nTELEGRAM_ALLOWED_USERS=1234567890\n")
    hermes = tmp_path / "hermes"
    (hermes / "profiles" / "nutrition").mkdir(parents=True)
    (hermes / "profiles" / "nutrition" / ".env").write_text(f"TELEGRAM_BOT_TOKEN={PROFILE}\n")
    log = tmp_path / "calls.jsonl"

    def run(args: list[str], stdin: str = "", **extra: str):
        env = {
            **os.environ,
            "PATH": f"{bin_dir}:{os.environ['PATH']}",
            "NUTRITION_ENV_FILE": str(env_file),
            "HERMES_HOME": str(hermes),
            "STUB_LOG": str(log),
            "STUB_GOOD_TOKEN": GOOD,
            "LINK_BOT_WAIT": "2",
            "LINK_BOT_POLL": "0",
            **extra,
        }
        result = subprocess.run(["bash", str(SCRIPT), *args], input=stdin, text=True, capture_output=True, env=env, timeout=60)
        calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
        return result, calls

    run.env_file = env_file
    return run


STACK = ["--project", "nutrition-test", "--port", "8299"]


def docker_calls(calls, word):
    return [call for call in calls if call["tool"] == "docker" and word in call["argv"]]


def everything_said(result, calls) -> str:
    return result.stdout + result.stderr + json.dumps(calls)


# ---- what it refuses before it asks for anything ----------------------------------------------------------------

def test_it_refuses_the_live_project_and_the_live_port(world):
    live, calls = world(["--project", "nutrition", "--port", "8299"])
    port, more = world(["--project", "nutrition-test", "--port", "8000"])

    assert live.returncode != 0 and "live project" in live.stderr
    assert port.returncode != 0 and "live app" in port.stderr
    assert calls == [] and more == []


def test_it_needs_a_project_and_a_port(world):
    result, calls = world([])
    assert result.returncode == 2 and "usage" in result.stderr
    assert calls == []


def test_it_refuses_when_the_bot_could_not_work_anyway(world):
    world.env_file.write_text(f"TELEGRAM_BOT_TOKEN={LIVE}\nTELEGRAM_BOT_SECRET=\nTELEGRAM_ALLOWED_USERS=1234567890\n")
    result, _ = world(STACK, GOOD + "\n")
    assert result.returncode != 0 and "TELEGRAM_BOT_SECRET" in result.stderr

    world.env_file.write_text(f"TELEGRAM_BOT_TOKEN={LIVE}\nTELEGRAM_BOT_SECRET=x\nTELEGRAM_ALLOWED_USERS=\n")
    result, _ = world(STACK, GOOD + "\n")
    assert result.returncode != 0 and "TELEGRAM_ALLOWED_USERS" in result.stderr


def test_it_refuses_when_the_stack_is_not_up_and_never_asks_for_a_token(world):
    result, calls = world(STACK, GOOD + "\n", STUB_HEALTH="000")

    assert result.returncode != 0 and "nothing healthy answers" in result.stderr
    assert not any("telegram" in call.get("url", "") for call in calls)
    assert docker_calls(calls, "up") == []


# ---- the token ------------------------------------------------------------------------------------------------

def test_a_malformed_token_is_refused_without_sending_it_anywhere(world):
    result, calls = world(STACK, "not-a-token\n")

    assert result.returncode != 0 and "does not look like a bot token" in result.stderr
    assert not any("telegram" in call.get("url", "") for call in calls)
    assert docker_calls(calls, "up") == []


def test_a_token_telegram_refuses_starts_nothing(world):
    wrong = "123456789:WrongWrongWrongWrongWrongWrongWrong12"
    result, calls = world(STACK, wrong + "\n")

    assert result.returncode != 0 and "did not accept that token" in result.stderr
    assert docker_calls(calls, "up") == []
    assert wrong not in everything_said(result, calls)


def test_the_live_bots_token_is_refused_and_never_printed(world):
    result, calls = world(STACK, LIVE + "\n")

    assert result.returncode != 0 and "already in use" in result.stderr and "live.env" in result.stderr
    assert not any("telegram" in call.get("url", "") for call in calls)  # refused before it is even sent to Telegram
    assert LIVE not in everything_said(result, calls)


def test_a_hermes_profile_bots_token_is_refused_too(world):
    result, calls = world(STACK, PROFILE + "\n")

    assert result.returncode != 0 and "already in use" in result.stderr and "profiles/nutrition/.env" in result.stderr
    assert docker_calls(calls, "up") == []
    assert PROFILE not in everything_said(result, calls)


def test_check_verifies_the_token_and_starts_nothing(world):
    result, calls = world([*STACK, "--check"], GOOD + "\n")

    assert result.returncode == 0
    assert "Verified: @link_test_bot" in result.stdout
    assert docker_calls(calls, "up") == [] and docker_calls(calls, "logs") == []


# ---- the whole path --------------------------------------------------------------------------------------------

def test_the_happy_path_starts_only_the_bot_and_prints_the_bind(world):
    result, calls = world([*STACK, "--user", "alice"], f"{GOOD}\n{PASSWORD}\n")

    assert result.returncode == 0, result.stderr
    assert "Verified: @link_test_bot" in result.stdout
    assert "/bind K7M2QX" in result.stdout and "@link_test_bot" in result.stdout

    (up,) = docker_calls(calls, "up")
    assert up["argv"] == ["compose", "--env-file", str(world.env_file), "-p", "nutrition-test", "--profile", "bot",
                          "up", "-d", "--no-deps", "--force-recreate", "bot"]
    assert up["token_in_env"] is True  # the token reaches the bot through the environment ...
    assert up["port_in_env"] == "8299"  # ... with the same port the stack was started with

    assert [call["argv"][-1] for call in calls if call["tool"] == "curl" and call["url"].endswith("/api/login")]  # it signed in


def test_no_secret_is_ever_printed_logged_or_put_on_a_command_line(world):
    result, calls = world([*STACK, "--user", "alice"], f"{GOOD}\n{PASSWORD}\n")

    said = everything_said(result, calls)
    assert GOOD not in said and PASSWORD not in said
    for call in calls:
        assert not any(GOOD in arg or PASSWORD in arg for arg in call["argv"])  # argv is what `ps` shows


def test_a_login_that_fails_still_leaves_the_bot_running_and_says_how_to_bind_by_hand(world):
    result, calls = world([*STACK, "--user", "alice"], f"{GOOD}\nwrong-password\n", STUB_LOGIN="401")

    assert result.returncode == 0
    assert "Could not sign in as 'alice' (HTTP 401)" in result.stdout and "Get a code" in result.stdout
    assert "/bind K7M2QX" not in result.stdout
    assert len(docker_calls(calls, "up")) == 1
    assert "wrong-password" not in everything_said(result, calls)


def test_no_password_means_no_sign_in_and_a_by_hand_instruction(world):
    result, calls = world([*STACK, "--user", "alice"], f"{GOOD}\n\n")

    assert result.returncode == 0 and "No sign-in given" in result.stdout
    assert not any(call.get("url", "").endswith("/api/login") for call in calls)


def test_an_empty_answer_from_the_app_is_not_a_bind(world):
    result, _ = world([*STACK, "--user", "alice"], f"{GOOD}\n{PASSWORD}\n", STUB_CODE_EMPTY="1")

    assert result.returncode == 0 and "the app gave no code" in result.stdout and "/bind" not in result.stdout.replace("send  /bind CODE", "")


def test_a_bot_that_never_listens_is_reported_with_its_log_and_no_code_is_minted(world):
    result, calls = world([*STACK, "--user", "alice"], f"{GOOD}\n{PASSWORD}\n", STUB_BOT_LOG="bot-1  | the app refused the bot secret")

    assert result.returncode != 0
    assert "did not report 'listening'" in result.stderr and "the app refused the bot secret" in result.stderr
    assert not any(call.get("url", "").endswith("/api/login") for call in calls)  # it does not go on to sign in


def test_docker_failing_to_start_the_bot_is_an_error_and_goes_no_further(world):
    result, calls = world([*STACK, "--user", "alice"], f"{GOOD}\n{PASSWORD}\n", STUB_UP_EXIT="1")

    assert result.returncode != 0 and "could not start the bot" in result.stderr
    assert docker_calls(calls, "logs") == []
