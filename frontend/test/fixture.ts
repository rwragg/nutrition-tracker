import type { Day, Food, Meal, Store } from "@/lib/types";

/**
 * A small, explicit world for the frontend tests, written out rather than derived.
 *
 * The sample data the app ships is seeded into the backend's database on first run, so the frontend
 * no longer holds a copy of it and these tests no longer build their expectations from it. This is a
 * *test world*: a handful of foods and meals chosen so the relationships the tests assert are real
 * (banana is used by two meals, almonds are logged on the open day), with dates relative to today so
 * the day labels are the ones the app would show. The seeded figures are asserted where they
 * actually come from - the end-to-end suite, against the running container.
 */
const food = (id: string, name: string, unit: Food["unit"], calories: number, protein: number, carbs: number, fat: number): Food => ({
  id,
  name,
  unit,
  macros: { calories, protein, carbs, fat },
});

export const FOODS: Food[] = [
  food("hummus", "Hummus", "tbsp", 35, 1, 3, 2.5),
  food("blueberries", "Blueberries", "cup", 84, 1.1, 21.4, 0.5),
  food("almonds", "Almonds", "oz", 164, 6, 6.1, 14.2),
  food("banana", "Banana", "piece", 105, 1.3, 27, 0.4),
  food("oats", "Rolled oats, dry", "cup", 300, 10, 54, 6),
  food("milk", "Whole milk", "cup", 149, 8, 12, 8),
  food("whey", "Whey protein", "scoop", 120, 24, 3, 1.5),
  food("black-beans", "Black beans, cooked", "cup", 227, 15.2, 40.8, 0.9),
  food("white-rice", "White rice, cooked", "cup", 205, 4.3, 44.5, 0.4),
  food("string-cheese", "String cheese", "piece", 80, 7, 1, 6),
];

export const MEALS: Meal[] = [
  {
    id: "typical-breakfast",
    name: "Typical breakfast",
    ingredients: [
      { foodId: "oats", quantity: 0.5 },
      { foodId: "banana", quantity: 1 },
    ],
  },
  {
    id: "post-workout-shake",
    name: "Post-workout shake",
    ingredients: [
      { foodId: "whey", quantity: 1 },
      { foodId: "milk", quantity: 1 },
      { foodId: "banana", quantity: 1 },
    ],
  },
  {
    id: "light-dinner",
    name: "Light dinner",
    ingredients: [
      { foodId: "black-beans", quantity: 1 },
      { foodId: "white-rice", quantity: 1 },
    ],
  },
  {
    id: "protein-lunch-bowl",
    name: "Protein lunch bowl",
    ingredients: [
      { foodId: "black-beans", quantity: 1 },
      { foodId: "white-rice", quantity: 1 },
      { foodId: "string-cheese", quantity: 1 },
    ],
  },
];

function isoDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Today, yesterday and the day before - the three the app opens with. */
export const DATES = [isoDaysAgo(0), isoDaysAgo(1), isoDaysAgo(2)];

/** The entries on each date, newest first, in the order the server would return them. */
export const SECTIONS_BY_DATE: Record<string, Day["sections"]> = {
  [DATES[0]]: {
    breakfast: [
      { id: "e-bf-1", kind: "meal", mealId: "typical-breakfast" },
      { id: "e-bf-2", kind: "food", foodId: "blueberries", quantity: 1 },
    ],
    lunch: [{ id: "e-ln-1", kind: "meal", mealId: "protein-lunch-bowl" }],
    dinner: [],
    snacks: [{ id: "e-sn-1", kind: "food", foodId: "almonds", quantity: 1 }],
  },
  [DATES[1]]: {
    breakfast: [{ id: "e-y-bf-1", kind: "meal", mealId: "post-workout-shake" }],
    lunch: [{ id: "e-y-ln-1", kind: "meal", mealId: "protein-lunch-bowl" }],
    dinner: [],
    snacks: [],
  },
  [DATES[2]]: {
    breakfast: [],
    lunch: [],
    dinner: [{ id: "e-d-dn-1", kind: "meal", mealId: "light-dinner" }],
    snacks: [],
  },
};

export const EMPTY_SECTIONS: Day["sections"] = {
  breakfast: [],
  lunch: [],
  dinner: [],
  snacks: [],
};

/**
 * A day's figures, worked out here rather than with the app's own maths: a food entry scales its
 * food, a meal entry contributes its meal. The tests assert the app's arithmetic against these, so
 * sharing an implementation with it would make the comparison say nothing.
 */
export function macrosOf(sections: Day["sections"]): Store["days"][number]["macros"] {
  const total = { calories: 0, protein: 0, carbs: 0, fat: 0 };

  for (const entries of Object.values(sections)) {
    for (const entry of entries) {
      if (entry.kind === "food") {
        const item = FOODS.find((food) => food.id === entry.foodId);
        if (!item) continue;
        total.calories += item.macros.calories * entry.quantity;
        total.protein += item.macros.protein * entry.quantity;
        total.carbs += item.macros.carbs * entry.quantity;
        total.fat += item.macros.fat * entry.quantity;
      } else {
        const meal = MEALS.find((candidate) => candidate.id === entry.mealId);
        if (!meal) continue;
        for (const ingredient of meal.ingredients) {
          const item = FOODS.find((food) => food.id === ingredient.foodId);
          if (!item) continue;
          total.calories += item.macros.calories * ingredient.quantity;
          total.protein += item.macros.protein * ingredient.quantity;
          total.carbs += item.macros.carbs * ingredient.quantity;
          total.fat += item.macros.fat * ingredient.quantity;
        }
      }
    }
  }

  return total;
}

/** A day as the API would return it: its date, its sections, and its figures. */
export function dayWithSections(date: string): Day {
  const sections = SECTIONS_BY_DATE[date] ?? EMPTY_SECTIONS;
  return { id: date, date, macros: macrosOf(sections), sections };
}

/** The records the app looks up while it renders, with each date's figures. */
export function sampleStore(): Store {
  return {
    foods: FOODS,
    meals: MEALS,
    days: DATES.map((date) => ({ date, macros: macrosOf(SECTIONS_BY_DATE[date] ?? EMPTY_SECTIONS) })),
  };
}
