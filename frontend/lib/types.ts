export type Unit = "cup" | "tbsp" | "tsp" | "oz" | "piece" | "slice" | "scoop" | "g";

/** `g` is the gram basis: a food recorded in grams carries its macros per gram. */
export const UNITS: Unit[] = ["cup", "tbsp", "tsp", "oz", "piece", "slice", "scoop", "g"];

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Where a food's figures came from: typed by the person, or looked up in USDA FoodData Central (D20). */
export type FoodSource = "typed" | "usda";

/** A food record: the macros it contributes per one unit. */
export interface Food {
  id: string;
  name: string;
  unit: Unit;
  macros: Macros;
  /** Absent in tests that build a food by hand; the server always sends it. */
  source?: FoodSource;
  /** USDA's id for a looked-up food. */
  sourceId?: string | null;
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

/** An entry as it is sent, before the server gives it an id. */
export type EntryDraft =
  | { kind: "food"; foodId: string; quantity: number }
  | { kind: "meal"; mealId: string };

export type DaySections = Record<Section, LogEntry[]>;

/**
 * A day of the log, addressed by its calendar date: `id` is the date, because a day has no
 * identity of its own.
 *
 * `macros` is the server's figure for the day, and it is always present - the day list carries it
 * for every date. `sections` is filled in only for the day that is open; the arithmetic the views
 * do over those sections is the app's own, and the two agree (a test asserts the open day's
 * computed total against the server's figure).
 */
export interface Day {
  id: string;
  date: string;
  macros: Macros;
  sections: DaySections;
}

/** A food as it is sent, before the server gives it an id. */
export interface FoodInput {
  name: string;
  unit: Unit;
  macros: Macros;
  /** A looked-up food says so, and carries USDA's id; a typed one says neither. */
  source?: FoodSource;
  sourceId?: string;
}

/**
 * A food USDA offers for a name that is not in the list. `macros` are per gram (D13) and are what a
 * food made from it stores; `per100g` is how a label reads, for showing the person.
 */
export interface FoodCandidate {
  fdcId: string;
  name: string;
  dataType: string;
  unit: "g";
  per100g: Macros;
  macros: Macros;
}

/** A meal as it is sent, before the server gives it an id. */
export interface MealInput {
  name: string;
  ingredients: Ingredient[];
}

/** Where a record is still in use, as the server reports it when it refuses a delete. */
export interface RefusalUsage {
  meals: { id: string; name: string }[];
  days: string[];
}

export interface Refusal {
  message: string;
  usedBy: RefusalUsage;
}

/** The outcome of a write. A refusal is an answer, not an exception, so it is returned. */
export type SaveResult = { ok: true } | { ok: false; message: string; refusal?: Refusal };

/** One date in the day list, with the server's figure for it. */
export interface DaySummary {
  date: string;
  macros: Macros;
}

/** The records the app holds, as the server last reported them. */
export interface Store {
  foods: Food[];
  meals: Meal[];
  days: DaySummary[];
}

export type View = "day" | "foods" | "meals";

// --- a profile, and the targets worked out from it (Part 12) -------------------------------

export const SEXES = ["female", "male"] as const;
export type Sex = (typeof SEXES)[number];

export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "very_active"] as const;
export type Activity = (typeof ACTIVITY_LEVELS)[number];

export const GOALS = ["lose", "maintain", "gain"] as const;
export type Goal = (typeof GOALS)[number];

export type UnitSystem = "metric" | "imperial";

/**
 * What the targets are worked out from. Always metric: `units` only says how the form shows it
 * (R39). A person's own targets are optional, and null means "use the calculated one" (R46).
 */
export interface Profile {
  displayName: string;
  sex: Sex;
  /** An ISO date. */
  birthDate: string;
  heightCm: number;
  weightKg: number;
  /** An ISO date. Set by the server, and kept when a save does not change the weight. */
  weightOn: string;
  activity: Activity;
  goal: Goal;
  units: UnitSystem;
  kcalOverride: number | null;
  proteinOverride: number | null;
}

/** A profile as it is sent: the server dates the weight, so the client does not. */
export type ProfileInput = Omit<Profile, "weightOn">;

/** Every step of the arithmetic, so the screen can show its working (R47). */
export interface Working {
  age: number;
  resting: number;
  activityFactor: number;
  dailyNeed: number;
  goalFactor: number;
  afterGoal: number;
  floor: number;
  floored: boolean;
  proteinPerKg: number;
  proteinBeforeRounding: number;
}

/** The figures in force, where each came from, and what the equation said regardless. */
export interface ProfileTargets {
  calories: number;
  protein: number;
  caloriesFrom: "profile" | "own";
  proteinFrom: "profile" | "own";
  computed: { calories: number; protein: number };
  working: Working;
}

/** A profile and its targets, which always arrive together: the app never works a target out itself (D25). */
export interface ProfileState {
  profile: Profile;
  targets: ProfileTargets;
}
