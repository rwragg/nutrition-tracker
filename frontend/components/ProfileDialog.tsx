"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACTIVITY_LEVELS,
  GOALS,
  SEXES,
  type Activity,
  type Goal,
  type ProfileInput,
  type ProfileState,
  type SaveResult,
  type Sex,
  type UnitSystem,
} from "@/lib/types";
import {
  cmToFeetAndInches,
  feetAndInchesToCm,
  kgToLb,
  lbToKg,
  parseNumber,
  roundTo,
} from "@/lib/units";
import Dialog from "./Dialog";
import { BTN_GHOST, BTN_PRIMARY } from "./styles";

/** Plain words for each level, with the example a person can place themselves by. */
const ACTIVITY_LABELS: Record<Activity, string> = {
  sedentary: "Mostly sitting (desk job, little exercise)",
  light: "Light (some walking, or exercise 1 to 3 days a week)",
  moderate: "Moderate (exercise 3 to 5 days a week)",
  active: "Active (hard exercise 6 or 7 days a week)",
  very_active: "Very active (a physical job plus hard training)",
};

const GOAL_LABELS: Record<Goal, string> = {
  lose: "Lose fat",
  maintain: "Stay the same weight",
  gain: "Gain weight",
};

const SEX_LABELS: Record<Sex, string> = { female: "Female", male: "Male" };

