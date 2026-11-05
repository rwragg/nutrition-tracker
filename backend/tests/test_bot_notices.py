"""The bot tells the admin that someone is waiting (Part 14, R68, R69).

The app queues a notice and never talks to Telegram; the bot is the only thing that does. What matters here is the delivery
guarantee and what it must not leak: a notice is sent, then acknowledged, in order; a failure leaves it queued; and the
bot's own token, which is in every Telegram URL, never reaches a log line. Nothing here reaches Telegram or an app.
"""

import io
import json
import urllib.error

import pytest

from app import bot
from test_bot import FakeApi, FakeTelegram, run_poll

ADMIN = "7001"
TOKEN = "123456789:invented-for-tests"  # deliberately too short and plain to look like a real one to a secret scanner


class NoticeApi(FakeApi):
    """The notice half of the client: a queue the bot reads and acknowledges, recording the order it did so."""

    def __init__(self, waiting: list[dict] | None = None, *, fail_fetch: bool = False, fail_ack: bool = False) -> None:
        super().__init__()
        self.waiting = list(waiting or [])
        self.fail_fetch = fail_fetch
        self.fail_ack = fail_ack
        self.events: list[str] = []

    def notices(self) -> list[dict]:
        self.events.append("fetch")
        if self.fail_fetch:
            raise urllib.error.URLError("the app is down")
        return list(self.waiting)

    def notice_delivered(self, notice_id: int) -> None:
        self.events.append(f"ack {notice_id}")
        if self.fail_ack:
            raise urllib.error.URLError("the app went away mid-acknowledgement")
        self.waiting = [n for n in self.waiting if n["id"] != notice_id]


def notice(number: int) -> dict:
    return {"id": number, "kind": "registration", "body": f"Approval requested: person{number} has registered and is waiting."}


class Outbox:
    """Where the admin's messages go, and a way to make the send fail."""

    def __init__(self, fail_on: set[int] | None = None, leak: str | None = None) -> None:
        self.sent: list[tuple[str, str]] = []
        self.fail_on = fail_on or set()
        self.leak = leak
        self.calls = 0

    def __call__(self, chat: str, text: str) -> None:
        self.calls += 1
        if self.calls in self.fail_on:
            raise RuntimeError(self.leak or "telegram refused it")
        self.sent.append((chat, text))


# --- the delivery -----------------------------------------------------------------------------------------------


def test_each_waiting_notice_is_sent_to_the_admin_and_then_acknowledged_in_order() -> None:
    api, outbox = NoticeApi([notice(1), notice(2)]), Outbox()

    assert bot.deliver_notices(api, outbox, ADMIN) == 2

    assert outbox.sent == [(ADMIN, notice(1)["body"]), (ADMIN, notice(2)["body"])]
    assert api.events == ["fetch", "ack 1", "ack 2"]  # sent first, then told the app: never the other way round
    assert api.waiting == []


def test_nothing_waiting_sends_nothing() -> None:
    api, outbox = NoticeApi([]), Outbox()

    assert bot.deliver_notices(api, outbox, ADMIN) == 0
    assert outbox.sent == [] and api.events == ["fetch"]


def test_without_an_admin_chat_the_app_is_not_even_asked() -> None:
    """Unset is a legitimate state (R69): the queue simply waits, and nothing is consumed that nobody could read."""
    api, outbox = NoticeApi([notice(1)]), Outbox()

    assert bot.deliver_notices(api, outbox, "") == 0
    assert api.events == [] and outbox.sent == []
    assert api.waiting == [notice(1)]


def test_a_send_that_fails_leaves_the_notice_queued_and_keeps_the_order() -> None:
    api = NoticeApi([notice(1), notice(2), notice(3)])
    outbox = Outbox(fail_on={2})  # the second send fails

    assert bot.deliver_notices(api, outbox, ADMIN) == 1
    assert [n["id"] for n in api.waiting] == [2, 3]  # 2 was not skipped over in favour of 3
    assert "ack 3" not in api.events

    assert bot.deliver_notices(api, outbox, ADMIN) == 2  # the next round picks up where it stopped
    assert [text for _, text in outbox.sent] == [notice(n)["body"] for n in (1, 2, 3)]
    assert api.waiting == []


def test_a_notice_is_not_acknowledged_when_it_was_not_sent() -> None:
    api, outbox = NoticeApi([notice(1)]), Outbox(fail_on={1})

    bot.deliver_notices(api, outbox, ADMIN)

    assert not any(event.startswith("ack") for event in api.events)


