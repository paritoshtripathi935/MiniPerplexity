"""Object storage abstraction.

Single Protocol that the route layer talks to; the concrete provider is
picked via the STORAGE_PROVIDER env var (default: 'r2'). Adding a new
provider is one new file plus a branch in `get_storage()`.

Design notes:
  - Reads + writes go through *presigned URLs*, not server-side upload.
    The browser PUTs/GETs directly. Backend's job is to sign URLs +
    record metadata, so we never hold large files in process memory.
  - Keys are opaque from the route layer's perspective. The storage
    layer chooses key shape (e.g. campaigns/<uuid>/<uuid>.<ext>) and
    returns it as part of the presigned-upload payload; the caller
    persists it to the DB.
  - Errors that mean "provider not configured" raise
    StorageNotConfiguredError; route handlers catch + 503.
"""
from __future__ import annotations

from app.services.storage.base import (
    PresignedUpload,
    StorageProvider,
    StorageNotConfiguredError,
)
from app.services.storage.factory import get_storage, is_storage_configured

__all__ = [
    "PresignedUpload",
    "StorageProvider",
    "StorageNotConfiguredError",
    "get_storage",
    "is_storage_configured",
]
