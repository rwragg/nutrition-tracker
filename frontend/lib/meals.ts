import type { MealTemplate } from "./types";

export const MEAL_TEMPLATES: MealTemplate[] = [
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

export const MEALS_BY_ID: Record<string, MealTemplate> = Object.fromEntries(
  MEAL_TEMPLATES.map((meal) => [meal.id, meal]),
);
