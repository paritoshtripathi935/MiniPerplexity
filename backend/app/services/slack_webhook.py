"""Slack incoming-webhook client + block-kit payload builders.

Design decisions for the v1 spike:

  - WEBHOOK-only. The user pastes their Slack workspace's incoming-webhook
    URL (https://hooks.slack.com/services/T.../B.../xxx) and we POST
    JSON to it. No OAuth handshake, no token rotation, no app review.
    Trade-off: we can't read channel lists or post as a real bot user
    yet; that's an explicit v2 lift.
  - Webhook URL is encrypted at rest using the same Fernet key Meta uses
    (META_TOKEN_SECRET). Don't introduce a second secret — the key is
    already provisioned in every prod env that runs the backend.
  - The validate step (called from the connect endpoint) does a *real*
    POST to the URL before persisting anything, so we never store a
    dead webhook. The validation message identifies itself so a user
    immediately sees "PaidPilot just connected to this channel" in
    their Slack — beats a silent "connected" toast.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx

from app.services.meta_api import decrypt_token, encrypt_token  # noqa: F401 — re-export the same Fernet helpers

logger = logging.getLogger(__name__)


class SlackWebhookError(Exception):
    """Raised on any failure communicating with a Slack webhook —
    invalid URL, HTTP error, Slack rejection. Surface the message to
    the user verbatim; Slack returns useful errors ("no_service",
    "channel_not_found", etc.) and we want them to land in the UI."""


_SLACK_WEBHOOK_HOST = "hooks.slack.com"
_HTTP_TIMEOUT_S = 10.0
_MAX_EXCERPT_CHARS = 320  # ~3 lines in a Slack section block


def validate_webhook_url(url: str) -> None:
    """Cheap structural check. Catches typos and obviously-wrong inputs
    before we burn an HTTP round-trip on them.

    Raises SlackWebhookError with a user-friendly message on any
    structural problem."""
    if not url or not isinstance(url, str):
        raise SlackWebhookError("webhook url required")
    parsed = urlparse(url.strip())
    if parsed.scheme != "https":
        raise SlackWebhookError("webhook url must start with https://")
    if parsed.netloc != _SLACK_WEBHOOK_HOST:
        raise SlackWebhookError(
            f"webhook host must be {_SLACK_WEBHOOK_HOST} (got {parsed.netloc or 'empty'})"
        )
    # Slack webhook paths are /services/<team>/<bot>/<token> — at least
    # 4 path segments after the leading slash.
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 4 or parts[0] != "services":
        raise SlackWebhookError(
            "webhook url path looks malformed — expected /services/<team>/<bot>/<token>"
        )


async def post_to_webhook(webhook_url: str, payload: Dict[str, Any]) -> None:
    """Send a JSON payload to a Slack incoming webhook.

    Slack returns 200 'ok' on success, plain-text error names on
    failure ('no_service', 'channel_is_archived', etc.). We surface
    both via SlackWebhookError so the calling endpoint can echo them
    to the UI without further translation."""
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_S) as client:
            resp = await client.post(webhook_url, json=payload)
    except httpx.HTTPError as e:
        # Log includes the URL prefix only — never the secret token at
        # the end of the URL.
        logger.error(
            "Slack webhook POST failed: %s (url prefix=%s…)", e, webhook_url[:48]
        )
        raise SlackWebhookError(f"slack request failed: {e}") from e

    if resp.status_code >= 400:
        body = resp.text[:500]
        logger.error(
            "Slack webhook returned %s: %s", resp.status_code, body
        )
        raise SlackWebhookError(
            f"slack rejected the webhook ({resp.status_code}): {body}"
        )
    # Successful posts return body 'ok' — no payload to parse.


def build_test_message_blocks() -> List[Dict[str, Any]]:
    """Block-kit payload for the connect-time validation POST. Doubles
    as the message a user sees in their Slack workspace once connection
    succeeds — confirms the URL is wired to the channel they expected."""
    return [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "👋 PaidPilot is connected",
                "emoji": True,
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    "share investigations from <https://paidpilot.netlify.app|PaidPilot> "
                    "to this channel with one click."
                ),
            },
        },
    ]


def build_investigation_blocks(
    *,
    title: str,
    excerpt: str,
    citation_count: int,
    session_url: Optional[str],
    campaign_name: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Block-kit payload for the 'share to slack' button on a finished
    assistant turn. Header + section with question/excerpt + context
    line carrying citation count, campaign chip, and a clickable link
    back to the source investigation."""
    clean_title = (title or "untitled investigation").strip()
    clean_excerpt = (excerpt or "").strip()
    if len(clean_excerpt) > _MAX_EXCERPT_CHARS:
        clean_excerpt = clean_excerpt[: _MAX_EXCERPT_CHARS - 1].rstrip() + "…"

    context_bits: List[str] = []
    if citation_count > 0:
        context_bits.append(f"📎 {citation_count} citation{'' if citation_count == 1 else 's'}")
    if campaign_name:
        context_bits.append(f"🏷 {campaign_name}")
    if session_url:
        context_bits.append(f"<{session_url}|open in PaidPilot>")

    blocks: List[Dict[str, Any]] = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "🧠 new insight from PaidPilot",
                "emoji": True,
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*{clean_title}*\n\n_{clean_excerpt or '(empty answer — open in PaidPilot to view)'}_",
            },
        },
    ]
    if context_bits:
        blocks.append(
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": " · ".join(context_bits)}
                ],
            }
        )
    return blocks


def mask_webhook_url(url: str) -> str:
    """Return a safe-to-display form of the webhook URL — preserves
    enough of the URL for a user to recognise it ("yes that's the
    team/channel I configured") but elides the token at the tail so
    it never leaks into the UI or logs."""
    if not url:
        return ""
    try:
        parsed = urlparse(url)
    except Exception:
        return url[:40] + "…"
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) >= 3:
        # /services/<team>/<bot>/<token>  →  show team + bot, mask token
        return f"https://{parsed.netloc}/{parts[0]}/{parts[1]}/{parts[2]}/•••"
    return url[:40] + "…"
