import { dummyDay } from "./dummy-day";
import type { DayState, Section } from "./types";

export type DayAction =
  | { type: "ingredient/add"; id: string; section: Section; foodId: string; quantity: number }
  | { type: "meal/add"; id: string; section: Section; mealId: string }
  | { type: "entry/remove"; section: Section; id: string };

export function dayReducer(day: DayState, action: DayAction): DayState {
  switch (action.type) {
    case "ingredient/add":
      return {
        ...day,
        [action.section]: [
          ...day[action.section],
          { id: action.id, kind: "ingredient", foodId: action.foodId, quantity: action.quantity },
        ],
      };

    case "meal/add":
      return {
        ...day,
        [action.section]: [...day[action.section], { id: action.id, kind: "meal", mealId: action.mealId }],
      };

    case "entry/remove":
      return {
        ...day,
        [action.section]: day[action.section].filter((entry) => entry.id !== action.id),
      };
  }
}

let sequence = 0;

/** Unique id for a new entry; called from the UI event handler so the reducer stays pure. */
export function createEntryId(): string {
  sequence += 1;
  return `entry-${sequence}`;
}

export const emptyDay = (): DayState => ({ breakfast: [], lunch: [], dinner: [], snacks: [] });

export const initialDay = dummyDay;
