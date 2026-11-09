import hashlib
import secrets
import time
from collections import deque
from threading import Lock

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import (
    AUTH_HASH_MEMORY,
    AUTH_HASH_PARALLELISM,
    AUTH_HASH_TIME,
    AUTH_RATE_MAX_ATTEMPTS,
    AUTH_RATE_WINDOW_SECONDS,
)

hasher = PasswordHasher(
    memory_cost=AUTH_HASH_MEMORY, time_cost=AUTH_HASH_TIME, parallelism=AUTH_HASH_PARALLELISM
)
_dummy_hash = hasher.hash(secrets.token_urlsafe(32))
_attempts: dict[str, deque] = {}
_lock = Lock()


def hash_password(password: str) -> str:
    return hasher.hash(password)


def verify_password(encoded: str | None, password: str) -> bool:
    try:
        valid = hasher.verify(encoded or _dummy_hash, password)
        return bool(encoded) and valid
    except (VerificationError, InvalidHashError):
        return False


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def allow_attempt(client: str, email: str) -> bool:
    now = time.monotonic()
    with _lock:
        for key in list(_attempts):
            while _attempts[key] and _attempts[key][0] <= now - AUTH_RATE_WINDOW_SECONDS:
                _attempts[key].popleft()
            if not _attempts[key]:
                del _attempts[key]
        keys = ["ip:" + client, "email:" + token_digest(email)]
        if any(len(_attempts.get(key, ())) >= AUTH_RATE_MAX_ATTEMPTS for key in keys):
            return False
        for key in keys:
            _attempts.setdefault(key, deque()).append(now)
        return True
