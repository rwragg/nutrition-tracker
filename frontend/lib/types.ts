export type Unit = "cup" | "tbsp" | "tsp" | "oz" | "piece" | "slice" | "scoop";

export const UNITS: Unit[] = ["cup", "tbsp", "tsp", "oz", "piece", "slice", "scoop"];

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** A food record: the macros it contributes per one unit. */
export interface Food {
  id: string;
  name: string;
  unit: Unit;
  macros: Macros;
}

/** A food inside a meal, with how much of it the meal uses. */
export interface Ingredient {
  foodId: string;
  quantity: number;
}

/** A meal record: a named group of foods, e.g. "Typical breakfast". */
export interface Meal {
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

/** One thing logged on a day: a food with a quantity, or a whole meal. */
export type LogEntry =
  | { id: string; kind: "food"; foodId: string; quantity: number }
  | { id: string; kind: "meal"; mealId: string };

export type DaySections = Record<Section, LogEntry[]>;

/** A day of the log, addressed by its calendar date. */
export interface Day {
  id: string;
  date: string;
  sections: DaySections;
}

/** Everything the app owns. In memory only, rebuilt on reload. */
export interface Store {
  foods: Food[];
  meals: Meal[];
  days: Day[];
}

export type View = "day" | "foods" | "meals";
