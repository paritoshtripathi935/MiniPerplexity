"""Anakin Search API provider.

Anakin offers a single-call `POST /v1/search` endpoint that promises web
search + content extraction + citations in one round-trip. That's the bet
this provider is making: replace (Google CSE → 10× requests.get → BS4)
with one HTTP call.

**Status: spike.** The public docs at anakin.io/docs/api-reference/search
do not expose the exact request body schema or the response field names
(they're gated behind an account login). This client is written
defensively so we can hit the API once we have a key and iterate
without rewriting:

  - The request body uses a *guessed* shape based on common conventions
    in this space (Exa, Tavily, Brave). The mapping is centralised in
    one dict so flipping a name takes one edit.
  - The response parser tries multiple field-name conventions in priority
    order (results → data → items; content → extracted_content → text →
    full_text → markdown). When a row lacks extracted content, we fall
    back to the snippet so the LLM still has *something* to work with.
  - Every unexpected response shape is logged at INFO with the top-level
    keys so the eval harness output tells us exactly what to adjust.

When we have real responses pinned down, this file should shrink — the
defensive fallbacks become a single canonical parse.

Env vars:
  - ANAKIN_API_KEY   (required)
  - ANAKIN_API_BASE  (optional, defaults to https://api.anakin.io/v1)
  - ANAKIN_SEARCH_RESULTS_PER_QUERY  (optional, default 10)
  - ANAKIN_SEARCH_TIMEOUT_S          (optional, default 20 — single-call
                                       can take longer than CSE since the
                                       server does content extraction)
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

import httpx

from app.models.search_model import SearchResult

from .base import SearchProvider, SearchProviderError

logger = logging.getLogger(__name__)

DEFAULT_BASE = "https://api.anakin.io/v1"
DEFAULT_TIMEOUT_S = 20
DEFAULT_RESULTS = 10

# Result field-name fallbacks. Probe in order; first non-empty hit wins.
# Centralised so an API-shape change is a one-line edit when we get
# real responses to look at.
_RESULTS_LIST_KEYS = ("results", "data", "items", "hits")
_TITLE_KEYS = ("title", "name", "heading")
_URL_KEYS = ("url", "link", "source", "source_url")
_SNIPPET_KEYS = ("snippet", "description", "summary", "preview")
_CONTENT_KEYS = (
    "content",
    "extracted_content",
    "text",
    "full_text",
    "markdown",
    "body",
    "page_content",
)


def _first_string(d: Dict[str, Any], keys) -> str:
    """Return the first non-empty string value for `keys` in `d`."""
    for k in keys:
        v = d.get(k)
        if isinstance(v, str) and v.strip():
            return v
    return ""


def _extract_results_list(payload: Any) -> List[Dict[str, Any]]:
    """Find the array of result rows in a response of unknown shape."""
    if isinstance(payload, list):
        return [r for r in payload if isinstance(r, dict)]
    if not isinstance(payload, dict):
        return []
    for k in _RESULTS_LIST_KEYS:
        v = payload.get(k)
        if isinstance(v, list) and v:
            return [r for r in v if isinstance(r, dict)]
        # Sometimes nested e.g. `{ "data": { "results": [...] } }`.
        if isinstance(v, dict):
            for k2 in _RESULTS_LIST_KEYS:
                v2 = v.get(k2)
                if isinstance(v2, list) and v2:
                    return [r for r in v2 if isinstance(r, dict)]
    return []


class AnakinProvider(SearchProvider):
    name = "anakin"

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        results_per_query: Optional[int] = None,
        timeout_s: Optional[float] = None,
    ) -> None:
        self.api_key = api_key or os.getenv("ANAKIN_API_KEY")
        self.base_url = (base_url or os.getenv("ANAKIN_API_BASE") or DEFAULT_BASE).rstrip("/")
        self.results_per_query = int(
            results_per_query
            if results_per_query is not None
            else os.getenv("ANAKIN_SEARCH_RESULTS_PER_QUERY", DEFAULT_RESULTS)
        )
        self.timeout_s = float(
            timeout_s
            if timeout_s is not None
            else os.getenv("ANAKIN_SEARCH_TIMEOUT_S", DEFAULT_TIMEOUT_S)
        )

    def _request_body(self, query: str) -> Dict[str, Any]:
        """Centralised request shape — locked against the live API.

        Live discovery during eval (2026-05-29):
          - The query field is `prompt`, not `query`. Sending `query`
            returns 400 `invalid_request: "Prompt is required"`.
          - `num_results`, `include_content`, `include_citations` were
            accepted without complaint when the request was otherwise
            well-formed; keeping them in as plausibly-supported hints
            until docs say otherwise. No-op if the server ignores."""
        return {
            "prompt": query,
            "num_results": self.results_per_query,
            "include_content": True,
            "include_citations": True,
        }

    def _row_to_result(self, query: str, row: Dict[str, Any]) -> Optional[SearchResult]:
        url = _first_string(row, _URL_KEYS)
        if not url:
            return None
        title = _first_string(row, _TITLE_KEYS) or url
        snippet = _first_string(row, _SNIPPET_KEYS)
        content = _first_string(row, _CONTENT_KEYS)
        # If the provider only returned a snippet, mirror it into
        # search_content so downstream answer assembly has text to feed
        # the LLM. This matches the Google path's behavior when BS4
        # extraction yields nothing.
        search_content = content or snippet
        return SearchResult(
            question=query,
            title=title,
            url=url,
            snippet=snippet,
            search_content=search_content[:5000],  # mirror MAX_CONTENT_LENGTH
            source="anakin",
        )

    def search(self, query: str) -> List[SearchResult]:
        if not self.api_key:
            raise SearchProviderError(
                "ANAKIN_API_KEY is not set — provider unavailable",
            )

        endpoint = f"{self.base_url}/search"
        headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        body = self._request_body(query)

        try:
            with httpx.Client(timeout=self.timeout_s) as client:
                resp = client.post(endpoint, headers=headers, json=body)
        except httpx.HTTPError as e:
            logger.error("AnakinProvider HTTP error for %r: %s", query, e)
            return []

        if resp.status_code >= 400:
            # Per the existing repo gotcha: include body in the log so
            # we know what failed, not just the status.
            logger.error(
                "AnakinProvider %s %s → %s: %s",
                "POST",
                endpoint,
                resp.status_code,
                resp.text[:500],
            )
            return []

        try:
            payload = resp.json()
        except Exception as e:
            logger.error("AnakinProvider non-JSON response: %s", e)
            return []

        rows = _extract_results_list(payload)
        if not rows:
            # First-call debugging — log the top-level keys so we can map
            # the shape without printing the entire (possibly huge) body.
            top_keys = list(payload.keys()) if isinstance(payload, dict) else type(payload).__name__
            logger.info(
                "AnakinProvider returned 0 results for %r; payload top-level=%s",
                query,
                top_keys,
            )
            return []

        out: List[SearchResult] = []
        for row in rows[: self.results_per_query]:
            sr = self._row_to_result(query, row)
            if sr is not None:
                out.append(sr)
        return out
