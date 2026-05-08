"""Clerk JWT verification.

Clerk publishes a JWKS (JSON Web Key Set) at `<issuer>/.well-known/jwks.json`.
We fetch it once, cache it for `_ttl()`, and verify each
incoming JWT using the public key whose `kid` matches the token header.

Why not use Clerk's official Python SDK? It's session-management-heavy and
mostly aimed at server-rendered apps. For a stateless API, JWT verification
against the JWKS is straightforward and removes a dependency.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx
import jwt
from dotenv import load_dotenv
from jwt import PyJWKSet

# Mirror app.db.config: ensure backend/.env is loaded before any env reads.
load_dotenv()

logger = logging.getLogger(__name__)


def _issuer() -> str:
    return os.getenv("CLERK_JWT_ISSUER", "").rstrip("/")


def _ttl() -> int:
    return int(os.getenv("CLERK_JWKS_TTL_SECONDS", "3600"))


class ClerkAuthError(Exception):
    """Raised when a token cannot be validated."""


@dataclass
class ClerkClaims:
    """The subset of Clerk JWT claims we care about."""

    sub: str
    email: Optional[str] = None
    name: Optional[str] = None
    image_url: Optional[str] = None
    raw: dict = field(default_factory=dict)


class _JWKSCache:
    """Thread-safe (asyncio-safe) JWKS cache with TTL."""

    def __init__(self) -> None:
        self._jwks: Optional[PyJWKSet] = None
        self._fetched_at: float = 0.0
        self._lock = asyncio.Lock()

    async def get(self) -> PyJWKSet:
        if (
            self._jwks is not None
            and (time.time() - self._fetched_at) < _ttl()
        ):
            return self._jwks

        async with self._lock:
            # Double-check inside the lock — another waiter may have refreshed.
            if (
                self._jwks is not None
                and (time.time() - self._fetched_at) < _ttl()
            ):
                return self._jwks

            if not _issuer():
                raise ClerkAuthError(
                    "CLERK_JWT_ISSUER is not set in backend/.env"
                )

            url = f"{_issuer()}/.well-known/jwks.json"
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(url)
                    resp.raise_for_status()
                    self._jwks = PyJWKSet.from_dict(resp.json())
                    self._fetched_at = time.time()
            except Exception as e:
                raise ClerkAuthError(f"Failed to fetch JWKS from {url}: {e}") from e

            return self._jwks


_jwks_cache = _JWKSCache()


async def verify_token(token: str) -> ClerkClaims:
    """Validate a Clerk-issued JWT and return its claims.

    Raises ClerkAuthError on any validation failure (bad signature, expired,
    wrong issuer, missing `sub`).
    """
    if not token:
        raise ClerkAuthError("Missing token")

    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as e:
        raise ClerkAuthError(f"Malformed token header: {e}") from e

    kid = unverified_header.get("kid")
    if not kid:
        raise ClerkAuthError("Token header missing `kid`")

    jwks = await _jwks_cache.get()
    try:
        signing_key = jwks[kid].key
    except KeyError as e:
        # Key rotation: bust the cache once and retry.
        _jwks_cache._fetched_at = 0.0
        jwks = await _jwks_cache.get()
        try:
            signing_key = jwks[kid].key
        except KeyError:
            raise ClerkAuthError(f"No JWKS key matches kid={kid}") from e

    try:
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            issuer=_issuer(),
            options={"require": ["sub", "exp", "iat"]},
        )
    except jwt.ExpiredSignatureError as e:
        raise ClerkAuthError("Token expired") from e
    except jwt.InvalidIssuerError as e:
        raise ClerkAuthError(f"Token issuer mismatch (expected {_issuer()})") from e
    except jwt.PyJWTError as e:
        raise ClerkAuthError(f"Token validation failed: {e}") from e

    return ClerkClaims(
        sub=payload["sub"],
        email=payload.get("email") or payload.get("primary_email_address"),
        name=payload.get("name") or payload.get("full_name"),
        image_url=payload.get("image_url") or payload.get("picture"),
        raw=payload,
    )
