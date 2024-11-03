import pytest
from app.services.search_service import perform_search, fetch_content_from_custom_url
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
