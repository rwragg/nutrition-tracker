import { dayLabel } from "./dates";
import type { Day, Meal } from "./types";

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const names = (items: string[]) => items.join(", ");

/** Why a food cannot be deleted: every meal and day that still refers to it. */
export function describeFoodUsage(meals: Meal[], days: Day[], todayIso: string): string {
  const parts: string[] = [];

  if (meals.length > 0) {
    parts.push(`used in ${count(meals.length, "meal")} (${names(meals.map((meal) => meal.name))})`);
  }
  if (days.length > 0) {
    parts.push(
      `logged directly on ${count(days.length, "day")} (${names(days.map((day) => dayLabel(day.date, todayIso)))})`,
    );
  }

  return parts.join(" and ");
}

/** Why a meal cannot be deleted: every day it is logged on. */
export function describeMealUsage(days: Day[], todayIso: string): string {
  return `logged on ${count(days.length, "day")} (${names(days.map((day) => dayLabel(day.date, todayIso)))})`;
}
