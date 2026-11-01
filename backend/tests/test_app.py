"""Tests for the Part 2 scaffolding routes."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_hello_returns_json() -> None:
    response = client.get("/api/hello")

    assert response.status_code == 200
    assert response.json()["message"] == "Hello from the API"


def test_root_serves_the_hello_world_page() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Hello world" in response.text


def test_root_serves_a_page_not_a_directory_listing() -> None:
    """A missing index.html would otherwise show as a listing or a 404."""
    response = client.get("/")

    assert "<title>" in response.text
    assert "index of" not in response.text.lower()


def test_unknown_route_is_404() -> None:
    assert client.get("/api/nothing-here").status_code == 404
