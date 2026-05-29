"""Base contract for web-search providers."""
from __future__ import annotations

from typing import List, Protocol, runtime_checkable

from app.models.search_model import SearchResult


class SearchProviderError(Exception):
    """Raised when a provider is misconfigured or its API call fails.

    Distinct from the existing `SearchAPIError` in `search_service.py` so
    we can route provider-shape failures (env missing, bad response shape)
    differently from raw HTTP errors in the future. For now the eval
    harness just logs both."""


@runtime_checkable
class SearchProvider(Protocol):
    """A provider that maps a query → a ranked list of SearchResult rows."""

    name: str

    def search(self, query: str) -> List[SearchResult]:
        """Return up to N results. Should never raise on transient HTTP
        errors — log and return [] so the calling answer flow degrades
        gracefully. Reserved for configuration / shape errors only.

        Each returned SearchResult must populate `search_content` with
        the best available extracted text; if the provider only offers a
        snippet, repeat the snippet there so the LLM has *something*."""
        ...
