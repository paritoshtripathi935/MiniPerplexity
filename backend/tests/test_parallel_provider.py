"""Exercise the real MCP client from provider selection to consumed sources."""

import asyncio
import importlib
import json
from unittest.mock import Mock

import httpx
import pytest

from app.core.config import SearchConfig, SearchEngineEntry, load_config
from app.services import search_service
from app.services.search_providers import SearchProviderError, get_provider
from app.services.search_providers import parallel
from scripts.eval_search_providers import run_one


@pytest.fixture
def mcp_server(monkeypatch):
    """Route the actual MCP SDK's HTTP requests to an observable test server."""
    importlib.import_module("mcp.client.streamable_http")
    original_client = httpx.AsyncClient

    def install(payload=None, *, text_only=False, sse=False, failure=None):
        requests = []
        clients = []
        started = asyncio.Event()
        if payload is None:
            payload = {
                "results": [
                    {
                        "url": "https://example.com/ads",
                        "title": "Ads guidance",
                        "excerpts": [
                            "Budget guidance",
                            "Keep a stable learning phase.",
                        ],
                    }
                ]
            }

        async def handle(request):
            requests.append(request)
            if request.method != "POST":
                return httpx.Response(405)
            message = json.loads(request.content)
            method = message["method"]
            if method.startswith("notifications/"):
                return httpx.Response(202)
            if method == "initialize":
                result = {
                    "protocolVersion": message["params"]["protocolVersion"],
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "parallel-fixture", "version": "1"},
                }
            elif method == "tools/list":
                result = {
                    "tools": [{"name": "web_search", "inputSchema": {"type": "object"}}]
                }
            elif method == "tools/call":
                started.set()
                if failure == "http":
                    return httpx.Response(503)
                if failure == "network":
                    raise httpx.ConnectError("fixture offline", request=request)
                if failure == "wait":
                    await asyncio.sleep(10)
                if failure == "json":
                    return httpx.Response(
                        200,
                        text="not JSON",
                        headers={"Content-Type": "application/json"},
                    )
                result = {"content": [{"type": "text", "text": json.dumps(payload)}]}
                if not text_only:
                    result["structuredContent"] = payload
                if failure == "tool":
                    result["isError"] = True
            else:
                pytest.fail(f"Unexpected MCP method: {method}")
            response = {"jsonrpc": "2.0", "id": message["id"], "result": result}
            if sse:
                return httpx.Response(
                    200,
                    text="event: message\ndata: " + json.dumps(response) + "\n\n",
                    headers={"Content-Type": "text/event-stream"},
                )
            return httpx.Response(200, json=response)

        def client_factory(**kwargs):
            client = original_client(transport=httpx.MockTransport(handle), **kwargs)
            clients.append(client)
            return client

        monkeypatch.setattr(parallel.httpx, "AsyncClient", client_factory)
        return requests, clients, started

    return install


def tool_calls(requests):
    """Return tool dispatch messages from observed HTTP requests."""
    return [
        json.loads(r.content)
        for r in requests
        if r.method == "POST" and json.loads(r.content)["method"] == "tools/call"
    ]


