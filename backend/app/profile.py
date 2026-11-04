"""The person's profile, and the targets worked out from it (Part 12, R38-R53).

One profile per account, read and written only for the signed-in browser session. No route takes a
user id, so there is nothing to address another account's profile with (R41), and the Telegram bot
cannot reach these routes at all (R53): it can speak for a chat on every other route, but a profile
holds body measurements, and nothing in this part needs the bot to have them.

The figures a profile holds are never logged and never echoed back in a refusal (R50): the app's
422 handler strips the rejected value, and the messages below name the field and the rule only.
"""

import sqlite3
from datetime import date as calendar_date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator

from app import targets
from app.auth import Connection
from app.db import ACTIVITY_LEVELS, GOALS, SEXES, UNIT_SYSTEMS

router = APIRouter(prefix="/api/profile", tags=["profile"])

Sex = Literal["female", "male"]
Activity = Literal["sedentary", "light", "moderate", "active", "very_active"]
Goal = Literal["lose", "maintain", "gain"]
UnitSystem = Literal["metric", "imperial"]

# The weight is dated so the Day view can say what a target rests on (R48). The server sets the date,
# not the client, because a client clock is one more way to be wrong. A weight counts as changed when
# it moves by at least this much: converting a rounded pounds figure back to kilograms never lands
# on exactly the stored value, and that is not a new weigh-in.
WEIGHT_CHANGED_BY_KG = 0.05


def today() -> calendar_date:
    """Today, in one place so a test can set it."""
    return calendar_date.today()


def browser_session(request: Request) -> str:
    """The account of a signed-in browser, and no one else (R53).

    `auth.current_user` also accepts the bot speaking for a bound chat. That is right for foods and
    meals; it is the wrong default for body measurements, so this route group asks for the session.
    """
    user_id = request.session.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in")
    return user_id


Owner = Annotated[str, Depends(browser_session)]


class ProfileIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)
    sex: Sex
    birth_date: calendar_date
    height_cm: float = Field(ge=120, le=230, allow_inf_nan=False)
    weight_kg: float = Field(ge=30, le=300, allow_inf_nan=False)
    activity: Activity
    goal: Goal
    units: UnitSystem = "metric"
    kcal_override: int | None = Field(default=None, ge=800, le=6000)
    protein_override: int | None = Field(default=None, ge=20, le=400)

    @field_validator("display_name")
    @classmethod
    def name_is_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("a name cannot be blank")
        return value

    @field_validator("birth_date")
    @classmethod
    def age_is_one_the_equation_was_made_for(cls, born: calendar_date) -> calendar_date:
        age = targets.age_on(born, today())
        if age < targets.MIN_AGE or age > targets.MAX_AGE:
            raise ValueError(
                f"the calorie equation is for ages {targets.MIN_AGE} to {targets.MAX_AGE}"
            )
        return born


# Checked against the schema's own lists, so adding a value in one place and not the other fails a
# test rather than a person.
assert set(SEXES) == set(Sex.__args__)
assert set(ACTIVITY_LEVELS) == set(Activity.__args__)
assert set(GOALS) == set(Goal.__args__)
assert set(UNIT_SYSTEMS) == set(UnitSystem.__args__)

COLUMNS = (
    "display_name", "sex", "birth_date", "height_cm", "weight_kg", "weight_on",
    "activity", "goal", "units", "kcal_override", "protein_override",
)


def read(connection: sqlite3.Connection, user: str) -> sqlite3.Row | None:
    return connection.execute(
        f"SELECT {', '.join(COLUMNS)} FROM profiles WHERE user_id = ?", (user,)
    ).fetchone()


def payload(row: sqlite3.Row | None) -> dict:
    """The profile and its targets, or nothing at all.

    An account with no profile is an ordinary state, not an error (R38), so it answers 200 with
    nulls: the browser asks on every load, and a 404 each time would be noise in its console.
    """
    if row is None:
        return {"profile": None, "targets": None}

    profile = dict(row)
    worked = targets.work_out(
        sex=profile["sex"],
        birth_date=calendar_date.fromisoformat(profile["birth_date"]),
        height_cm=profile["height_cm"],
        weight_kg=profile["weight_kg"],
        activity=profile["activity"],
        goal=profile["goal"],
        today=today(),
        kcal_override=profile["kcal_override"],
        protein_override=profile["protein_override"],
    )
    return {"profile": profile, "targets": worked}


# What is said when a create is refused for want of a profile (R54). One sentence, used by every route that
# creates a record, so the screen and the bot repeat the same words.
SET_UP_FIRST = "set up your profile before adding anything"


def require_profile(connection: sqlite3.Connection, user: str) -> None:
    """Refuse (409) unless this account has a profile (Part 12, R54).

    Only whether one exists is asked, never what is in it, so the bot can be refused by this and still
    cannot read a profile (R53). 409 and not 403 on purpose: the bot reads a 403 as "this chat is not
    linked to an account", which is a different thing to tell a person, and it relays the sentence of
    any other refusal as it came.
    """
    exists = connection.execute("SELECT 1 FROM profiles WHERE user_id = ?", (user,)).fetchone()
    if exists is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=SET_UP_FIRST)


@router.get("")
def get_profile(connection: Connection, user: Owner) -> dict:
    return payload(read(connection, user))


@router.put("")
def put_profile(profile: ProfileIn, connection: Connection, user: Owner) -> dict:
    """Create or replace this account's profile. The whole thing is sent, so there is no partial state."""
    existing = read(connection, user)

    # Keep the old date unless the weight actually moved.
    weight_on = today()
    if existing is not None and abs(existing["weight_kg"] - profile.weight_kg) < WEIGHT_CHANGED_BY_KG:
        weight_on = calendar_date.fromisoformat(existing["weight_on"])

    values = (
        profile.display_name, profile.sex, profile.birth_date.isoformat(), profile.height_cm,
        profile.weight_kg, weight_on.isoformat(), profile.activity, profile.goal, profile.units,
        profile.kcal_override, profile.protein_override,
    )
    assignments = ", ".join(f"{column} = excluded.{column}" for column in COLUMNS)
    with connection:
        connection.execute(
            f"INSERT INTO profiles (user_id, {', '.join(COLUMNS)})"
            f" VALUES (?, {', '.join('?' for _ in COLUMNS)})"
            f" ON CONFLICT (user_id) DO UPDATE SET {assignments}",
            (user, *values),
        )

    return payload(read(connection, user))


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(connection: Connection, user: Owner) -> None:
    """Remove it, which puts the account back on the fixed targets (R38).

    Idempotent: removing a profile that is not there leaves things as asked, so it is not an error.
    """
    with connection:
        connection.execute("DELETE FROM profiles WHERE user_id = ?", (user,))
