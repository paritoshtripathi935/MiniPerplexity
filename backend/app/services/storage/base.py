"""Storage provider Protocol + shared types.

Keep this provider-agnostic — no R2/S3/GCS imports here. Adding a new
backend means: write a class that implements StorageProvider, add a
branch in factory.py.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Protocol, runtime_checkable


class StorageNotConfiguredError(RuntimeError):
    """Raised when the active storage provider's env vars are missing.

    Route handlers catch this and return 503 with a clear hint so
    deploys without storage creds still expose the rest of the API.
    """


@dataclass(frozen=True)
class PresignedUpload:
    """Returned by `presigned_upload`.

    Two upload shapes are supported via `method`:
      - "PUT"   — browser sends the raw bytes as the request body,
                  with Content-Type matching what we signed for. Used
                  by S3-compatible backends (R2, S3, GCS, B2).
      - "POST"  — browser sends multipart/form-data with `fields`
                  appended before the file. Used by UploadThing and
                  any provider that gates uploads with policy fields.

    `fields` is empty for PUT-style uploads.
    """
    upload_url: str
    storage_key: str
    method: str
    # Form fields the browser MUST include in the multipart body
    # alongside the file when method=POST. Order matters in S3 POST
    # policy but most providers (UploadThing, S3) accept any order.
    fields: dict = field(default_factory=dict)


@runtime_checkable
class StorageProvider(Protocol):
    """Provider-agnostic interface for object storage.

    A backend that ships should implement *all four* methods. Any
    method that needs server-side bytes (rather than presigned URLs)
    can be added later as a separate Protocol subclass.
    """

    @property
    def name(self) -> str:
        """The provider identifier persisted on each row's `provider`
        column — e.g. 'r2', 's3', 'gcs', 'local'. Used during a
        migration where rows in different backends coexist."""
        ...

    def presigned_upload(
        self,
        *,
        key: str,
        content_type: str,
        max_size_bytes: int,
        expires_in: int = 300,
    ) -> PresignedUpload:
        """Return a presigned URL the browser can PUT/POST a single
        object to. Implementations should encode max_size_bytes into
        the presigned policy so the provider rejects oversized uploads
        before they hit our DB."""
        ...

    def presigned_download(
        self,
        *,
        key: str,
        filename: Optional[str] = None,
        expires_in: int = 3600,
    ) -> str:
        """Return a presigned GET URL the browser can use to fetch the
        object. `filename` (when set) wires Content-Disposition so the
        browser saves under the original name on download."""
        ...

    def delete(self, *, key: str) -> None:
        """Best-effort delete. Idempotent — a missing object is not an
        error (the DB row may have been removed in a previous attempt
        that failed before completing the storage delete)."""
        ...
