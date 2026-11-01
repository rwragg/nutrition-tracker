import { shiftIsoDate, toIsoDate } from "./dates";
import type { Day, Food, Meal, Store } from "./types";

/** Seed foods. Macros are per one unit, at typical USDA values. */
export const SEED_FOODS: Food[] = [
  { id: "oats", name: "Rolled oats, dry", unit: "cup", macros: { calories: 300, protein: 10, carbs: 54, fat: 6 } },
  { id: "whole-milk", name: "Whole milk", unit: "cup", macros: { calories: 149, protein: 8, carbs: 12, fat: 8 } },
  { id: "greek-yogurt", name: "Greek yogurt, plain 0%", unit: "cup", macros: { calories: 130, protein: 23, carbs: 9, fat: 0.7 } },
  { id: "cottage-cheese", name: "Cottage cheese, 1%", unit: "cup", macros: { calories: 163, protein: 28, carbs: 6.2, fat: 2.3 } },
  { id: "whey", name: "Whey protein", unit: "scoop", macros: { calories: 120, protein: 24, carbs: 3, fat: 1.5 } },
  { id: "egg", name: "Egg, large", unit: "piece", macros: { calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8 } },
  { id: "firm-tofu", name: "Tofu, firm", unit: "cup", macros: { calories: 363, protein: 43.6, carbs: 10.6, fat: 22 } },
  { id: "banana", name: "Banana", unit: "piece", macros: { calories: 105, protein: 1.3, carbs: 27, fat: 0.4 } },
  { id: "orange", name: "Orange", unit: "piece", macros: { calories: 62, protein: 1.2, carbs: 15.4, fat: 0.2 } },
  { id: "blueberries", name: "Blueberries", unit: "cup", macros: { calories: 84, protein: 1.1, carbs: 21.4, fat: 0.5 } },
  { id: "brown-rice", name: "Brown rice, cooked", unit: "cup", macros: { calories: 218, protein: 4.5, carbs: 45.8, fat: 1.6 } },
  { id: "white-rice", name: "White rice, cooked", unit: "cup", macros: { calories: 205, protein: 4.3, carbs: 44.5, fat: 0.4 } },
  { id: "quinoa", name: "Quinoa, cooked", unit: "cup", macros: { calories: 222, protein: 8.1, carbs: 39.4, fat: 3.6 } },
  { id: "whole-wheat-pasta", name: "Whole wheat pasta, cooked", unit: "cup", macros: { calories: 174, protein: 7.5, carbs: 37.2, fat: 0.8 } },
  { id: "black-beans", name: "Black beans, cooked", unit: "cup", macros: { calories: 227, protein: 15.2, carbs: 40.8, fat: 0.9 } },
  { id: "chickpeas", name: "Chickpeas, cooked", unit: "cup", macros: { calories: 269, protein: 14.5, carbs: 45, fat: 4.2 } },
  { id: "lentils", name: "Lentils, cooked", unit: "cup", macros: { calories: 230, protein: 17.9, carbs: 39.9, fat: 0.8 } },
  { id: "hummus", name: "Hummus", unit: "tbsp", macros: { calories: 35, protein: 1, carbs: 3, fat: 2.5 } },
  { id: "whole-wheat-bread", name: "Whole wheat bread", unit: "slice", macros: { calories: 81, protein: 4, carbs: 13.8, fat: 1.1 } },
  { id: "peanut-butter", name: "Peanut butter", unit: "tbsp", macros: { calories: 94, protein: 4, carbs: 3.2, fat: 8 } },
  { id: "almonds", name: "Almonds", unit: "oz", macros: { calories: 164, protein: 6, carbs: 6.1, fat: 14.2 } },
  { id: "olive-oil", name: "Olive oil", unit: "tbsp", macros: { calories: 119, protein: 0, carbs: 0, fat: 13.5 } },
  { id: "avocado", name: "Avocado, half", unit: "piece", macros: { calories: 120, protein: 1.5, carbs: 6.4, fat: 11 } },
  { id: "cheddar", name: "Cheddar cheese", unit: "oz", macros: { calories: 113, protein: 7, carbs: 0.4, fat: 9.3 } },
  { id: "string-cheese", name: "String cheese", unit: "piece", macros: { calories: 80, protein: 7, carbs: 1, fat: 6 } },
  { id: "broccoli", name: "Broccoli, steamed", unit: "cup", macros: { calories: 31, protein: 2.5, carbs: 6, fat: 0.3 } },
  { id: "spinach", name: "Spinach, raw", unit: "cup", macros: { calories: 7, protein: 0.9, carbs: 1.1, fat: 0.1 } },
  { id: "sweet-potato", name: "Sweet potato, baked", unit: "piece", macros: { calories: 103, protein: 2.3, carbs: 23.6, fat: 0.2 } },
  { id: "tomato-sauce", name: "Tomato sauce", unit: "cup", macros: { calories: 130, protein: 4, carbs: 20, fat: 4 } },
  { id: "maple-syrup", name: "Maple syrup", unit: "tbsp", macros: { calories: 52, protein: 0, carbs: 13.4, fat: 0 } },
  { id: "coffee", name: "Coffee, black", unit: "cup", macros: { calories: 2, protein: 0.3, carbs: 0, fat: 0 } },
];

