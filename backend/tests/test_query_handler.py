from fastapi.testclient import TestClient
from app.main import app
import pytest
from unittest.mock import patch

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

def test_answer_endpoint_success():
    test_query = {
        "query": "What is Python?",
        "search_results": [
            {
                "title": "Python Programming",
                "url": "https://example.com/python",
                "snippet": "Python is a programming language",
                "search_content": "Python is a high-level programming language",
                "source": "web",
                "question": "What is Python?"
            }
        ],
        "previous_queries": []
    }
    
    response = client.post("/api/v1/answer/test-session", json=test_query)
    assert response.status_code == 200
    assert "answer" in response.json()
    assert "citations" in response.json()

@pytest.mark.asyncio
async def test_search_endpoint():
    test_request = {
        "query": "Python programming",
        "previous_queries": []
    }
    
    response = client.post(
        "/api/v1/search/test-session?custom_url=",
        json=test_request
    )
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_invalid_session():
    response = client.get("/api/v1/session/nonexistent-session/history")
    assert response.status_code == 404
