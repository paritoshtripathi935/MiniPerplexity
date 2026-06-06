"""Re-rank search results by domain authority for performance marketers.

Scores and thresholds come from config/domain_authority.yaml — edit there
to tune rankings without touching code.
"""
from __future__ import annotations

import logging
from typing import Iterable, Optional
from urllib.parse import urlparse

from app.core.config import config as _cfg

logger = logging.getLogger(__name__)

_SCORES: dict[str, int] = _cfg.domain_authority.scores
_DEFAULT = _cfg.domain_authority.defaults.authority
_FLOOR = _cfg.domain_authority.defaults.floor
_AUTHORITATIVE_THRESHOLD = _cfg.domain_authority.defaults.authoritative_threshold


def _domain(url: str) -> str:
    try:
        host = urlparse(url).hostname or ""
        return host.lower().lstrip("www.")
    except Exception:  # noqa: BLE001
        return ""


def authority_for(url: str) -> int:
    host = _domain(url)
    if not host:
        return _DEFAULT
    if host in _SCORES:
        return _SCORES[host]
    # Suffix match — `help.shopify.com` picks up `shopify.com`.
    parts = host.split(".")
    for i in range(1, len(parts)):
        suffix = ".".join(parts[i:])
        if suffix in _SCORES:
            return _SCORES[suffix]
    return _DEFAULT


def tag_authority_in_place(results: Iterable[dict]) -> None:
    """Stamp each result with `_authority` (raw score) and `_authoritative`.

    Existing `_authority` values are preserved so we don't downgrade a result
    already scored upstream.
    """
    for r in results:
        score = r.get("_authority")
        if score is None:
            score = authority_for(r.get("url", ""))
            r["_authority"] = score
        r["_authoritative"] = score >= _AUTHORITATIVE_THRESHOLD


def rerank(
    results: Iterable[dict],
    *,
    llm_scores: Optional[dict[int, int]] = None,
) -> list[dict]:
    """Sort by (authority desc, original_index asc), preserving ties.

    Tags each result with `_authority` and `_authoritative`. When `llm_scores`
    is supplied it overrides static authority; static is still used for the
    badge threshold and as a fallback for unscored results.
    """
    enumerated = list(enumerate(results))
    scored = []
    for idx, r in enumerated:
        url = r.get("url", "")
        score = llm_scores[idx] if (llm_scores is not None and idx in llm_scores) else max(authority_for(url), _FLOOR)
        tagged = dict(r)
        tagged["_authority"] = score
        tagged["_authoritative"] = score >= _AUTHORITATIVE_THRESHOLD
        scored.append((idx, score, tagged))

    scored.sort(key=lambda t: (-t[1], t[0]))
    return [t[2] for t in scored]
