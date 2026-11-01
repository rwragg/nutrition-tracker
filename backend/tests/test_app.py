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


def test_root_is_404_when_the_export_has_not_been_built() -> None:
    """The export is copied in when the image is built, so a bare checkout has nothing to serve.

    That is the intended behaviour and it must be a clean 404: the container tests
    assert the other half, that "/" serves the built app.
    """
    assert client.get("/").status_code == 404


def test_unknown_route_is_404() -> None:
    assert client.get("/api/nothing-here").status_code == 404