def test_an_acknowledgement_that_fails_means_it_is_sent_again_rather_than_lost() -> None:
    """At least once, by design: a duplicate for the admin is better than a registration nobody heard about."""
    api, outbox = NoticeApi([notice(1)], fail_ack=True), Outbox()

    assert bot.deliver_notices(api, outbox, ADMIN) == 0
    assert api.waiting == [notice(1)]

    api.fail_ack = False
    assert bot.deliver_notices(api, outbox, ADMIN) == 1
    assert len(outbox.sent) == 2  # the same notice, twice, and now it is acknowledged
    assert api.waiting == []


def test_an_app_that_cannot_be_reached_is_survived() -> None:
    api, outbox = NoticeApi([notice(1)], fail_fetch=True), Outbox()

    assert bot.deliver_notices(api, outbox, ADMIN) == 0
    assert outbox.sent == []


def test_nothing_printed_holds_the_bots_token_even_when_the_error_does(capsys: pytest.CaptureFixture) -> None:
    """The Telegram URL carries the token, so an exception raised while sending can contain it. The log names the kind
    of failure and nothing else."""
    leaky = f"HTTP Error 502 for https://api.telegram.org/bot{TOKEN}/sendMessage"
    api, outbox = NoticeApi([notice(1)]), Outbox(fail_on={1}, leak=leaky)

    bot.deliver_notices(api, outbox, ADMIN)

    shown = capsys.readouterr()
    assert TOKEN not in shown.out + shown.err and "invented-for-tests" not in shown.out + shown.err
    assert "RuntimeError" in shown.out and "stays queued" in shown.out
    assert "person1" not in shown.out  # nor the notice text: a log line is not where a person's name belongs


# --- the client's two calls ---------------------------------------------------------------------------------------


class Recorder:
    """urllib.request.urlopen for the real client: what was asked, with which headers, answered from a script."""

    def __init__(self, body: bytes) -> None:
        self.requests = []
        self.body = body

    def __call__(self, request, timeout=None):
        self.requests.append(request)
        return io.BytesIO(self.body)


def test_the_client_asks_with_its_secret_and_no_chat(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = Recorder(json.dumps([notice(1)]).encode())
    monkeypatch.setattr(bot.urllib.request, "urlopen", seen)
    api = bot.Api(base="http://app", secret="the-secret")

    assert api.notices() == [notice(1)]
    api.notice_delivered(1)

    fetch, ack = seen.requests
    assert (fetch.get_method(), fetch.full_url) == ("GET", "http://app/api/telegram/notices")
    assert (ack.get_method(), ack.full_url) == ("POST", "http://app/api/telegram/notices/1/delivered")
    for request in (fetch, ack):
        headers = {k.lower(): v for k, v in request.header_items()}
        assert headers["x-bot-secret"] == "the-secret"
        assert "x-telegram-chat" not in headers  # a request for the bot itself names no chat


def test_a_chat_request_still_names_its_chat(monkeypatch: pytest.MonkeyPatch) -> None:
    """The change that let `chat_id` be None must not have loosened the requests that are for a chat."""
    seen = Recorder(b"[]")
    monkeypatch.setattr(bot.urllib.request, "urlopen", seen)

    bot.Api(base="http://app", secret="s").foods("4242")

    assert {k.lower(): v for k, v in seen.requests[0].header_items()}["x-telegram-chat"] == "4242"


# --- the loop that calls it ----------------------------------------------------------------------------------------


def test_the_poll_loop_delivers_notices_to_the_admin_chat(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_ADMIN_CHAT", ADMIN)
    api = NoticeApi([notice(1)])
    telegram = FakeTelegram([])

    run_poll(monkeypatch, telegram, api)

    assert [(m["chat_id"], m["text"]) for m in telegram.sent] == [(ADMIN, notice(1)["body"])]
    assert api.waiting == []


def test_the_poll_loop_leaves_notices_alone_when_no_admin_chat_is_set(monkeypatch: pytest.MonkeyPatch, capsys) -> None:
    monkeypatch.delenv("TELEGRAM_ADMIN_CHAT", raising=False)
    api = NoticeApi([notice(1)])
    telegram = FakeTelegram([])

    run_poll(monkeypatch, telegram, api)

    assert telegram.sent == [] and api.events == [] and api.waiting == [notice(1)]
    assert "admin notices: off" in capsys.readouterr().out  # and it says so, rather than being quietly deaf


def test_a_notice_does_not_get_in_the_way_of_answering_a_message(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_ADMIN_CHAT", ADMIN)
    api = NoticeApi([notice(1)])
    telegram = FakeTelegram([{"update_id": 1, "message": {"chat": {"id": 42}, "text": "/help"}}])

    run_poll(monkeypatch, telegram, api)

    assert sorted(m["chat_id"] for m in telegram.sent) == sorted([ADMIN, "42"])
