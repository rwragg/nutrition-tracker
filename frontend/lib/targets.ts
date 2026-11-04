import type { Macros, ProfileState } from "./types";
import { formatWeight } from "./units";

/**
 * What an account with no profile sees (R38). Unchanged since the first version, and still the answer
 * for anyone who has not set one up.
 */
export const DAILY_TARGETS: Macros = {
  calories: 2200,
  protein: 140,
  carbs: 250,
  fat: 70,
};

/**
 * The targets the Day view draws. Carbs and fat are null for someone with a profile (D30): the person
 * asked for calories and protein, and a fixed 250 g and 70 g beside a personal calorie figure would
 * contradict it, while any split worked out here would be a second set of rules nobody agreed to.
 */
export interface DayTargets {
  calories: number;
  protein: number;
  carbs: number | null;
  fat: number | null;
}

/**
 * Choose which targets are in force. This only selects: every figure with a profile was worked out by
 * the server (D25), so there is no arithmetic here to drift from the one that is tested.
 */
export function dayTargets(state: ProfileState | null): DayTargets {
  if (!state) return { ...DAILY_TARGETS };

  return {
    calories: state.targets.calories,
    protein: state.targets.protein,
    carbs: null,
    fat: null,
  };
}

/** "4 Nov", or "4 Nov 2025" when it was not this year: a weight from last winter should say so. */
export function shortDate(iso: string, now: Date = new Date()): string {
  const [year, month, day] = iso.split("-").map(Number);
  const named = new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  return year === now.getFullYear() ? named : `${named} ${year}`;
}

/**
 * What the targets rest on, in a sentence (R48): a protein target built on a six-month-old weight is a
 * wrong number that looks right, so the weight and its date sit beside it. Null with no profile.
 */
export function basisLine(state: ProfileState | null, now: Date = new Date()): string | null {
  if (!state) return null;

  const { profile, targets } = state;
  const weight = `${formatWeight(profile.weightKg, profile.units)}, set ${shortDate(profile.weightOn, now)}`;

  if (targets.caloriesFrom === "own" && targets.proteinFrom === "own") return "Your own targets.";
  if (targets.caloriesFrom === "own") return `Calories: your own. Protein: from your profile (${weight}).`;
  if (targets.proteinFrom === "own") return `Protein: your own. Calories: from your profile (${weight}).`;

  return `From your profile (${weight}).`;
}
