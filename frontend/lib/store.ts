import { SECTIONS, type Day, type Food, type LogEntry, type Meal, type Section, type Store } from "./types";

export type StoreAction =
  | { type: "food/add"; food: Food }
  | { type: "food/update"; food: Food }
  | { type: "food/delete"; foodId: string }
  | { type: "meal/add"; meal: Meal }
  | { type: "meal/update"; meal: Meal }
  | { type: "meal/delete"; mealId: string }
  | { type: "entry/add"; dayId: string; section: Section; entry: LogEntry }
  | { type: "entry/remove"; dayId: string; section: Section; entryId: string };

/** Where a food is still in use. Both the reducer and the UI read this one function. */
export interface FoodUsage {
  meals: Meal[];
  days: Day[];
  total: number;
}

export function foodUsage(store: Store, foodId: string): FoodUsage {
  const meals = store.meals.filter((meal) =>
    meal.ingredients.some((ingredient) => ingredient.foodId === foodId),
  );
  const days = store.days.filter((day) =>
    SECTIONS.some((section) =>
      day.sections[section].some((entry) => entry.kind === "food" && entry.foodId === foodId),
    ),
  );

  return { meals, days, total: meals.length + days.length };
}

/** Days with this meal logged on them. */
export function mealUsage(store: Store, mealId: string): Day[] {
  return store.days.filter((day) =>
    SECTIONS.some((section) =>
      day.sections[section].some((entry) => entry.kind === "meal" && entry.mealId === mealId),
    ),
  );
}

export function storeReducer(store: Store, action: StoreAction): Store {
  switch (action.type) {
    case "food/add":
      return { ...store, foods: [...store.foods, action.food] };

    case "food/update":
      return {
        ...store,
        foods: store.foods.map((food) => (food.id === action.food.id ? action.food : food)),
      };

    case "food/delete":
      // A food a meal or a day still refers to stays: deleting it would silently rewrite both.
      if (foodUsage(store, action.foodId).total > 0) return store;
      return { ...store, foods: store.foods.filter((food) => food.id !== action.foodId) };

    case "meal/add":
      return { ...store, meals: [...store.meals, action.meal] };

    case "meal/update":
      return {
        ...store,
        meals: store.meals.map((meal) => (meal.id === action.meal.id ? action.meal : meal)),
      };

    case "meal/delete":
      if (mealUsage(store, action.mealId).length > 0) return store;
      return { ...store, meals: store.meals.filter((meal) => meal.id !== action.mealId) };

    case "entry/add":
      return {
        ...store,
        days: store.days.map((day) =>
          day.id === action.dayId ? addEntry(day, action.section, action.entry) : day,
        ),
      };

    case "entry/remove":
      return {
        ...store,
        days: store.days.map((day) =>
          day.id === action.dayId ? removeEntry(day, action.section, action.entryId) : day,
        ),
      };
  }
}

function addEntry(day: Day, section: Section, entry: LogEntry): Day {
  return {
    ...day,
    sections: { ...day.sections, [section]: [...day.sections[section], entry] },
  };
}

function removeEntry(day: Day, section: Section, entryId: string): Day {
  return {
    ...day,
    sections: {
      ...day.sections,
      [section]: day.sections[section].filter((entry) => entry.id !== entryId),
    },
  };
}

let sequence = 0;

/** Unique id for a new record. Called from the event handler so the reducer stays pure. */
export function createId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}