export const SEED_MEALS: Meal[] = [
  {
    id: "typical-breakfast",
    name: "Typical breakfast",
    ingredients: [
      { foodId: "oats", quantity: 0.5 },
      { foodId: "banana", quantity: 1 },
      { foodId: "whole-milk", quantity: 1 },
      { foodId: "coffee", quantity: 1 },
    ],
  },
  {
    id: "protein-lunch-bowl",
    name: "Protein lunch bowl",
    ingredients: [
      { foodId: "brown-rice", quantity: 1 },
      { foodId: "black-beans", quantity: 1 },
      { foodId: "firm-tofu", quantity: 0.5 },
      { foodId: "broccoli", quantity: 1 },
    ],
  },
  {
    id: "light-dinner",
    name: "Light dinner",
    ingredients: [
      { foodId: "quinoa", quantity: 1 },
      { foodId: "chickpeas", quantity: 1 },
      { foodId: "spinach", quantity: 2 },
      { foodId: "olive-oil", quantity: 1 },
    ],
  },
  {
    id: "post-workout-shake",
    name: "Post-workout shake",
    ingredients: [
      { foodId: "whey", quantity: 1 },
      { foodId: "whole-milk", quantity: 1 },
      { foodId: "banana", quantity: 1 },
    ],
  },
  {
    id: "pasta-night",
    name: "Pasta night",
    ingredients: [
      { foodId: "whole-wheat-pasta", quantity: 1.5 },
      { foodId: "tomato-sauce", quantity: 0.5 },
      { foodId: "cheddar", quantity: 1 },
      { foodId: "olive-oil", quantity: 1 },
    ],
  },
];

const EMPTY_SECTIONS = { breakfast: [], lunch: [], dinner: [], snacks: [] };

/** Three days of history, newest first, ending on the given day. */
export function seedDays(today: Date = new Date()): Day[] {
  const todayIso = toIsoDate(today);
  const yesterdayIso = shiftIsoDate(todayIso, -1);
  const earlierIso = shiftIsoDate(todayIso, -2);

  return [
    {
      id: todayIso,
      date: todayIso,
      sections: {
        breakfast: [
          { id: "t-bf-1", kind: "meal", mealId: "typical-breakfast" },
          { id: "t-bf-2", kind: "food", foodId: "blueberries", quantity: 1 },
        ],
        lunch: [
          { id: "t-ln-1", kind: "meal", mealId: "protein-lunch-bowl" },
          { id: "t-ln-2", kind: "food", foodId: "string-cheese", quantity: 1 },
        ],
        dinner: [{ id: "t-dn-1", kind: "meal", mealId: "light-dinner" }],
        snacks: [
          { id: "t-sn-1", kind: "food", foodId: "almonds", quantity: 1 },
          { id: "t-sn-2", kind: "food", foodId: "greek-yogurt", quantity: 1 },
          { id: "t-sn-3", kind: "food", foodId: "orange", quantity: 1 },
        ],
      },
    },
    {
      id: yesterdayIso,
      date: yesterdayIso,
      sections: {
        ...EMPTY_SECTIONS,
        breakfast: [
          { id: "y-bf-1", kind: "meal", mealId: "post-workout-shake" },
          { id: "y-bf-2", kind: "food", foodId: "oats", quantity: 0.5 },
        ],
        lunch: [{ id: "y-ln-1", kind: "meal", mealId: "protein-lunch-bowl" }],
        snacks: [
          { id: "y-sn-1", kind: "food", foodId: "peanut-butter", quantity: 2 },
          { id: "y-sn-2", kind: "food", foodId: "whole-wheat-bread", quantity: 1 },
        ],
      },
    },
    {
      id: earlierIso,
      date: earlierIso,
      sections: {
        ...EMPTY_SECTIONS,
        breakfast: [{ id: "e-bf-1", kind: "meal", mealId: "typical-breakfast" }],
        dinner: [
          { id: "e-dn-1", kind: "meal", mealId: "pasta-night" },
          { id: "e-dn-2", kind: "food", foodId: "avocado", quantity: 1 },
        ],
        snacks: [{ id: "e-sn-1", kind: "food", foodId: "cottage-cheese", quantity: 1 }],
      },
    },
  ];
}

export function createSeedStore(today: Date = new Date()): Store {
  return {
    foods: SEED_FOODS.map((food) => ({ ...food, macros: { ...food.macros } })),
    meals: SEED_MEALS.map((meal) => ({ ...meal, ingredients: meal.ingredients.map((i) => ({ ...i })) })),
    days: seedDays(today),
  };
}
