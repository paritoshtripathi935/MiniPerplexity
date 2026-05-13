"""Cloudflare R2 implementation of StorageProvider.

R2 exposes an S3-compatible API, so boto3's S3 client works directly —
we just point `endpoint_url` at the R2 hostname. Presigned URLs are
generated client-side (no network call), so the constructor is cheap
and re-use across requests is fine.

R2-specific notes:
  - Region must be 'auto' (R2 ignores it but boto3 requires *something*).
  - `addressing_style='virtual'` keeps URLs short and matches what R2
    documents. The default 'auto' sometimes picks path-style which
    works but is uglier.
  - Signature version must be 'v4' (R2 doesn't accept v2).
"""
from __future__ import annotations

import logging
from typing import Optional

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.services.storage.base import (
    PresignedUpload,
    StorageNotConfiguredError,
)

logger = logging.getLogger(__name__)


class R2Storage:
    """S3-compatible Cloudflare R2 backend. Implements StorageProvider."""

    name: str = "r2"

    def __init__(
        self,
        *,
        account_id: str,
        access_key_id: str,
        secret_access_key: str,
        bucket: str,
    ) -> None:
        if not (account_id and access_key_id and secret_access_key and bucket):
            raise StorageNotConfiguredError(
                "R2 missing env vars — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, "
                "R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME."
            )
        self._bucket = bucket
        self._client = boto3.client(
            service_name="s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name="auto",
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "virtual"},
                # Reasonable defaults for presigned-URL ops — no large
                # response bodies, no retries that would delay the user.
                retries={"max_attempts": 2, "mode": "standard"},
            ),
        )

    def presigned_upload(
        self,
        *,
        key: str,
        content_type: str,
        max_size_bytes: int,
        expires_in: int = 300,
    ) -> PresignedUpload:
        """Generate a presigned PUT URL.

        Note: S3-style PUT presigning *cannot* enforce a hard
        max-size at the provider — that's only available via the
        POST policy form. We expose max_size_bytes here for the
        Protocol contract; enforcement happens at the application
        layer (we reject oversize on the confirm-upload endpoint by
        re-checking ContentLength via HEAD). For now we just record
        the requested cap so callers can warn the user; a future
        v2 could switch to POST policy if we need server-enforced
        size limits.
        """
        _ = max_size_bytes  # Reserved for future POST-policy variant.
        try:
            url = self._client.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": self._bucket,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires_in,
                HttpMethod="PUT",
            )
        except ClientError as e:
            logger.exception("R2 presigned PUT failed for key=%s", key)
            raise RuntimeError(f"R2 presign failed: {e}") from e
        return PresignedUpload(
            upload_url=url,
            storage_key=key,
            method="PUT",
        )

    def presigned_download(
        self,
        *,
        key: str,
        filename: Optional[str] = None,
        expires_in: int = 3600,
    ) -> str:
        params: dict = {"Bucket": self._bucket, "Key": key}
        if filename:
            # Force the original filename on download. RFC 6266 quoted
            # form so spaces / non-ASCII are preserved.
            safe = filename.replace('"', "")
            params["ResponseContentDisposition"] = (
                f'attachment; filename="{safe}"'
            )
        try:
            return self._client.generate_presigned_url(
                ClientMethod="get_object",
                Params=params,
                ExpiresIn=expires_in,
                HttpMethod="GET",
            )
        except ClientError as e:
            logger.exception("R2 presigned GET failed for key=%s", key)
            raise RuntimeError(f"R2 presign GET failed: {e}") from e

    def delete(self, *, key: str) -> None:
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
        except ClientError as e:
            # 404 from S3 is "already gone" — that's fine for our
            # idempotent-delete contract. Anything else bubbles up.
            code = e.response.get("Error", {}).get("Code")
            if code in {"NoSuchKey", "404"}:
                return
            logger.exception("R2 delete failed for key=%s", key)
            raise
