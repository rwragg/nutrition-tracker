"""A small in-process limiter for the routes a stranger can hammer.

Standard library only, and deliberately in memory: it resets when the container restarts, and it is per
process. For one container that is the whole deployment; a second container would need a shared store,
and that is a decision for hosting (R30), not for this file.

`check` records an attempt and refuses with 429 once a key has made too many in the window. A route that
should only count failures calls `check` only when it fails, and `clear` when it succeeds.
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


class Limiter:
    """At most `limit` attempts per key in any `window` seconds."""

    def __init__(self, limit: int, window: float, what: str) -> None:
        self.limit = limit
        self.window = window
        self.what = what
        self.attempts: dict[str, deque[float]] = defaultdict(deque)

    def _recent(self, key: str) -> deque[float]:
        attempts = self.attempts[key]
        cutoff = time.monotonic() - self.window
        while attempts and attempts[0] <= cutoff:
            attempts.popleft()
        if not attempts:
            del self.attempts[key]
            return self.attempts[key]
        return attempts

    def blocked(self, key: str) -> bool:
        """Whether this key is already at its limit, without counting another attempt."""
        return len(self._recent(key)) >= self.limit

    def refuse_if_blocked(self, key: str) -> None:
        if self.blocked(key):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"too many {self.what}; wait a few minutes and try again",
            )

    def record(self, key: str) -> None:
        self._recent(key).append(time.monotonic())

    def check(self, key: str) -> None:
        """Count an attempt and refuse if it is over the limit."""
        self.refuse_if_blocked(key)
        self.record(key)

    def clear(self, key: str) -> None:
        self.attempts.pop(key, None)

    def reset(self) -> None:
        self.attempts.clear()


def client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


# Failed sign-ins, counted per username and per address, so one address cannot walk through many
# usernames and many addresses cannot walk through one. A success clears the username's count.
LOGIN_FAILURES_BY_USER = Limiter(limit=10, window=15 * 60, what="failed sign-ins")
LOGIN_FAILURES_BY_ADDRESS = Limiter(limit=30, window=15 * 60, what="failed sign-ins")

# Every registration counts, because each one costs a password hash and a row.
REGISTRATIONS = Limiter(limit=20, window=60 * 60, what="registrations")

# Failed attempts to redeem a pairing code, per chat.
BIND_FAILURES = Limiter(limit=10, window=15 * 60, what="failed link attempts")

ALL = (LOGIN_FAILURES_BY_USER, LOGIN_FAILURES_BY_ADDRESS, REGISTRATIONS, BIND_FAILURES)
