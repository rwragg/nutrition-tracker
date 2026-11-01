import { FOODS_BY_ID } from "./foods";
import { formatQuantity } from "./format";
import { MEALS_BY_ID } from "./meals";
import { SECTIONS, type DayState, type LogEntry, type Macros } from "./types";

export const ZERO: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

export function scaleMacros(macros: Macros, factor: number): Macros {
  return {
    calories: macros.calories * factor,
    protein: macros.protein * factor,
    carbs: macros.carbs * factor,
    fat: macros.fat * factor,
  };
}

export function totalMacros(entries: LogEntry[]): Macros {
  return entries.reduce((total, entry) => addMacros(total, entryMacros(entry)), ZERO);
}

/** Macros for one logged entry: an ingredient scaled by quantity, or a whole meal. */
export function entryMacros(entry: LogEntry): Macros {
  if (entry.kind === "ingredient") {
    const food = FOODS_BY_ID[entry.foodId];
    return food ? scaleMacros(food.macros, entry.quantity) : ZERO;
  }

  const meal = MEALS_BY_ID[entry.mealId];
  if (!meal) return ZERO;

  return meal.ingredients.reduce(
    (total, ingredient) => addMacros(total, entryMacros({ id: "", kind: "ingredient", ...ingredient })),
    ZERO,
  );
}

export function dayMacros(day: DayState): Macros {
  return SECTIONS.reduce((total, section) => addMacros(total, totalMacros(day[section])), ZERO);
}

/** Share of a target, as a whole percentage, uncapped. */
export function percentOfTarget(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.round((value / target) * 100);
}

/** Display name and detail line for a logged entry. */
export function entryLabel(entry: LogEntry): { name: string; detail: string } {
  if (entry.kind === "ingredient") {
    const food = FOODS_BY_ID[entry.foodId];
    return {
      name: food?.name ?? "Unknown ingredient",
      detail: food ? formatQuantity(entry.quantity, food.unit) : "",
    };
  }

  const meal = MEALS_BY_ID[entry.mealId];
  return {
    name: meal?.name ?? "Unknown meal",
    detail: meal ? `${meal.ingredients.length} ingredients` : "",
  };
}

/** The ingredient lines of a logged meal, for the expanded view. */
export function mealBreakdown(mealId: string): { name: string; detail: string; calories: number }[] {
  const meal = MEALS_BY_ID[mealId];
  if (!meal) return [];

  return meal.ingredients.map((ingredient) => {
    const food = FOODS_BY_ID[ingredient.foodId];
    const macros = entryMacros({ id: "", kind: "ingredient", ...ingredient });
    return {
      name: food?.name ?? "Unknown ingredient",
      detail: food ? formatQuantity(ingredient.quantity, food.unit) : "",
      calories: macros.calories,
    };
  });
}
