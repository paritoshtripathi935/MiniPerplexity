"""Re-rank search results by domain authority for performance marketers.

The default web-search ranking surfaces too many SEO-farm blogs. We push
authoritative marketing sources to the top so the assistant's citations
look credible to a senior marketer.

Algorithm: each source domain gets an authority score; results are sorted by
(authority desc, original position asc). No domain is hidden — just reordered.
"""
from __future__ import annotations

import logging
from typing import Iterable
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


# Hand-curated. Higher = more authoritative for marketing topics.
# 100 = official platform docs (canonical truth)
#  90 = trade press with editorial standards
#  80 = analyst / research houses
#  70 = respected practitioner blogs / agencies
#  60 = communities w/ uneven quality (Reddit, Quora)
#  default = 50
DOMAIN_AUTHORITY: dict[str, int] = {
    # ----- Platform docs (canonical) -----
    "business.facebook.com":              100,
    "developers.facebook.com":            100,
    "transparency.meta.com":              100,
    "facebook.com":                        90,
    "ads.google.com":                     100,
    "support.google.com":                 100,
    "google.com":                          85,
    "developers.google.com":              100,
    "transparencyreport.google.com":      100,
    "ads.tiktok.com":                     100,
    "tiktok.com":                          85,
    "business.tiktok.com":                100,
    "business.linkedin.com":              100,
    "linkedin.com":                        80,
    "ads.x.com":                          100,
    "advertising.amazon.com":             100,
    "marketing.snapchat.com":             100,
    "business.pinterest.com":             100,
    "ads.reddit.com":                     100,
    "developers.reddit.com":              100,

    # ----- Analyst & research -----
    "emarketer.com":                       95,
    "insiderintelligence.com":             95,
    "statista.com":                        90,
    "forrester.com":                       90,
    "gartner.com":                         90,
    "pewresearch.org":                     90,
    "thinkwithgoogle.com":                 95,
    "comscore.com":                        85,

    # ----- Trade press -----
    "adweek.com":                          90,
    "adage.com":                           90,
    "marketingweek.com":                   88,
    "campaignlive.com":                    88,
    "searchengineland.com":                90,
    "searchenginejournal.com":             85,
    "marketingland.com":                   85,
    "marketingdive.com":                   88,
    "digiday.com":                         90,
    "modernretail.co":                     85,
    "retaildive.com":                      82,
    "businessinsider.com":                 80,
    "techcrunch.com":                      80,

    # ----- Practitioner blogs / agencies -----
    "wordstream.com":                      80,
    "adespresso.com":                      80,
    "neilpatel.com":                       70,
    "smartblogger.com":                    65,
    "clickz.com":                          75,
    "moz.com":                             80,
    "ahrefs.com":                          80,
    "semrush.com":                         80,
    "hubspot.com":                         78,
    "shopify.com":                         78,
    "klaviyo.com":                         78,
    "common-thread.com":                   78,  # Common Thread Collective
    "triplewhale.com":                     75,

    # ----- Communities (lower confidence) -----
    "reddit.com":                          60,
    "quora.com":                           55,
    "stackexchange.com":                   60,

    # ----- Avoid down-ranking — leave default -----
}

DEFAULT_AUTHORITY = 50

# We never push results below this, even if they look low-quality. We just
# don't boost them. Hard de-ranking is a footgun.
FLOOR = 30


def _domain(url: str) -> str:
    try:
        host = urlparse(url).hostname or ""
        return host.lower().lstrip("www.")
    except Exception:  # noqa: BLE001
        return ""


def authority_for(url: str) -> int:
    host = _domain(url)
    if not host:
        return DEFAULT_AUTHORITY
    # Exact match first.
    if host in DOMAIN_AUTHORITY:
        return DOMAIN_AUTHORITY[host]
    # Suffix match — `help.shopify.com` should pick up `shopify.com`.
    parts = host.split(".")
    for i in range(1, len(parts)):
        suffix = ".".join(parts[i:])
        if suffix in DOMAIN_AUTHORITY:
            return DOMAIN_AUTHORITY[suffix]
    return DEFAULT_AUTHORITY


def rerank(results: Iterable[dict]) -> list[dict]:
    """Sort by (authority desc, original_index asc), preserving ties.

    Tags each result with `_authority` and `_authoritative` (bool, ≥80) so
    the frontend can render an "Authoritative source" badge.
    """
    enumerated = list(enumerate(results))
    scored = []
    for idx, r in enumerated:
        url = r.get("url", "")
        score = max(authority_for(url), FLOOR)
        tagged = dict(r)
        tagged["_authority"] = score
        tagged["_authoritative"] = score >= 80
        scored.append((idx, score, tagged))

    scored.sort(key=lambda t: (-t[1], t[0]))
    return [t[2] for t in scored]
