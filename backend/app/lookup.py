"""The route that looks a food up (D20, R32, R35).

Separate from `api.py` because it is the one route that talks to something outside the app, and
because everything about it - the key, the cap, the failure modes - is its own.
"""

from fastapi import APIRouter, HTTPException, Query, status

from app import usda
from app.auth import User
from app.ratelimit import LOOKUPS_PER_DAY, LOOKUPS_PER_MINUTE

router = APIRouter(prefix="/api/lookup", tags=["lookup"])


@router.get("/foods")
def look_up_food(user: User, q: str = Query(min_length=2, max_length=80)) -> dict:
    """Candidates from USDA for a food that is not in the person's list.

    Nothing is written: a pick is a separate, deliberate step (R33). The browser never sees the key,
    and each account has a cap, because the key is the owner's (D21).
    """
    query = " ".join(q.split())
    if len(query) < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name a food to look up")

    # Configuration comes before the cap: a person told "not configured" should not also be spending
    # their allowance on a request that could never have worked.
    if not usda.key():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="food lookup is not configured"
        )

    LOOKUPS_PER_MINUTE.check(user)
    LOOKUPS_PER_DAY.check(user)

    try:
        results = usda.search(query)
    except usda.Unavailable as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from None

    return {"query": query, "results": results}
