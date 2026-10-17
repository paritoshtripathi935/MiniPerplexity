"""Keyless Parallel web search over the official MCP Streamable HTTP client."""

from __future__ import annotations

import asyncio
import json
import logging
import math
from datetime import timedelta
from typing import Any, List
from urllib.parse import urlsplit
from uuid import uuid4

import httpx

from app.models.search_model import SearchResult

from .base import SearchProvider, SearchProviderError

logger = logging.getLogger(__name__)

MCP_URL = "https://search.parallel.ai/mcp"
USER_AGENT = "MiniPerplexity/ParallelSearch (+https://github.com/paritoshtripathi935/MiniPerplexity)"
# One identity per backend process, shared across provider instances and queries.
_SESSION_ID = uuid4().hex


class ParallelProvider(SearchProvider):
    """Return web sources and excerpts without requiring a Parallel API key."""

    name = "parallel"

    def __init__(self, results_per_query: int = 10, timeout_s: float = 20) -> None:
        """Configure the local result cap and total request deadline in seconds."""
        if (
            isinstance(results_per_query, bool)
            or not isinstance(results_per_query, int)
            or results_per_query < 1
        ):
            raise SearchProviderError(
                "Parallel results_per_query must be a positive integer"
            )
        if not math.isfinite(timeout_s) or timeout_s <= 0:
            raise SearchProviderError("Parallel timeout_s must be positive and finite")
        self.results_per_query = results_per_query
        self.timeout_s = timeout_s

    async def _search(self, query: str) -> List[SearchResult]:
        """Initialize MCP and call web_search using an anonymous HTTP client."""
        # Keep MCP startup overhead out of the existing Google/Anakin paths.
        from mcp import ClientSession
        from mcp.client.streamable_http import streamable_http_client

        async with httpx.AsyncClient(
            headers={"User-Agent": USER_AGENT},
            timeout=self.timeout_s,
        ) as client:
            async with streamable_http_client(MCP_URL, http_client=client) as (
                read,
                write,
                _,
            ):
                async with ClientSession(
                    read,
                    write,
                    read_timeout_seconds=timedelta(seconds=self.timeout_s),
                ) as session:
                    await session.initialize()
                    await session.list_tools()
                    result = await session.call_tool(
                        "web_search",
                        {
                            "objective": query,
                            "search_queries": [query],
                            "session_id": _SESSION_ID,
                        },
                    )
                    if result.isError:
                        raise SearchProviderError(
                            "Parallel web_search returned a tool error"
                        )
                    payload = result.structuredContent
                    if payload is None:
                        # Older MCP servers can return the same JSON as text.
                        for block in result.content:
                            if block.type == "text":
                                payload = json.loads(block.text)
                                break
                    return self._results(query, payload)

    def _results(self, query: str, payload: Any) -> List[SearchResult]:
        """Map Parallel's URL/title/excerpts response to the shared result model."""
        if not isinstance(payload, dict) or not isinstance(
            payload.get("results"), list
        ):
            raise SearchProviderError("Parallel response is missing results")
        out: List[SearchResult] = []
        for row in payload["results"]:
            if not isinstance(row, dict):
                continue
            url = row.get("url")
            excerpts = row.get("excerpts")
            if not isinstance(url, str):
                continue
            try:
                parsed = urlsplit(url)
            except ValueError:
                continue
            if parsed.scheme not in ("http", "https") or not parsed.netloc:
                continue
            if not isinstance(excerpts, list) or not all(
                isinstance(s, str) for s in excerpts
            ):
                continue
            title = row.get("title")
            out.append(
                SearchResult(
                    question=query,
                    title=title if isinstance(title, str) and title else url,
                    url=url,
                    snippet="\n\n".join(excerpts)[:500],
                    search_content="\n\n".join(excerpts)[:5000],
                    source=self.name,
                )
            )
            if len(out) >= self.results_per_query:
                break
        return out

    async def _bounded_search(self, query: str) -> List[SearchResult]:
        """Bound initialization, tool execution and connection cleanup together."""
        return await asyncio.wait_for(self._search(query), timeout=self.timeout_s)

    def search(self, query: str) -> List[SearchResult]:
        """Run in the synchronous search worker; degrade gracefully on failure."""
        try:
            return asyncio.run(self._bounded_search(query))
        except Exception as exc:
            logger.warning("Parallel search failed (%s): %s", type(exc).__name__, exc)
            return []
