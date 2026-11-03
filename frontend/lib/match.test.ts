import { describe, expect, it } from "vitest";
import { matchFoods } from "./match";
import type { Food, Unit } from "./types";

function food(id: string, name: string, unit: Unit = "cup"): Food {
  return { id, name, unit, macros: { calories: 100, protein: 1, carbs: 1, fat: 1 } };
}

const LIST = [
  food("yogurt", "Greek yogurt, plain 0%"),
  food("brown-rice", "Brown rice, cooked"),
  food("white-rice", "White rice, cooked"),
  food("pudding", "Rice pudding with raisins"),
  food("egg", "Egg, large", "piece"),
  food("oats", "Rolled oats, dry"),
];

const names = (typed: string, foods = LIST) => matchFoods(typed, foods).map((match) => match.food.name);

describe("matching a typed name against the foods already there", () => {
  it("finds a food whose name only contains what was typed", () => {
    expect(names("greek yogurt")).toEqual(["Greek yogurt, plain 0%"]);
  });

  it("ignores case, punctuation and spacing", () => {
    expect(names("  GREEK,   yogurt!! ")).toEqual(["Greek yogurt, plain 0%"]);
  });

  it("matches a plural against its singular, both ways", () => {
    expect(names("eggs")).toEqual(["Egg, large"]);
    expect(names("rolled oat")).toEqual(["Rolled oats, dry"]);
  });

  it("matches the start of a word, so it can suggest while the person is still typing", () => {
    expect(names("yog")).toEqual(["Greek yogurt, plain 0%"]);
  });

  it("does not match on fewer than three letters", () => {
    expect(names("ri")).toEqual([]);
    expect(names("")).toEqual([]);
    expect(names("  ")).toEqual([]);
  });

  it("puts a name that is mostly what was typed ahead of one that merely contains it", () => {
    const list = [food("a", "Rice pudding with raisins"), food("b", "Rice"), food("c", "Brown rice, cooked")];
    expect(names("rice", list)).toEqual(["Rice", "Brown rice, cooked", "Rice pudding with raisins"]);
  });

  it("offers at most three, and says nothing when nothing is close", () => {
    expect(names("rice")).toHaveLength(3);
    expect(names("tempeh")).toEqual([]);
  });

  it("offers a food when most, not all, of what was typed is in its name", () => {
    expect(names("greek yogurt vanilla")).toEqual(["Greek yogurt, plain 0%"]);
    expect(names("greek tempeh seitan")).toEqual([]);
  });

  it("is not thrown by filler words", () => {
    expect(names("a cup of the rice")).toContain("Brown rice, cooked");
    expect(names("of the a")).toEqual([]);
  });

  it("marks a name that is already there, and puts it first", () => {
    const [first] = matchFoods("brown rice cooked", LIST);
    expect(first.food.name).toBe("Brown rice, cooked");
    expect(first.exact).toBe(true);

    expect(matchFoods("brown rice", LIST).every((match) => !match.exact)).toBe(true);
  });

  it("copes with an empty list", () => {
    expect(matchFoods("rice", [])).toEqual([]);
  });
});
