import { formatQuantity } from "./format";
import type { Day, Food, LogEntry, Macros, Meal, Section, Store } from "./types";

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

export const findFood = (store: Store, foodId: string): Food | undefined =>
  store.foods.find((food) => food.id === foodId);

export const findMeal = (store: Store, mealId: string): Meal | undefined =>
  store.meals.find((meal) => meal.id === mealId);

/** Macros for one logged entry: a food scaled by quantity, or a whole meal. */
export function entryMacros(entry: LogEntry, store: Store): Macros {
  if (entry.kind === "food") {
    const food = findFood(store, entry.foodId);
    return food ? scaleMacros(food.macros, entry.quantity) : ZERO;
  }

  const meal = findMeal(store, entry.mealId);
  return meal ? mealMacros(meal, store) : ZERO;
}

export function mealMacros(meal: Meal, store: Store): Macros {
  return meal.ingredients.reduce((total, ingredient) => {
    const food = findFood(store, ingredient.foodId);
    return food ? addMacros(total, scaleMacros(food.macros, ingredient.quantity)) : total;
  }, ZERO);
}

export function totalMacros(entries: LogEntry[], store: Store): Macros {
  return entries.reduce((total, entry) => addMacros(total, entryMacros(entry, store)), ZERO);
}

export function sectionMacros(day: Day, section: Section, store: Store): Macros {
  return totalMacros(day.sections[section], store);
}

export function dayMacros(day: Day, store: Store): Macros {
  return totalMacros(Object.values(day.sections).flat(), store);
}

/** Share of a target, as a whole percentage, uncapped. */
export function percentOfTarget(value: number, target: number): number {
  return Math.round((value / target) * 100);
}

/** Display name and detail line for a logged entry. */
export function entryLabel(entry: LogEntry, store: Store): { name: string; detail: string } {
  if (entry.kind === "food") {
    const food = findFood(store, entry.foodId);
    return {
      name: food?.name ?? "Missing food",
      detail: food ? formatQuantity(entry.quantity, food.unit) : "",
    };
  }

  const meal = findMeal(store, entry.mealId);
  return {
    name: meal?.name ?? "Missing meal",
    detail: meal ? `${meal.ingredients.length} ${meal.ingredients.length === 1 ? "food" : "foods"}` : "",
  };
}

/** The foods inside a meal, for the expanded view. */
export function mealBreakdown(
  meal: Meal,
  store: Store,
): { name: string; detail: string; calories: number }[] {
  return meal.ingredients.map((ingredient) => {
    const food = findFood(store, ingredient.foodId);
    return {
      name: food?.name ?? "Missing food",
      detail: food ? formatQuantity(ingredient.quantity, food.unit) : "",
      calories: food ? scaleMacros(food.macros, ingredient.quantity).calories : 0,
    };
  });
}
