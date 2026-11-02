"""How a password is stored, and how it is checked.

Standard library only: `hashlib.pbkdf2_hmac` and `os.urandom` are enough, and a dependency
whose whole job is to call them is a dependency to keep patched for no reason (R21).

The stored value carries its own parameters, in one string:

    pbkdf2_sha256$600000$<salt hex>$<digest hex>

so the iteration count can be raised later without a migration — an old value still verifies
against the parameters it was written with, and the four parts it splits into are all checked
before any of them is used, because a malformed value must fail closed rather than compare
equal to something.

Nothing here is logged, echoed or returned. The hash never leaves this module and the
database.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

ALGORITHM = "pbkdf2_sha256"
# OWASP's figure for PBKDF2-HMAC-SHA256. A stored value carries its own count, so raising this never
# invalidates an old hash; `needs_rehash` is how the old ones catch up.
ITERATIONS = 600_000
SALT_BYTES = 16


def hash_password(password: str, *, iterations: int = ITERATIONS) -> str:
    """A new stored value for this password, with a fresh salt."""
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return f"{ALGORITHM}${iterations}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    """Whether this password matches this stored value.

    Comparison is constant-time, and a value that is missing or malformed returns False
    rather than raising: an account with no usable password is an account nobody signs into,
    which is the safe reading of both.
    """
    if not stored:
        return False

    parts = stored.split("$")
    if len(parts) != 4:
        return False

    algorithm, iterations, salt_hex, digest_hex = parts
    if algorithm != ALGORITHM:
        return False
    try:
        rounds = int(iterations)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
    except ValueError:
        return False

    if rounds < 1 or not salt or not expected:
        return False

    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, rounds)
    return hmac.compare_digest(candidate, expected)



def needs_rehash(stored: str | None) -> bool:
    """Whether a stored value was written with fewer iterations than this build uses."""
    parts = (stored or "").split("$")
    if len(parts) != 4 or parts[0] != ALGORITHM:
        return False
    try:
        return int(parts[1]) < ITERATIONS
    except ValueError:
        return False


# Verified against when a username does not exist, so an unknown user costs the same as a wrong
# password. Made at import time with the current cost; nobody's password hashes to it.
DUMMY_HASH = hash_password(secrets.token_hex(16))
