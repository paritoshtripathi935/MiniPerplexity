import pytest
from unittest.mock import patch, MagicMock
from app.services.search_service import perform_search, fetch_content_from_custom_url, search_tavily, SearchAPIError
from app.models.search_model import SearchResult


@pytest.mark.asyncio
async def test_custom_url_fetch():
    print("Running test_custom_url_fetch")
    """
    Test that fetch_content_from_custom_url raises an exception for an invalid URL.

    This test verifies that when an invalid or inaccessible URL is provided,
    the fetch_content_from_custom_url function raises an exception as expected.
    """
    url = "https://example.com"
    with pytest.raises(Exception):
        await fetch_content_from_custom_url(url)


def test_search_tavily_missing_key():
    """Test that search_tavily raises SearchAPIError when TAVILY_API_KEY is not set."""
    with patch.dict("os.environ", {}, clear=True):
        with pytest.raises(SearchAPIError, match="TAVILY_API_KEY"):
            search_tavily("test query")


def test_search_tavily_success():
    """Test that search_tavily returns correctly mapped SearchResult objects."""
    mock_response = {
        "results": [
            {
                "title": "Tavily Result 1",
                "url": "https://example.com/1",
                "content": "Snippet for result 1",
                "raw_content": "Full content for result 1",
            },
            {
                "title": "Tavily Result 2",
                "url": "https://example.com/2",
                "content": "Snippet for result 2",
                "raw_content": None,
            },
        ]
    }
    mock_client = MagicMock()
    mock_client.search.return_value = mock_response

    with patch.dict("os.environ", {"TAVILY_API_KEY": "tvly-test-key"}):
        with patch("app.services.search_service.TavilyClient", return_value=mock_client):
            results = search_tavily("test query")

    assert len(results) == 2
    assert results[0].source == "tavily"
    assert results[0].title == "Tavily Result 1"
    assert results[0].url == "https://example.com/1"
    assert results[0].snippet == "Snippet for result 1"
    assert results[0].search_content == "Full content for result 1"
    # When raw_content is None, falls back to content
    assert results[1].search_content == "Snippet for result 2"


def test_search_tavily_api_error():
    """Test that search_tavily wraps API errors as SearchAPIError."""
    mock_client = MagicMock()
    mock_client.search.side_effect = Exception("API rate limit exceeded")

    with patch.dict("os.environ", {"TAVILY_API_KEY": "tvly-test-key"}):
        with patch("app.services.search_service.TavilyClient", return_value=mock_client):
            with pytest.raises(SearchAPIError, match="Tavily search failed"):
                search_tavily("test query")


def test_perform_search_includes_tavily():
    """Test that perform_search includes Tavily results in combined output."""
    tavily_result = SearchResult(
        question="test",
        title="Tavily Result",
        url="https://tavily.example.com",
        snippet="tavily snippet",
        search_content="tavily content",
        source="tavily",
    )

    with patch("app.services.search_service.search_bing", side_effect=SearchAPIError("no key")), \
         patch("app.services.search_service.search_google", side_effect=SearchAPIError("no key")), \
         patch("app.services.search_service.search_youtube", side_effect=SearchAPIError("no key")), \
         patch("app.services.search_service.search_tavily", return_value=[tavily_result]):
        results = perform_search("test")

    assert len(results) == 1
    assert results[0].source == "tavily"
    assert results[0].url == "https://tavily.example.com"
