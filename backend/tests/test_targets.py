"""The arithmetic behind the targets (Part 12, R43-R46).

Nothing here touches a database or a web server: the module is pure, so these pin its figures. The
four people are invented. Their figures were worked out from the formulas in the plan, then
checked here by hand against the equation, so a changed constant fails a named test rather than
quietly moving everyone's target.
"""

from datetime import date

import pytest

from app import targets

TODAY = date(2026, 11, 4)


def person(**changes) -> dict:
    base = dict(
        sex="male", birth_date=date(1986, 3, 1), height_cm=178, weight_kg=82,
        activity="moderate", goal="lose", today=TODAY,
    )
    return {**base, **changes}


# The four worked examples from docs/PLAN.md, Part 12. Born so that the age on TODAY is as stated.
EXAMPLES = [
    # id, person, resting, daily need, after goal, calories, protein before rounding, protein
    ("A", person(), 1737.5, 2693.1, 2154.5, 2150, 131.2, 130),
    ("B", person(sex="female", birth_date=date(1996, 3, 1), height_cm=155, weight_kg=50,
                 activity="sedentary"), 1157.8, 1389.3, 1111.4, 1200, 80.0, 80),
    ("C", person(sex="female", birth_date=date(1971, 3, 1), height_cm=165, weight_kg=70,
                 activity="light", goal="maintain"), 1295.2, 1781.0, 1781.0, 1780, 112.0, 110),
    ("D", person(birth_date=date(2001, 3, 1), height_cm=183, weight_kg=75,
                 activity="active", goal="gain"), 1773.8, 3059.7, 3365.7, 3370, 120.0, 120),
]


@pytest.mark.parametrize("name, who, resting, need, after, calories, protein_raw, protein", EXAMPLES)
def test_the_worked_examples_in_the_plan(name, who, resting, need, after, calories, protein_raw, protein) -> None:
    worked = targets.work_out(**who)

    assert worked["working"]["resting"] == resting
    assert worked["working"]["daily_need"] == need
    assert worked["working"]["after_goal"] == after
    assert worked["working"]["protein_before_rounding"] == protein_raw
    assert worked["calories"] == calories
    assert worked["protein"] == protein


def test_the_floor_decides_example_b_and_says_so() -> None:
    """1,111 would be below what is sensible for a small woman, so the floor holds and is reported."""
    worked = targets.work_out(**EXAMPLES[1][1])

    assert worked["working"]["floored"] is True
    assert worked["working"]["floor"] == 1200
    assert worked["calories"] == 1200


def test_the_floor_is_not_reported_when_it_did_not_decide() -> None:
    for name, who, *_ in (EXAMPLES[0], EXAMPLES[2], EXAMPLES[3]):
        assert targets.work_out(**who)["working"]["floored"] is False, name


def test_the_floor_differs_by_sex() -> None:
    """A man this small and this sedentary lands under the higher floor, not the lower."""
    worked = targets.work_out(**person(sex="male", height_cm=160, weight_kg=55, activity="sedentary",
                                       birth_date=date(1986, 3, 1)))
    assert worked["working"]["floor"] == 1500
    assert worked["calories"] == 1500


def test_an_own_figure_wins_and_the_floor_does_not_apply_to_it() -> None:
    """The floor is a default for a computed figure. A person who chose 1,000 chose it (R46)."""
    worked = targets.work_out(**EXAMPLES[1][1], kcal_override=1000, protein_override=95)

    assert (worked["calories"], worked["protein"]) == (1000, 95)
    assert (worked["calories_from"], worked["protein_from"]) == ("own", "own")
    # what the equation says is still there, for the screen to show beside it
    assert worked["computed"] == {"calories": 1200, "protein": 80}


def test_each_override_is_independent() -> None:
    worked = targets.work_out(**person(), protein_override=150)

    assert worked["calories"] == 2150 and worked["calories_from"] == "profile"
    assert worked["protein"] == 150 and worked["protein_from"] == "own"


def test_protein_follows_the_weight_and_nothing_else() -> None:
    """Same weight, every other input different: the same protein (R45, D27)."""
    a = targets.work_out(**person(weight_kg=90))
    b = targets.work_out(**person(weight_kg=90, sex="female", goal="gain", activity="very_active",
                                  height_cm=150, birth_date=date(1960, 1, 1)))
    assert a["protein"] == b["protein"] == 145  # 1.6 x 90 = 144 -> nearest 5


def test_the_target_moves_when_the_weight_moves_with_no_other_write() -> None:
    """R42: nothing is stored, so a new weight is a new target."""
    before = targets.work_out(**person(weight_kg=82))
    after = targets.work_out(**person(weight_kg=78))

    assert after["calories"] < before["calories"]
    assert after["protein"] < before["protein"]


@pytest.mark.parametrize("value, step, expected", [
    (2145.0, 10, 2150), (2155.0, 10, 2160),  # halves go up on both sides: no wandering to the even one
    (2144.9, 10, 2140), (2154.4, 10, 2150),
    (127.5, 5, 130), (122.5, 5, 125), (122.4, 5, 120),
])
def test_rounding_goes_the_same_way_for_every_half(value, step, expected) -> None:
    assert targets.round_to(value, step) == expected


@pytest.mark.parametrize("born, expected", [
    (date(1986, 11, 4), 40),   # the birthday is today: already 40
    (date(1986, 11, 5), 39),   # tomorrow: still 39
    (date(1986, 11, 3), 40),
    (date(2008, 11, 4), 18),
    (date(2008, 11, 5), 17),
])
def test_age_counts_completed_years(born, expected) -> None:
    assert targets.age_on(born, TODAY) == expected


def test_a_leap_day_birthday_is_handled() -> None:
    assert targets.age_on(date(2000, 2, 29), date(2026, 2, 28)) == 25
    assert targets.age_on(date(2000, 2, 29), date(2026, 3, 1)) == 26


def test_every_activity_level_and_goal_has_a_factor() -> None:
    """A level added to the schema without a factor here would be a KeyError for a real person."""
    from app import db

    assert set(db.ACTIVITY_LEVELS) == set(targets.ACTIVITY_FACTORS)
    assert set(db.GOALS) == set(targets.GOAL_FACTORS)
    assert set(db.SEXES) == set(targets.FLOORS) == set(targets.SEX_CONSTANT)