@pytest.mark.parametrize(
    "text_only,sse", [(False, False), (True, False), (False, True)]
)
def test_registry_to_eval_report(mcp_server, monkeypatch, text_only, sse):
    """User-facing CLI consumption retains sources and useful excerpt content."""
    for name in ("PARALLEL_API_KEY", "GOOGLE_API_KEY", "ANAKIN_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    requests, clients, _ = mcp_server(text_only=text_only, sse=sse)
    row = run_one("parallel", "Meta budget guidance")
    assert row["error"] is None
    assert row["result_count"] == 1
    assert row["urls"] == ["https://example.com/ads"]
    assert row["titles"] == ["Ads guidance"]
    assert row["content_sample"] == ["Budget guidance\n\nKeep a stable learning phase."]
    assert all(str(r.url) == parallel.MCP_URL for r in requests)
    assert all(r.headers["User-Agent"] == parallel.USER_AGENT for r in requests)
    assert all(
        "authorization" not in r.headers and "x-api-key" not in r.headers
        for r in requests
    )
    methods = [json.loads(r.content)["method"] for r in requests if r.method == "POST"]
    assert "initialize" in methods and "tools/list" in methods
    assert tool_calls(requests)[0]["params"] == {
        "name": "web_search",
        "arguments": {
            "objective": "Meta budget guidance",
            "search_queries": ["Meta budget guidance"],
            "session_id": parallel._SESSION_ID,
        },
    }
    assert clients and all(c.is_closed for c in clients)


def test_yaml_search_path_and_result_cap(mcp_server, monkeypatch):
    """The enabled engine reaches MCP and the merged result feeds citations."""
    requests, clients, _ = mcp_server(
        {
            "results": [
                {
                    "url": "https://example.com/ads",
                    "title": None,
                    "excerpts": ["x" * 6000],
                },
                {
                    "url": "https://example.com/second",
                    "title": "Second",
                    "excerpts": ["second"],
                },
            ]
        }
    )
    monkeypatch.setattr(
        search_service._cfg,
        "search",
        SearchConfig(
            engines=[
                SearchEngineEntry(
                    id="parallel", enabled=True, max_results=1, timeout=3
                ),
                SearchEngineEntry(id="google", enabled=True),
                SearchEngineEntry(id="youtube", enabled=False),
            ]
        ),
    )
    duplicate = parallel.ParallelProvider()._results(
        "query",
        {
            "results": [
                {"url": "https://example.com/ads", "excerpts": ["duplicate"]},
            ]
        },
    )
    google = Mock(return_value=duplicate)
    youtube = Mock(side_effect=AssertionError("Disabled engine ran"))
    monkeypatch.setitem(search_service._ENGINE_REGISTRY, "google", google)
    monkeypatch.setitem(search_service._ENGINE_REGISTRY, "youtube", youtube)
    results = search_service.perform_search("query")
    assert len(results) == 1
    assert results[0].source == "parallel"
    assert results[0].title == results[0].url == "https://example.com/ads"
    assert results[0].question == "query"
    assert len(results[0].search_content) == 5000
    assert len(results[0].snippet) == 500
    google.assert_called_once_with("query")
    youtube.assert_not_called()
    assert len(tool_calls(requests)) == 1
    assert clients[0].timeout.read == 3


def test_existing_defaults_and_explicit_choices(monkeypatch):
    """Enabling a new provider does not select it for existing deployments."""
    engines = load_config().search
    assert [e.id for e in engines.enabled] == ["google", "youtube"]
    assert engines.get("parallel").enabled is False
    parallel_engine = Mock(side_effect=AssertionError("Disabled Parallel engine ran"))
    monkeypatch.setitem(search_service._ENGINE_REGISTRY, "parallel", parallel_engine)
    for engine in ("google", "youtube"):
        monkeypatch.setitem(
            search_service._ENGINE_REGISTRY, engine, Mock(return_value=[])
        )
    assert search_service.perform_search("query") == []
    parallel_engine.assert_not_called()
    monkeypatch.delenv("WEB_SEARCH_PROVIDER", raising=False)
    monkeypatch.delenv("ANAKIN_API_KEY", raising=False)
    assert get_provider().name == "google"
    monkeypatch.setenv("ANAKIN_API_KEY", "fixture")
    assert get_provider().name == "anakin_then_google"
    monkeypatch.setenv("WEB_SEARCH_PROVIDER", "google")
    assert get_provider().name == "google"
    assert get_provider("parallel").name == "parallel"
    monkeypatch.setenv("WEB_SEARCH_PROVIDER", "parallel")
    assert get_provider().name == "parallel"
    assert get_provider("anakin").name == "anakin"


@pytest.mark.parametrize("failure", ["http", "network", "json", "tool", "wait"])
def test_failures_degrade_and_close_connections(mcp_server, failure):
    """Real client errors and a total deadline leave no partial source rows."""
    _, clients, _ = mcp_server(failure=failure)
    assert parallel.ParallelProvider(timeout_s=0.15).search("query") == []
    assert clients and all(c.is_closed for c in clients)


@pytest.mark.asyncio
async def test_cancellation_propagates_and_closes_connections(mcp_server):
    """Cancellation is preserved while the SDK cleans up its background tasks."""
    _, clients, started = mcp_server(failure="wait")
    task = asyncio.create_task(
        parallel.ParallelProvider(timeout_s=3)._bounded_search("query")
    )
    await asyncio.wait_for(started.wait(), timeout=2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert clients and all(c.is_closed for c in clients)


def test_identity_reused_across_provider_instances(mcp_server):
    """Repeated searches do not create a new anonymous quota identity."""
    requests, _, _ = mcp_server()
    get_provider("parallel").search("first")
    get_provider("parallel").search("second")
    ids = [c["params"]["arguments"]["session_id"] for c in tool_calls(requests)]
    assert ids == [parallel._SESSION_ID, parallel._SESSION_ID]


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"results": "wrong"},
        {
            "results": [
                None,
                {
                    "url": "https://example.com",
                    "excerpts": [5],
                },
                {"url": "javascript:alert(1)", "excerpts": ["bad"]},
            ]
        },
    ],
)
def test_malformed_results_degrade(mcp_server, payload):
    """Malformed source rows never leak into the shared SearchResult model."""
    mcp_server(payload)
    assert get_provider("parallel").search("query") == []


@pytest.mark.parametrize(
    "kwargs",
    [
        {"results_per_query": 0},
        {"results_per_query": True},
        {"results_per_query": 1.5},
        {"timeout_s": 0},
        {"timeout_s": float("inf")},
        {"timeout_s": float("nan")},
    ],
)
def test_invalid_configuration(kwargs):
    """Reject invalid bounds before any network request."""
    with pytest.raises(SearchProviderError):
        parallel.ParallelProvider(**kwargs)
