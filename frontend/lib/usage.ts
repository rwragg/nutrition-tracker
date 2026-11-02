import { dayLabel } from "./dates";
import type { Refusal } from "./types";

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const names = (items: string[]) => items.join(", ");

/**
 * Why a food cannot be deleted: every meal and date the server reports still referring to it.
 *
 * The rule itself lives in the backend - a foreign key, plus a check that runs before the delete so
 * it can say what is in the way. This only puts the server's structured answer into the app's own
 * words, so the sentence reads with the labels the app owns ("Today", not "2026-11-01").
 */
export function describeFoodUsage(
  meals: { name: string }[],
  dates: string[],
  todayIso: string,
): string {
  const parts: string[] = [];

  if (meals.length > 0) {
    parts.push(`used in ${count(meals.length, "meal")} (${names(meals.map((meal) => meal.name))})`);
  }
  if (dates.length > 0) {
    parts.push(
      `logged directly on ${count(dates.length, "day")} (${names(
        dates.map((date) => dayLabel(date, todayIso)),
      )})`,
    );
  }

  return parts.join(" and ");
}

/** Why a meal cannot be deleted: every date the server reports it logged on. */
export function describeMealUsage(dates: string[], todayIso: string): string {
  return `logged on ${count(dates.length, "day")} (${names(
    dates.map((date) => dayLabel(date, todayIso)),
  )})`;
}

/**
 * The sentence to show when the server refuses a delete, or null if it refused for another reason -
 * a record that is not there, or a request it rejected outright. Null means the caller falls back
 * to the server's own message.
 */
export function describeRefusal(
  refusal: Refusal,
  kind: "food" | "meal",
  todayIso: string,
): string | null {
  const used =
    kind === "food"
      ? describeFoodUsage(refusal.usedBy.meals, refusal.usedBy.days, todayIso)
      : describeMealUsage(refusal.usedBy.days, todayIso);

  if (!used) return null;

  return `This ${kind} cannot be deleted while something still refers to it - ${used}. Remove it from those first.`;
}
