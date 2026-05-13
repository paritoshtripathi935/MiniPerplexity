"""UploadThing implementation of StorageProvider.

UploadThing (https://uploadthing.com) is a file-upload SaaS with a 2 GB
free tier (no credit card to start). They expose a REST API alongside
their first-party JS SDK; this module talks to the REST API directly
so the backend stays language-agnostic.

End-to-end flow (verified against the live API on 2026-05-14):

  1. POST https://api.uploadthing.com/v7/prepareUpload
     Body: { fileName, fileSize, fileType, acl, contentDisposition }
     Returns: { url, key }
       - `url` is a pre-signed ingestion URL with all file metadata in
         query params + an HMAC signature. Valid for ~5 minutes.
       - `key` is the eventual file key, stable for the lifetime of
         the row. We persist this in `storage_key`.

  2. PUT to the returned `url` with the file as multipart/form-data,
     field name "file". The PUT response carries the final CDN URL
     (we ignore it — we derive the URL from `key` + `app_id`).

  3. File is served at `https://<app_id>.ufs.sh/f/<key>` (per-app
     subdomain) or `https://utfs.io/f/<key>` (legacy shared host).
     ACL=public-read keeps download flows simple — unguessable keys,
     anyone-with-the-URL access. Locking down via signed URLs would
     require ACL=private + /requestFileAccess on every download.

  4. POST https://api.uploadthing.com/v6/deleteFiles
     Body: { fileKeys: [key] }
     Returns: { success, deletedCount }. The endpoint stayed on v6 in
     UploadThing's v7 migration; same API key works.

Auth: either `UPLOADTHING_TOKEN` (the v7 base64-encoded JSON token from
the dashboard — preferred, gives us app_id for per-app subdomain URLs)
or `UPLOADTHING_SECRET` (legacy raw "sk_live_..." key — works, but URLs
fall back to utfs.io).
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Optional

import httpx

from app.services.storage.base import (
    PresignedUpload,
    StorageNotConfiguredError,
)

logger = logging.getLogger(__name__)

API_BASE = "https://api.uploadthing.com"
FILE_URL_LEGACY = "https://utfs.io/f/{key}"
FILE_URL_PER_APP = "https://{app_id}.ufs.sh/f/{key}"


class UploadThingStorage:
    """REST-API-driven UploadThing backend. Implements StorageProvider."""

    name: str = "uploadthing"

    def __init__(
        self,
        *,
        api_key: str,
        app_id: Optional[str] = None,
    ) -> None:
        if not api_key:
            raise StorageNotConfiguredError(
                "UploadThing missing API key — set UPLOADTHING_SECRET (the "
                "raw 'sk_live_...' value) or UPLOADTHING_TOKEN (the "
                "base64-encoded JSON token from the dashboard)."
            )
        self._api_key = api_key
        self._app_id = app_id
        # Short timeouts — control-plane only; no bytes flow through
        # this client. The browser does the heavy lifting.
        self._client = httpx.Client(
            base_url=API_BASE,
            timeout=15.0,
            headers={
                "x-uploadthing-api-key": api_key,
                "Content-Type": "application/json",
            },
        )

    @classmethod
    def from_token(cls, token: str) -> "UploadThingStorage":
        """Construct from the v7-style UPLOADTHING_TOKEN — a base64
        JSON object carrying apiKey + appId + regions."""
        try:
            decoded = base64.b64decode(token).decode("utf-8")
            obj = json.loads(decoded)
            return cls(api_key=obj["apiKey"], app_id=obj.get("appId"))
        except (ValueError, KeyError, json.JSONDecodeError) as e:
            raise StorageNotConfiguredError(
                f"UPLOADTHING_TOKEN is not a valid v7 token: {e}. "
                "Use UPLOADTHING_SECRET for raw API keys instead."
            ) from e

    def presigned_upload(
        self,
        *,
        key: str,
        content_type: str,
        max_size_bytes: int,
        expires_in: int = 300,
    ) -> PresignedUpload:
        """Register an upload via /v7/prepareUpload.

        Note: UploadThing assigns its own opaque storage key
        server-side — we don't get to specify it. The `key` arg coming
        in (e.g. `campaigns/<uuid>/<uuid>.<ext>`) is reduced to just
        the filename for display; the returned `PresignedUpload.
        storage_key` is what UploadThing assigned.
        """
        _ = expires_in  # UploadThing's presign expiry is fixed server-side.
        # Use the basename so UploadThing's "x-ut-file-name" reflects
        # something useful. The DB row keeps the original `filename`
        # from the user; this is purely an UploadThing-side label.
        filename = key.rsplit("/", 1)[-1]
        body = {
            "fileName": filename,
            "fileSize": max_size_bytes,
            "fileType": content_type,
            # public-read keeps download flows simple. Unguessable
            # keys are the access-control mechanism.
            "acl": "public-read",
            "contentDisposition": "inline",
        }
        try:
            resp = self._client.post("/v7/prepareUpload", json=body)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            # Include the response body in logs — UploadThing's 400s
            # usually carry a useful "expected X, got Y" payload.
            logger.warning(
                "UploadThing /v7/prepareUpload failed: status=%s body=%s",
                e.response.status_code,
                e.response.text[:500],
            )
            raise RuntimeError(
                f"UploadThing presign failed ({e.response.status_code}): "
                f"{e.response.text[:200]}"
            ) from e
        except httpx.HTTPError as e:
            logger.exception("UploadThing presign request failed")
            raise RuntimeError(f"UploadThing presign failed: {e}") from e

        payload = resp.json()
        upload_url = payload.get("url")
        assigned_key = payload.get("key")
        if not (upload_url and assigned_key):
            raise RuntimeError(
                f"UploadThing payload missing url/key: {payload!r}"
            )

        # The PUT below at the returned URL must use multipart/form-data
        # with the file under field name "file". Verified against the
        # live ingestion endpoint — raw-body PUTs return 415.
        return PresignedUpload(
            upload_url=upload_url,
            storage_key=assigned_key,
            method="PUT",
            body_field="file",
            fields={},
        )

    def presigned_download(
        self,
        *,
        key: str,
        filename: Optional[str] = None,
        expires_in: int = 3600,
    ) -> str:
        """For public-read files the CDN URL itself is the access URL —
        no signing needed. `filename` is ignored: Content-Disposition was
        set at upload time (inline → browser renders inline, attachment
        → browser downloads). UploadThing files are accessed at:

            https://<app_id>.ufs.sh/f/<key>       (per-app, v7)
            https://utfs.io/f/<key>               (legacy shared)

        We prefer the per-app subdomain when app_id is known (extracted
        from the v7 token); legacy mode falls back to utfs.io.
        """
        _ = filename, expires_in
        if self._app_id:
            return FILE_URL_PER_APP.format(app_id=self._app_id, key=key)
        return FILE_URL_LEGACY.format(key=key)

    def delete(self, *, key: str) -> None:
        """POST /v6/deleteFiles. Idempotent: an unknown key returns 200
        with deletedCount=0 (verified against the live API). The
        delete-files endpoint stayed on v6 in UploadThing's v7
        migration; same API key works.
        """
        try:
            resp = self._client.post(
                "/v6/deleteFiles", json={"fileKeys": [key]}
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.exception("UploadThing delete failed for key=%s", key)
            raise RuntimeError(f"UploadThing delete failed: {e}") from e
