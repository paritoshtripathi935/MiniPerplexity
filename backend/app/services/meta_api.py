"""Meta Marketing API client + OAuth token crypto.

Two responsibilities, kept in one file because they're tightly coupled
in lifecycle (the client uses the crypto helper to read tokens out of
the DB):

  1. Fernet-based encryption for OAuth tokens at rest. The key lives in
     META_TOKEN_SECRET. Plaintext tokens never reach the DB; ciphertext
     (bytea) never leaves it.
  2. A thin async client for the Meta Graph API: OAuth code-for-token
     exchange, long-lived token swap, /me/adaccounts proxy, plus the
     ground-floor /act_<id>/insights call we'll need in Phase 2.

What this file does NOT do: HTTP routing, request validation, or DB
writes. That belongs to the route handlers in api/v1/integrations.py
and the repository functions. Keep this layer pure / replaceable.

Phase 1 ships everything except a real-data sync — insights() is
defined here for completeness but not called from any route yet.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken

from app.constants.constants import (
    META_APP_ID,
    META_APP_SECRET,
    META_GRAPH_API_VERSION,
    META_OAUTH_REDIRECT_URI,
    META_TOKEN_SECRET,
)

logger = logging.getLogger(__name__)


# ---------- Config gate ------------------------------------------------------

class MetaNotConfiguredError(RuntimeError):
    """Raised when a Meta-dependent code path runs without env credentials.

    Route handlers catch this and return 503 with a clear "set
    META_APP_ID / META_APP_SECRET / META_TOKEN_SECRET in env" hint, so
    the rest of the API still works in environments where Meta isn't
    wired up yet (CI, local dev without creds, fresh Render deploy).
    """


def _require_app_credentials() -> tuple[str, str, str]:
    if not (META_APP_ID and META_APP_SECRET and META_OAUTH_REDIRECT_URI):
        raise MetaNotConfiguredError(
            "Meta App credentials missing — set META_APP_ID, "
            "META_APP_SECRET, and META_OAUTH_REDIRECT_URI in env."
        )
    return META_APP_ID, META_APP_SECRET, META_OAUTH_REDIRECT_URI


def is_configured() -> bool:
    """Return True iff Meta env vars are populated. Route handlers use
    this to decide between rendering 'connect Meta' vs 'integration not
    available on this deploy'."""
    return bool(
        META_APP_ID
        and META_APP_SECRET
        and META_OAUTH_REDIRECT_URI
        and META_TOKEN_SECRET
    )


# ---------- Token crypto -----------------------------------------------------

def _fernet() -> Fernet:
    if not META_TOKEN_SECRET:
        raise MetaNotConfiguredError(
            "META_TOKEN_SECRET missing — generate with "
            "`python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\"` and set in env."
        )
    return Fernet(META_TOKEN_SECRET.encode())


def encrypt_token(plaintext: str) -> bytes:
    """Encrypt an OAuth token for storage in provider_connections.

    Returns bytea-compatible ciphertext. Re-encrypting the same value
    yields different ciphertext each time (fernet includes a random IV)
    so callers must not compare ciphertexts for equality.
    """
    return _fernet().encrypt(plaintext.encode("utf-8"))


def decrypt_token(ciphertext: bytes) -> str:
    """Decrypt a token from the DB. Raises InvalidToken if the
    META_TOKEN_SECRET has been rotated and the token was encrypted with
    a now-retired key — callers should treat that as "force the user to
    re-OAuth" rather than as an internal error.
    """
    try:
        return _fernet().decrypt(ciphertext).decode("utf-8")
    except InvalidToken:
        # Re-raise unchanged so route handlers can catch + 401.
        raise


# ---------- OAuth + Graph API ----------------------------------------------

GRAPH_BASE = f"https://graph.facebook.com/{META_GRAPH_API_VERSION}"
OAUTH_DIALOG = "https://www.facebook.com/" + META_GRAPH_API_VERSION + "/dialog/oauth"
# v1 scope: read-only marketing-api access. ads_management would let us
# pause / unpause campaigns, but we have no reason to write back yet.
OAUTH_SCOPES = ["ads_read"]


@dataclass(frozen=True)
class MetaTokenResponse:
    """What Meta returns from the code-for-token endpoint."""
    access_token: str
    token_type: str
    expires_in: int  # seconds


def build_authorize_url(state: str) -> str:
    """Return the Facebook OAuth dialog URL the user should be redirected
    to. `state` is the CSRF token we'll match in the callback."""
    app_id, _, redirect_uri = _require_app_credentials()
    qs = urlencode(
        {
            "client_id": app_id,
            "redirect_uri": redirect_uri,
            "state": state,
            "scope": ",".join(OAUTH_SCOPES),
            # `response_type=code` is the default; explicit is clearer.
            "response_type": "code",
        }
    )
    return f"{OAUTH_DIALOG}?{qs}"


