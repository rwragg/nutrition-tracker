import { formatQuantity } from "./format";
import type { Unit } from "./types";

/**
 * What a quantity may be, per unit, and how a typed one is read.
 *
 * The limits used to be one pair for every food (a quarter to 20, in quarters). That suits a cup or a tablespoon and
 * is wrong for grams, where 183 g is an ordinary serving, so a food stored per gram (D13) could not be logged from
 * the Add food dialog at all. A gram is the one unit that is a weight, so it gets its own rules; the rest keep theirs.
 *
 * Nothing here rewrites what a person types. The box used to clamp and round on every keystroke, so clearing it
 * snapped it to the minimum and the next digits were appended to that: typing 183 gave 0.26. A typed amount is read
 * after the fact, and an amount that is out of range is said to be, not quietly changed.
 */
export interface QuantityRules {
  min: number;
  max: number;
  /** What the minus and plus buttons move by. */
  step: number;
  /** What the box holds when a food of this unit is chosen. */
  start: number;
}

const HOUSEHOLD: QuantityRules = { min: 0.25, max: 20, step: 0.25, start: 1 };
const GRAMS: QuantityRules = { min: 1, max: 5000, step: 10, start: 100 };

export function quantityRules(unit: Unit): QuantityRules {
  return unit === "g" ? GRAMS : HOUSEHOLD;
}

export type QuantityReading =
  { ok: true; value: number } | { ok: false; problem: string };

/** Read what is in the box. Whole range is checked before anything is rounded to two places. */
export function readQuantity(text: string, unit: Unit): QuantityReading {
  const rules = quantityRules(unit);
  const range = `from ${formatQuantity(rules.min, unit)} to ${formatQuantity(rules.max, unit)}`;
  const trimmed = text.trim();

  if (trimmed === "")
    return { ok: false, problem: `Enter an amount ${range}.` };

  const value = Number(trimmed);
  if (!Number.isFinite(value))
    return {
      ok: false,
      problem: `That is not a number. Enter an amount ${range}.`,
    };
  if (value < rules.min || value > rules.max)
    return { ok: false, problem: `Enter an amount ${range}.` };

  return { ok: true, value: Math.round(value * 100) / 100 };
}
