export type Unit = "cup" | "tbsp" | "tsp" | "oz" | "piece" | "slice" | "scoop";

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** A single ingredient, with the macros it contributes per one unit. */
export interface Food {
  id: string;
  name: string;
  unit: Unit;
  macros: Macros;
}

/** An ingredient reference inside a meal template. */
export interface Ingredient {
  foodId: string;
  quantity: number;
}

/** A meal: a named group of ingredients, e.g. "Typical Breakfast". */
export interface MealTemplate {
  id: string;
  name: string;
  ingredients: Ingredient[];
}

export const SECTIONS = ["breakfast", "lunch", "dinner", "snacks"] as const;

export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

/** One thing logged for the day: either a single ingredient or a whole meal. */
export type LogEntry =
  | { id: string; kind: "ingredient"; foodId: string; quantity: number }
  | { id: string; kind: "meal"; mealId: string };

export type DayState = Record<Section, LogEntry[]>;
