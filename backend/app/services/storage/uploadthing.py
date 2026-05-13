"""UploadThing implementation of StorageProvider.

UploadThing (https://uploadthing.com) is a file-upload SaaS with a
generous free tier (2 GB, no credit card to start). They expose a REST
API alongside their first-party JS SDK; this module talks to the REST
API directly so the backend stays language-agnostic.

We target the v6 REST surface:
  - POST https://api.uploadthing.com/v6/uploadFiles  — register files
  - POST https://api.uploadthing.com/v6/deleteFiles  — remove files

The v6 endpoints are stable + work with the same API key issued by
the dashboard. v7's `prepareUpload` is similar in shape; if a future
deploy needs it, the changes are localised here.

Flow:
  1. Backend POSTs file metadata to /v6/uploadFiles.
  2. UploadThing returns a presigned URL + form fields + the eventual
     file key + file URL.
  3. Frontend POSTs the file as multipart/form-data to that URL.
  4. Backend confirms the metadata into our DB (key + filename + ...).
  5. Files are served from `https://utfs.io/f/<key>` (public ACL) or
     `https://<appId>.ufs.sh/f/<key>` (per-app subdomain).

File URLs are stable as long as the key exists. ACL is "public-read"
by default — fine for marketing creatives (unguessable keys, but anyone
with the URL can fetch). Locking down via signed URLs would require
ACL="private" + a /requestFileAccess call on every download; we keep
the simple model unless the threat model changes.
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
# v7 introduced per-app subdomains (<appId>.ufs.sh). Older keys still
# resolve under utfs.io; we prefer the per-app form when we know the
# app id (extracted from UPLOADTHING_TOKEN) and fall back otherwise.
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
        # Short timeouts — these are control-plane calls (no bytes).
        # The browser does the heavy lifting against the presigned URL.
        self._client = httpx.Client(
            base_url=API_BASE,
            timeout=15.0,
            headers={
                "x-uploadthing-api-key": api_key,
                "Content-Type": "application/json",
                # UploadThing checks an app version header on some
                # endpoints. Pin to a recent stable.
                "x-uploadthing-version": "6.10.0",
            },
        )

    @classmethod
    def from_token(cls, token: str) -> "UploadThingStorage":
        """Construct from the v7-style UPLOADTHING_TOKEN — a base64
        JSON object carrying apiKey + appId + regions.

        Falls through cleanly if the token isn't actually v7 (raw
        api_key); the caller decides which env var to use."""
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
        """Register an upload + return the presigned POST destination.

        Note: UploadThing assigns its own opaque `key` server-side; the
        `key` argument coming in (e.g. `campaigns/<uuid>/<uuid>.pdf`)
        becomes our `customId` instead, so we can correlate the file
        back to the campaign without a separate lookup. The returned
        `PresignedUpload.storage_key` is UploadThing's assigned key —
        that's what we persist for delete + URL reconstruction.
        """
        _ = expires_in  # UploadThing's presign expiry is fixed server-side.
        # Filename inside UploadThing's bucket. They use the basename
        # of `name` for the file slug; preserve the extension so
        # Content-Type and the rendered preview Just Work.
        # Their `name` field is just for display; the key is what we
        # round-trip in storage_key.
        filename = key.rsplit("/", 1)[-1]
        # ACL: public-read keeps download flows simple (unguessable
        # key + public URL). Marketing creatives don't need signed
        # downloads for v1. Switch to "private" + /requestFileAccess
        # when the threat model demands it.
        body = {
            "files": [
                {
                    "name": filename,
                    "type": content_type,
                    "size": max_size_bytes,
                    # customId lets us look the file up by our own id
                    # later (e.g. for audits) without keeping a map of
                    # uploadthing-key → our-key.
                    "customId": key,
                }
            ],
            "acl": "public-read",
            "contentDisposition": "inline",
        }
        try:
            resp = self._client.post("/v6/uploadFiles", json=body)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.exception("UploadThing presign request failed")
            raise RuntimeError(f"UploadThing presign failed: {e}") from e

        payload = resp.json()
        # Defensive: v6 returns `data` as the array; v7 returns it
        # at the top level. Handle both.
        rows = payload.get("data") or payload.get("files") or payload
        if isinstance(rows, dict):
            rows = [rows]
        if not rows:
            raise RuntimeError(f"UploadThing returned empty payload: {payload!r}")
        row = rows[0]

        upload_url = row.get("url") or row.get("presignedUrl")
        fields = row.get("fields") or {}
        assigned_key = row.get("key") or row.get("fileKey")
        if not (upload_url and assigned_key):
            raise RuntimeError(
                f"UploadThing payload missing url/key: {row!r}"
            )

        return PresignedUpload(
            upload_url=upload_url,
            storage_key=assigned_key,
            method="POST",
            fields=fields,
        )

    def presigned_download(
        self,
        *,
        key: str,
        filename: Optional[str] = None,
        expires_in: int = 3600,
    ) -> str:
        """For public-read files, the file URL itself is the access
        URL — no signing needed. `filename` is ignored here because
        Content-Disposition was set at upload time."""
        _ = filename, expires_in
        if self._app_id:
            return FILE_URL_PER_APP.format(app_id=self._app_id, key=key)
        return FILE_URL_LEGACY.format(key=key)

    def delete(self, *, key: str) -> None:
        """Hit /v6/deleteFiles. Idempotent: an unknown key returns 200
        in UploadThing's contract, no special handling needed."""
        try:
            resp = self._client.post(
                "/v6/deleteFiles", json={"fileKeys": [key]}
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.exception("UploadThing delete failed for key=%s", key)
            raise RuntimeError(f"UploadThing delete failed: {e}") from e
