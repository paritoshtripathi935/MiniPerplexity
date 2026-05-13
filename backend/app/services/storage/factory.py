"""Storage provider factory.

`get_storage()` picks the active backend off the STORAGE_PROVIDER env
var. Returns a singleton — the boto3 client is stateless and safe to
share across requests. Re-instantiating per-request would re-run TLS
handshakes for the first presign on each request.

Adding a new backend:
  1. Implement StorageProvider in a new module (e.g. s3.py).
  2. Import + add a branch here.
  3. Add the relevant env vars to constants.py.
"""
from __future__ import annotations

from threading import Lock
from typing import Optional

from app.constants.constants import (
    R2_ACCESS_KEY_ID,
    R2_ACCOUNT_ID,
    R2_BUCKET_NAME,
    R2_SECRET_ACCESS_KEY,
    STORAGE_PROVIDER,
)
from app.services.storage.base import (
    StorageNotConfiguredError,
    StorageProvider,
)

_singleton: Optional[StorageProvider] = None
_lock = Lock()


def is_storage_configured() -> bool:
    """Cheap predicate the /integrations/status endpoint + UI can call.

    True iff the active provider has every env var it needs. Doesn't
    instantiate the client, so no boto3 import on the happy path of
    'not configured yet'."""
    provider = (STORAGE_PROVIDER or "r2").lower()
    if provider == "r2":
        return all(
            [R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME]
        )
    return False


def get_storage() -> StorageProvider:
    """Return the configured storage backend.

    Raises StorageNotConfiguredError if env vars are missing. Route
    handlers wrap this in try/except and 503 on miss.
    """
    global _singleton
    if _singleton is not None:
        return _singleton

    with _lock:
        # Double-checked: another request may have raced to construct.
        if _singleton is not None:
            return _singleton

        provider = (STORAGE_PROVIDER or "r2").lower()
        if provider == "r2":
            # Local import — keeps boto3 off the hot path until storage
            # is actually used. Important for cold-start latency.
            from app.services.storage.r2 import R2Storage

            _singleton = R2Storage(
                account_id=R2_ACCOUNT_ID or "",
                access_key_id=R2_ACCESS_KEY_ID or "",
                secret_access_key=R2_SECRET_ACCESS_KEY or "",
                bucket=R2_BUCKET_NAME or "",
            )
        else:
            raise StorageNotConfiguredError(
                f"Unknown STORAGE_PROVIDER='{provider}'. "
                "Supported: 'r2' (today)."
            )
        return _singleton


def reset_storage_for_tests() -> None:
    """Test helper — drops the singleton so tests can swap env vars
    and re-instantiate. Not used in production."""
    global _singleton
    with _lock:
        _singleton = None