async def exchange_code_for_token(code: str) -> MetaTokenResponse:
    """Trade the OAuth `code` for a short-lived access token. The token
    Meta returns here lasts ~1 hour; callers should immediately upgrade
    to a long-lived one via `exchange_for_long_lived_token`."""
    app_id, app_secret, redirect_uri = _require_app_credentials()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{GRAPH_BASE}/oauth/access_token",
            params={
                "client_id": app_id,
                "client_secret": app_secret,
                "redirect_uri": redirect_uri,
                "code": code,
            },
        )
    if resp.status_code != 200:
        logger.warning("Meta code exchange failed: %s %s", resp.status_code, resp.text)
        resp.raise_for_status()
    payload = resp.json()
    return MetaTokenResponse(
        access_token=payload["access_token"],
        token_type=payload.get("token_type", "bearer"),
        expires_in=int(payload.get("expires_in", 3600)),
    )


async def exchange_for_long_lived_token(short_token: str) -> MetaTokenResponse:
    """Trade a short-lived user token for a ~60-day long-lived one. This
    is the token we actually persist."""
    app_id, app_secret, _ = _require_app_credentials()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{GRAPH_BASE}/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": app_id,
                "client_secret": app_secret,
                "fb_exchange_token": short_token,
            },
        )
    if resp.status_code != 200:
        logger.warning(
            "Meta long-lived swap failed: %s %s", resp.status_code, resp.text
        )
        resp.raise_for_status()
    payload = resp.json()
    return MetaTokenResponse(
        access_token=payload["access_token"],
        token_type=payload.get("token_type", "bearer"),
        # Meta's long-lived tokens default to ~5,184,000s (60 days). The
        # actual value comes back in `expires_in`.
        expires_in=int(payload.get("expires_in", 60 * 24 * 3600)),
    )


def token_expiry_from_now(expires_in_seconds: int) -> datetime:
    """Convert Meta's `expires_in` (seconds-from-now) to an absolute
    timestamptz suitable for the DB column."""
    return datetime.now(tz=timezone.utc) + timedelta(seconds=expires_in_seconds)


# ---------- /me ---------------------------------------------------------------

@dataclass(frozen=True)
class MetaUser:
    id: str
    name: Optional[str]


async def fetch_me(access_token: str) -> MetaUser:
    """Resolve the Facebook user id for the OAuth'd account. Used as the
    `external_user_id` on the provider_connections row."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{GRAPH_BASE}/me",
            params={"access_token": access_token, "fields": "id,name"},
        )
    resp.raise_for_status()
    payload = resp.json()
    return MetaUser(id=payload["id"], name=payload.get("name"))


# ---------- /me/adaccounts ---------------------------------------------------

@dataclass(frozen=True)
class MetaAdAccount:
    id: str                 # "act_1234567890" — the Graph API form
    name: str
    currency: str
    timezone_name: str
    account_status: int     # 1 = ACTIVE; see Marketing API docs for the full enum
    is_active: bool


_AD_ACCOUNT_FIELDS = "id,name,account_status,currency,timezone_name"


async def list_ad_accounts(access_token: str) -> list[MetaAdAccount]:
    """Return every ad account the OAuth'd user can read. Paginated by
    Meta; we walk all pages because users with >25 accounts (agencies)
    would otherwise see a truncated list."""
    results: list[MetaAdAccount] = []
    url = f"{GRAPH_BASE}/me/adaccounts"
    params: dict[str, str] = {"fields": _AD_ACCOUNT_FIELDS, "access_token": access_token}
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            payload = resp.json()
            for row in payload.get("data", []):
                results.append(
                    MetaAdAccount(
                        id=row["id"],
                        name=row.get("name", row["id"]),
                        currency=row.get("currency", "USD"),
                        timezone_name=row.get("timezone_name", "UTC"),
                        account_status=int(row.get("account_status", 0)),
                        is_active=int(row.get("account_status", 0)) == 1,
                    )
                )
            next_page = (payload.get("paging") or {}).get("next")
            if not next_page:
                break
            # Subsequent pages encode params in the cursor URL; clear ours.
            url, params = next_page, {}
    return results


# ---------- /act_<id>/insights (Phase 2 surface; defined now so the contract
# is reviewable) -------------------------------------------------------------

INSIGHTS_FIELDS = (
    "spend,impressions,clicks,ctr,cpm,cpc,reach,frequency,"
    "actions,action_values,cost_per_action_type,"
    "campaign_id,campaign_name,date_start,date_stop"
)


async def fetch_daily_insights(
    access_token: str,
    external_account_id: str,
    *,
    since: str,
    until: str,
) -> list[dict]:
    """Pull daily, campaign-level insights for an ad account over the
    given (inclusive) date range. Returns the raw `data` array from
    Meta; the caller normalises into `ad_insights_daily` rows.

    Phase 1 ships this for contract review; the actual sync pipeline
    that calls it lands in Phase 2.
    """
    params = {
        "access_token": access_token,
        "fields": INSIGHTS_FIELDS,
        "time_increment": "1",
        "level": "campaign",
        "time_range": '{"since":"%s","until":"%s"}' % (since, until),
        "limit": "500",
    }
    rows: list[dict] = []
    url = f"{GRAPH_BASE}/{external_account_id}/insights"
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            payload = resp.json()
            rows.extend(payload.get("data", []))
            next_page = (payload.get("paging") or {}).get("next")
            if not next_page:
                break
            url, params = next_page, {}
    return rows
