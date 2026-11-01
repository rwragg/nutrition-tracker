import type { DayState } from "./types";

/** The sample day the app opens with. */
export function dummyDay(): DayState {
  return {
    breakfast: [
      { id: "bf-1", kind: "meal", mealId: "typical-breakfast" },
      { id: "bf-2", kind: "ingredient", foodId: "blueberries", quantity: 1 },
    ],
    lunch: [
      { id: "ln-1", kind: "meal", mealId: "protein-lunch-bowl" },
      { id: "ln-2", kind: "ingredient", foodId: "string-cheese", quantity: 1 },
    ],
    dinner: [{ id: "dn-1", kind: "meal", mealId: "light-dinner" }],
    snacks: [
      { id: "sn-1", kind: "ingredient", foodId: "almonds", quantity: 1 },
      { id: "sn-2", kind: "ingredient", foodId: "greek-yogurt", quantity: 1 },
      { id: "sn-3", kind: "ingredient", foodId: "orange", quantity: 1 },
    ],
  };
}
