"""An invented person, for the tests that need an account that is allowed to add things.

Part 12 (R54): an account with no profile cannot create an entry, a food or a meal, so any test that
creates one first gives its account a profile. These figures belong to nobody (R51): the repository is
public, and a real person's weight and age are health data.
"""

from fastapi.testclient import TestClient

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
