"""An invented person, for the tests that need an account that is allowed to add things.

Part 12 (R54): an account with no profile cannot create an entry, a food or a meal, so any test that
creates one first gives its account a profile. These figures belong to nobody (R51): the repository is
public, and a real person's weight and age are health data.
"""

from fastapi.testclient import TestClient

from app import admin, db

ANA = {
    "display_name": "Ana Example",
    "sex": "male",
    "birth_date": "1986-03-01",
    "height_cm": 178,
    "weight_kg": 82,
    "activity": "moderate",
    "goal": "lose",
    "units": "metric",
}


def give_profile(client: TestClient) -> TestClient:
    """Save the invented profile for the account this client is signed in as. Returns the client."""
    response = client.put("/api/profile", json=ANA)
    assert response.status_code == 200, response.text
    return client


def approve(username: str) -> None:
    """Approve an account through the admin's own code (Part 14), the way the person at the console would.

    A registration is `pending` and cannot sign in (R65, R66), so a test that needs an account that can has to approve
    it first. Quietly does nothing for an account that is already approved, such as the seeded one: a helper that signs
    in can then call this for any account. An account that does not exist is not hidden: the sign-in that follows fails.
    """
    connection = db.connect()
    try:
        admin.change(connection, "approve", username)
    except admin.AdminError:
        pass
    finally:
        connection.close()
