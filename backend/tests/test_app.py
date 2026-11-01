"""Tests for the routes: the health check, the session, and the guard around the API."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import app

MVP_CREDENTIALS = {"username": "user", "password": "password"}


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A fresh client per test, so a session cookie never leaks between them."""
    with TestClient(app) as test_client:
        yield test_client


def sign_in(client: TestClient) -> None:
    assert client.post("/api/login", json=MVP_CREDENTIALS).status_code == 200


def test_health_returns_ok(client: TestClient) -> None:
    """Open on purpose: the container healthcheck and the start scripts call it."""
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_the_mvp_credentials_start_a_session(client: TestClient) -> None:
    response = client.post("/api/login", json=MVP_CREDENTIALS)

    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert client.get("/api/session").json() == {"username": "user"}


def test_a_wrong_password_is_refused_and_starts_nothing(client: TestClient) -> None:
    response = client.post("/api/login", json={**MVP_CREDENTIALS, "password": "wrong"})

    assert response.status_code == 401
    assert client.get("/api/session").status_code == 401


def test_an_unknown_user_is_refused(client: TestClient) -> None:
    response = client.post("/api/login", json={"username": "someone", "password": "password"})

    assert response.status_code == 401


def test_a_malformed_login_is_refused(client: TestClient) -> None:
    """Missing fields are a malformed request, not a failed sign-in."""
    assert client.post("/api/login", json={"username": "user"}).status_code == 422


@pytest.mark.parametrize("path", ["/api/session", "/api/hello"])
def test_protected_routes_refuse_without_a_session(client: TestClient, path: str) -> None:
    """P4.2: what is protected is the data, and this is the guard that protects it."""
    assert client.get(path).status_code == 401


def test_logout_clears_the_session(client: TestClient) -> None:
    sign_in(client)
    assert client.get("/api/session").status_code == 200

    assert client.post("/api/logout").status_code == 200

    assert client.get("/api/session").status_code == 401
    assert client.get("/api/hello").status_code == 401


def test_hello_returns_json_when_signed_in(client: TestClient) -> None:
    sign_in(client)

    response = client.get("/api/hello")

    assert response.status_code == 200
    assert response.json()["message"] == "Hello from the API"


def test_root_is_404_when_the_export_has_not_been_built(client: TestClient) -> None:
    """The export is copied in when the image is built, so a bare checkout has nothing to serve.

    That is the intended behaviour and it must be a clean 404: the container tests
    assert the other half, that "/" serves the built app.
    """
    assert client.get("/").status_code == 404


def test_unknown_route_is_404(client: TestClient) -> None:
    assert client.get("/api/nothing-here").status_code == 404
