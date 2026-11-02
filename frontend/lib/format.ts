import type { Unit } from "./types";

const FRACTIONS: Record<string, string> = {
  "0.25": "1/4",
  "0.5": "1/2",
  "0.75": "3/4",
};

/** Units that do not take a plural. "183 g", never "183 gs". */
const NO_PLURAL: Unit[] = ["g"];

/** The unit as it reads after a count: "cup" -> "cups", "g" -> "g". */
export function pluralUnit(unit: Unit, quantity = 2): string {
  return quantity > 1 && !NO_PLURAL.includes(unit) ? `${unit}s` : unit;
}

/** "0.5" + "cup" -> "1/2 cup"; "1.5" + "tbsp" -> "1 1/2 tbsp"; "183" + "g" -> "183 g". */
export function formatQuantity(quantity: number, unit: Unit): string {
  const whole = Math.floor(quantity);
  const rest = Number((quantity - whole).toFixed(2));
  // Recipes write "1/2 cup" and "1 1/2 tbsp": plural only past one whole unit.
  const suffix = pluralUnit(unit, quantity);

  if (rest === 0) return `${whole} ${suffix}`;

  const fraction = FRACTIONS[String(rest)];
  if (fraction) return whole > 0 ? `${whole} ${fraction} ${suffix}` : `${fraction} ${suffix}`;

  return `${Number(quantity.toFixed(2))} ${suffix}`;
}

export function formatCalories(calories: number): string {
  return Math.round(calories).toLocaleString("en-US");
}

/** Grams: one decimal below 10g, whole numbers above. */
export function formatGrams(grams: number): string {
  return grams < 10 ? (Math.round(grams * 10) / 10).toString() : Math.round(grams).toString();
}
