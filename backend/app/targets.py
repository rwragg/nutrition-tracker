"""Calorie and protein targets, worked out from a profile (Part 12, R42-R46, D25-D29).

Pure arithmetic: no database, no web framework, no clock of its own. The caller passes today's
date, so the same inputs always give the same answer and a test can pin it.

Nothing here is stored (R42). A target is derived from the weight, and a stored copy of something
derived is a second figure that goes stale the day the weight changes.

These are estimates. The equation is the best-validated of the common ones, and that is a claim
about groups: for one person it can be wrong by 10% or more, and older adults were
under-represented in the studies (Frankenfield et al., J Am Diet Assoc 2005;105:775-89). That is
why a person can override either figure (R46, D28).
"""

import math
from datetime import date

# Mifflin-St Jeor (D26): resting energy in kcal per day, from kg, cm and whole years.
HEIGHT_FACTOR = 6.25
AGE_FACTOR = 5
SEX_CONSTANT = {"male": 5, "female": -161}

# What a day's movement multiplies resting energy by. The usual five-step scale.
ACTIVITY_FACTORS = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}

# D29: one fixed adjustment per goal. A percentage scales with the person.
GOAL_FACTORS = {"lose": 0.80, "maintain": 1.00, "gain": 1.10}

# The least a computed target may be (R44). Common practice for unsupervised eating, not a
# clinical rule, so it is a constant to be argued with rather than a fact. It does not apply to
# a figure the person chose themselves (R46).
FLOORS = {"female": 1200, "male": 1500}

# D27: grams of protein per kg of total body weight, the same for every goal.
PROTEIN_G_PER_KG = 1.6

CALORIE_STEP = 10
PROTEIN_STEP = 5

# Age limits the equation was made for (R40).
MIN_AGE = 18
MAX_AGE = 100


def age_on(born: date, today: date) -> int:
    """Whole years completed on `today`."""
    had_birthday = (today.month, today.day) >= (born.month, born.day)
    return today.year - born.year - (0 if had_birthday else 1)


def round_to(value: float, step: int) -> int:
    """Nearest multiple of `step`, halves rounding up.

    Not `round()`: that rounds halves to the even neighbour, so 2145 and 2155 would round in
    opposite directions and a target would move for no reason a person could see.
    """
    return int(math.floor(value / step + 0.5)) * step


def work_out(
    *,
    sex: str,
    birth_date: date,
    height_cm: float,
    weight_kg: float,
    activity: str,
    goal: str,
    today: date,
    kcal_override: int | None = None,
    protein_override: int | None = None,
) -> dict:
    """The targets, and every step of the working so the screen can show it.

    `computed` is what the equation gives; `calories` and `protein` are what is in force, which
    is the person's own figure where they set one.
    """
    age = age_on(birth_date, today)

    resting = (
        10 * weight_kg + HEIGHT_FACTOR * height_cm - AGE_FACTOR * age + SEX_CONSTANT[sex]
    )
    daily_need = resting * ACTIVITY_FACTORS[activity]
    after_goal = daily_need * GOAL_FACTORS[goal]

    rounded = round_to(after_goal, CALORIE_STEP)
    floor = FLOORS[sex]
    floored = rounded < floor
    computed_calories = floor if floored else rounded

    protein_raw = PROTEIN_G_PER_KG * weight_kg
    computed_protein = round_to(protein_raw, PROTEIN_STEP)

    return {
        "calories": kcal_override if kcal_override is not None else computed_calories,
        "protein": protein_override if protein_override is not None else computed_protein,
        "calories_from": "own" if kcal_override is not None else "profile",
        "protein_from": "own" if protein_override is not None else "profile",
        "computed": {"calories": computed_calories, "protein": computed_protein},
        "working": {
            "age": age,
            "resting": round(resting, 1),
            "activity_factor": ACTIVITY_FACTORS[activity],
            "daily_need": round(daily_need, 1),
            "goal_factor": GOAL_FACTORS[goal],
            "after_goal": round(after_goal, 1),
            "floor": floor,
            "floored": floored,
            "protein_per_kg": PROTEIN_G_PER_KG,
            "protein_before_rounding": round(protein_raw, 1),
        },
    }
