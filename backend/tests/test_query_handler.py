
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Mini Perplexity API is running"}

def test_answer_endpoint():
    response = client.post("/v1/answer", json={"query": "Example query"})
    assert response.status_code == 200
    assert "answer" in response.json()
    assert "citations" in response.json()
