import type { Food } from "./types";

/** Words that carry no food in them: "cup of rice" is about the rice. */
const FILLER = new Set(["a", "an", "the", "of", "and", "with", "in", "on"]);

/** The words of a name: lower case, punctuation and spacing thrown away, a plural folded to its singular. */
function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 0 && !FILLER.has(word))
    .map((word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word));
}

/**
 * Whether a word the person typed is a word of this food. Equal, or the start of it ("yog" while typing
 * "yogurt"), or - for a longer word - the other way round ("yogurts" against "yogurt"). Three letters
 * is the shortest prefix that means anything: "ri" would match half the list.
 */
function same(typed: string, word: string): boolean {
  if (typed === word) return true;
  if (typed.length >= 3 && word.startsWith(typed)) return true;
  return word.length >= 3 && typed.startsWith(word);
}

export interface FoodMatch {
  food: Food;
  /** The name is the same as what was typed, once case and punctuation are ignored. */
  exact: boolean;
}

/**
 * The foods already in the list that this name could be, best first.
 *
 * Plain matching, no model and no network: it is what stops "greek yogurt" being created a second time
 * when "Greek yogurt, plain 0%" is already there. A food is offered when at least half of what was typed
 * is found in its name; the ones that cover the most of what was typed come first, and among those the
 * ones whose name is mostly what was typed (so "rice" offers "Rice" before "Rice pudding with raisins").
 */
export function matchFoods(typed: string, foods: Food[], limit = 3): FoodMatch[] {
  const wanted = words(typed);
  if (wanted.length === 0 || typed.trim().length < 3) return [];

  const scored: { food: Food; exact: boolean; coverage: number; tightness: number }[] = [];

  for (const food of foods) {
    const have = words(food.name);
    const found = wanted.filter((word) => have.some((candidate) => same(word, candidate))).length;
    if (found === 0 || found / wanted.length < 0.5) continue;

    scored.push({
      food,
      exact: wanted.length === have.length && wanted.every((word, index) => word === have[index]),
      coverage: found / wanted.length,
      tightness: found / Math.max(have.length, 1),
    });
  }

  scored.sort(
    (a, b) =>
      Number(b.exact) - Number(a.exact) ||
      b.coverage - a.coverage ||
      b.tightness - a.tightness ||
      a.food.name.localeCompare(b.food.name),
  );

  return scored.slice(0, limit).map(({ food, exact }) => ({ food, exact }));
}