/** A number to one decimal with thousands separators, so 1737.5 reads as 1,737.5 and 2150 as 2,150. */
function figure(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** A multiplier, which needs its third decimal: 1.375 must not read as 1.4. */
function factor(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

/** How a stored value is written in a text box: no trailing ".0". */
function box(value: number, places = 1): string {
  return String(roundTo(value, places));
}

type HeightBoxes = { cm: string; feet: string; inches: string };

const NO_HEIGHT: HeightBoxes = { cm: "", feet: "", inches: "" };

/** The height boxes for a height in centimetres, in whichever units the form is showing. */
function heightBoxes(heightCm: number | null, units: UnitSystem): HeightBoxes {
  if (heightCm === null) return NO_HEIGHT;

  if (units === "imperial") {
    const { feet, inches } = cmToFeetAndInches(heightCm);
    return { cm: "", feet: String(feet), inches: box(inches) };
  }

  return { cm: box(heightCm), feet: "", inches: "" };
}

function weightBox(weightKg: number | null, units: UnitSystem): string {
  if (weightKg === null) return "";
  return units === "imperial" ? box(kgToLb(weightKg)) : box(weightKg);
}

/** What the height boxes say, in centimetres, or null for one that is not a number yet. */
function readHeight(boxes: HeightBoxes, units: UnitSystem): number | null {
  if (units === "metric") return parseNumber(boxes.cm);

  const feet = parseNumber(boxes.feet);
  const inches = boxes.inches.trim() === "" ? 0 : parseNumber(boxes.inches);
  return feet === null || inches === null ? null : feetAndInchesToCm(feet, inches);
}

function readWeight(text: string, units: UnitSystem): number | null {
  const value = parseNumber(text);
  if (value === null) return null;
  return units === "imperial" ? lbToKg(value) : value;
}

/**
 * Set up, change or remove the profile, and see how the targets were worked out (Part 12, R47).
 *
 * Nothing here works a target out: the server does (D25), and the working shown below is the server's
 * own steps. Nothing here decides what a valid height is either - a refusal comes back from the server
 * naming the field, and is shown as it came (the rule the rest of the app follows).
 *
 * One detail is about honesty rather than convenience. The true height and weight are held in metric,
 * and the text boxes are only a way of showing them. They are rewritten from the metric figure when the
 * units change and re-read only when a box is edited, so a figure the person has not touched is sent
 * back exactly as it was stored - however many times the units were switched. A weight converted
 * to pounds and back never lands on the same number, and the server dates a weight by whether it
 * changed: opening the dialog and pressing Save must not look like a new weigh-in.
 */
export default function ProfileDialog({
  state,
  onSave,
  onRemove,
  onClose,
}: {
  state: ProfileState | null;
  onSave: (input: ProfileInput) => Promise<SaveResult>;
  onRemove: () => Promise<SaveResult>;
  onClose: () => void;
}) {
  const stored = state?.profile ?? null;

  const [units, setUnits] = useState<UnitSystem>(stored?.units ?? "metric");
  const [name, setName] = useState(stored?.displayName ?? "");
  const [sex, setSex] = useState<Sex>(stored?.sex ?? "female");
  const [birthDate, setBirthDate] = useState(stored?.birthDate ?? "");
  const [activity, setActivity] = useState<Activity>(stored?.activity ?? "light");
  const [goal, setGoal] = useState<Goal>(stored?.goal ?? "maintain");
  // The true figures, in metric. The boxes below show them and only an edit to a box changes them.
  const [heightCm, setHeightCm] = useState<number | null>(stored?.heightCm ?? null);
  const [weightKg, setWeightKg] = useState<number | null>(stored?.weightKg ?? null);
  const [height, setHeight] = useState<HeightBoxes>(heightBoxes(stored?.heightCm ?? null, stored?.units ?? "metric"));
  const [weight, setWeight] = useState(weightBox(stored?.weightKg ?? null, stored?.units ?? "metric"));
  const [kcalOwn, setKcalOwn] = useState(stored?.kcalOverride != null ? String(stored.kcalOverride) : "");
  const [proteinOwn, setProteinOwn] = useState(
    stored?.proteinOverride != null ? String(stored.proteinOverride) : "",
  );

  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const workingRef = useRef<HTMLElement>(null);

  // The result is at the bottom of a dialog that scrolls, so after Save nothing would visibly change at
  // the top and it would look as though the button had done nothing. (Optional call: jsdom has no scrollIntoView.)
  useEffect(() => {
    if (saved) workingRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [saved, state]);

  const canSave = name.trim().length > 0 && birthDate !== "" && heightCm !== null && weightKg !== null && !saving;

  function editHeight(next: HeightBoxes) {
    setHeight(next);
    setHeightCm(readHeight(next, units));
  }

  function editWeight(text: string) {
    setWeight(text);
    setWeightKg(readWeight(text, units));
  }

  /** Changing units rewrites the boxes from the true figures, so 178 cm shows as 5 ft 10.1 in and comes back as 178. */
  function changeUnits(next: UnitSystem) {
    if (next === units) return;

    setUnits(next);
    setHeight(heightBoxes(heightCm, next));
    setWeight(weightBox(weightKg, next));
  }

  function own(text: string): number | null {
    const value = parseNumber(text);
    return value === null ? null : Math.round(value);
  }

  async function save() {
    if (!canSave || heightCm === null || weightKg === null) return;

    setSaving(true);
    setSaved(false);
    setProblem(null);

    const result = await onSave({
      displayName: name.trim(),
      sex,
      birthDate,
      heightCm,
      weightKg,
      activity,
      goal,
      units,
      kcalOverride: own(kcalOwn),
      proteinOverride: own(proteinOwn),
    });
    setSaving(false);

    if (!result.ok) {
      setProblem(result.message);
      return;
    }

    setSaved(true);
  }

  async function remove() {
    setSaving(true);
    const result = await onRemove();
    setSaving(false);

    if (!result.ok) {
      setProblem(result.message);
      setConfirmingRemove(false);
      return;
    }

    onClose();
  }

  const working = state?.targets.working;
  const targets = state?.targets;

  return (
    <Dialog
      title="Profile"
      onClose={onClose}
      footer={
        <div className="d-flex justify-content-end gap-2 w-100">
          <button type="button" onClick={onClose} className={BTN_GHOST} data-testid="close-dialog">
            Close
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className={BTN_PRIMARY}
            data-testid="save-profile"
          >
            {saving ? "Saving..." : state ? "Save profile" : "Create profile"}
          </button>
        </div>
      }
    >
      <div className="d-flex flex-column gap-3" data-testid="profile-dialog">
        <p className="small text-muted-brand mb-0" data-testid="profile-estimate-note">
          These are estimates. The calorie equation can be off by 10% or more for any one person, and it was
          tested least on older adults. It is not meant for anyone under 18, pregnant or breastfeeding, or
          managing a medical condition. If you know better numbers, enter your own below.
        </p>

        {problem && (
          <p className="small mb-0 text-ember" role="alert" data-testid="profile-problem">
            {problem}
          </p>
        )}

        <div className="row g-3">
          <div className="col-12">
            <label className="form-label fw-medium" htmlFor="profile-name">
              Name
            </label>
            <input
              id="profile-name"
              type="text"
              className="form-control"
              value={name}
              maxLength={40}
              data-testid="profile-name"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="col-6">
            <label className="form-label fw-medium" htmlFor="profile-sex">
              Sex
            </label>
            <select
              id="profile-sex"
              className="form-select"
              value={sex}
              data-testid="profile-sex"
              onChange={(event) => setSex(event.target.value as Sex)}
            >
              {SEXES.map((value) => (
                <option key={value} value={value}>
                  {SEX_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="col-6">
            <label className="form-label fw-medium" htmlFor="profile-birth">
              Date of birth
            </label>
            <input
              id="profile-birth"
              type="date"
              className="form-control"
              value={birthDate}
              data-testid="profile-birth"
              onChange={(event) => setBirthDate(event.target.value)}
            />
          </div>
        </div>
        <p className="small text-muted-brand mb-0">
          Sex is used only for the calorie equation, which has one constant for each.
        </p>

        <div className="row g-3">
          <div className="col-12 col-sm-4">
            <label className="form-label fw-medium" htmlFor="profile-units">
              Units
            </label>
            <select
              id="profile-units"
              className="form-select"
              value={units}
              data-testid="profile-units"
              onChange={(event) => changeUnits(event.target.value as UnitSystem)}
            >
              <option value="metric">Metric</option>
              <option value="imperial">Imperial</option>
            </select>
          </div>

          {units === "metric" ? (
            <div className="col-6 col-sm-4">
              <label className="form-label fw-medium" htmlFor="profile-height-cm">
                Height (cm)
              </label>
              <input
                id="profile-height-cm"
                type="text"
                inputMode="decimal"
                className="form-control tabular"
                value={height.cm}
                data-testid="profile-height-cm"
                onChange={(event) => editHeight({ ...height, cm: event.target.value })}
              />
            </div>
          ) : (
            <div className="col-6 col-sm-4">
              <span className="form-label fw-medium d-block" id="profile-height-label">
                Height
              </span>
              <div className="d-flex gap-2" role="group" aria-labelledby="profile-height-label">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Height, feet"
                  className="form-control tabular"
                  value={height.feet}
                  placeholder="ft"
                  data-testid="profile-height-ft"
                  onChange={(event) => editHeight({ ...height, feet: event.target.value })}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Height, inches"
                  className="form-control tabular"
                  value={height.inches}
                  placeholder="in"
                  data-testid="profile-height-in"
                  onChange={(event) => editHeight({ ...height, inches: event.target.value })}
                />
              </div>
            </div>
          )}

          <div className="col-6 col-sm-4">
            <label className="form-label fw-medium" htmlFor="profile-weight">
              Weight ({units === "imperial" ? "lb" : "kg"})
            </label>
            <input
              id="profile-weight"
              type="text"
              inputMode="decimal"
              className="form-control tabular"
              value={weight}
              data-testid="profile-weight"
              onChange={(event) => editWeight(event.target.value)}
            />
          </div>
        </div>

        <div className="row g-3">
          <div className="col-12">
            <label className="form-label fw-medium" htmlFor="profile-activity">
              How active are you?
            </label>
            <select
              id="profile-activity"
              className="form-select"
              value={activity}
              data-testid="profile-activity"
              onChange={(event) => setActivity(event.target.value as Activity)}
            >
              {ACTIVITY_LEVELS.map((value) => (
                <option key={value} value={value}>
                  {ACTIVITY_LABELS[value]}
                </option>
              ))}
            </select>
            <p className="small text-muted-brand mb-0 mt-1">If you are between two, pick the lower one.</p>
          </div>

          <div className="col-12">
            <label className="form-label fw-medium" htmlFor="profile-goal">
              Goal
            </label>
            <select
              id="profile-goal"
              className="form-select"
              value={goal}
              data-testid="profile-goal"
              onChange={(event) => setGoal(event.target.value as Goal)}
            >
              {GOALS.map((value) => (
                <option key={value} value={value}>
                  {GOAL_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="d-flex flex-column gap-2">
          <legend className="form-label fw-medium mb-0 fs-6">Your own targets (optional)</legend>
          <p className="small text-muted-brand mb-0">
            Leave a box empty to use the calculated figure. A number you enter here is used as it is.
          </p>
          <div className="row g-3">
            <div className="col-6">
              <label className="form-label small" htmlFor="profile-kcal-own">
                Calories a day
              </label>
              <input
                id="profile-kcal-own"
                type="text"
                inputMode="numeric"
                className="form-control tabular"
                value={kcalOwn}
                data-testid="profile-kcal-own"
                onChange={(event) => setKcalOwn(event.target.value)}
              />
            </div>
            <div className="col-6">
              <label className="form-label small" htmlFor="profile-protein-own">
                Protein a day (g)
              </label>
              <input
                id="profile-protein-own"
                type="text"
                inputMode="numeric"
                className="form-control tabular"
                value={proteinOwn}
                data-testid="profile-protein-own"
                onChange={(event) => setProteinOwn(event.target.value)}
              />
            </div>
          </div>
        </fieldset>

        {saved && (
          <p className="small mb-0" role="status" data-testid="profile-saved">
            Saved.
          </p>
        )}

        {state && working && targets && (
          <section
            ref={workingRef}
            aria-label="How your targets were worked out"
            className="d-flex flex-column gap-1"
            data-testid="profile-working"
          >
            <h3 className="h6 fw-semibold mb-1">How these were worked out</h3>
            <p className="fw-medium mb-1" data-testid="profile-in-force">
              Your targets: {figure(targets.calories)} kcal and {figure(targets.protein)} g protein.
            </p>
            <ul className="small mb-0 ps-3 d-flex flex-column gap-1">
              <li data-testid="working-resting">
                Resting energy at age {working.age}: {figure(working.resting)} kcal (Mifflin-St Jeor).
              </li>
              <li data-testid="working-need">
                Times {factor(working.activityFactor)} for your activity: {figure(working.dailyNeed)} kcal a day to
                stay the same weight.
              </li>
              <li data-testid="working-goal">
                {working.goalFactor < 1
                  ? `Minus ${Math.round((1 - working.goalFactor) * 100)}% to lose fat: ${figure(working.afterGoal)} kcal.`
                  : working.goalFactor > 1
                    ? `Plus ${Math.round((working.goalFactor - 1) * 100)}% to gain: ${figure(working.afterGoal)} kcal.`
                    : `No adjustment, to stay the same weight: ${figure(working.afterGoal)} kcal.`}
              </li>
              <li data-testid="working-calories">
                Rounded to {figure(targets.computed.calories)} kcal
                {working.floored ? `, which is the lowest this will suggest (${figure(working.floor)} kcal).` : "."}
              </li>
              <li data-testid="working-protein">
                Protein: {factor(working.proteinPerKg)} g per kg of body weight x {figure(state.profile.weightKg)} kg ={" "}
                {figure(working.proteinBeforeRounding)} g, rounded to {figure(targets.computed.protein)} g.
              </li>
              {targets.caloriesFrom === "own" && (
                <li data-testid="working-calories-own">
                  You set your own calorie target of {figure(targets.calories)} kcal; the calculation gave{" "}
                  {figure(targets.computed.calories)}.
                </li>
              )}
              {targets.proteinFrom === "own" && (
                <li data-testid="working-protein-own">
                  You set your own protein target of {figure(targets.protein)} g; the calculation gave{" "}
                  {figure(targets.computed.protein)}.
                </li>
              )}
            </ul>
          </section>
        )}

        {state && (
          <div className="border-top pt-3">
            {!confirmingRemove ? (
              <button
                type="button"
                className={BTN_GHOST}
                onClick={() => setConfirmingRemove(true)}
                disabled={saving}
                data-testid="profile-remove"
              >
                Remove my profile
              </button>
            ) : (
              <div className="d-flex flex-column gap-2" data-testid="profile-remove-confirm">
                <p className="small mb-0">Remove your profile? Your targets go back to the standard ones.</p>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className={BTN_GHOST}
                    onClick={remove}
                    disabled={saving}
                    data-testid="profile-remove-yes"
                  >
                    Yes, remove it
                  </button>
                  <button type="button" className={BTN_GHOST} onClick={() => setConfirmingRemove(false)}>
                    Keep it
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
