import { describe, expect, it } from "vitest";
import { dummyDay } from "@/lib/dummy-day";
import { formatCalories, formatGrams, formatQuantity } from "@/lib/format";
import {
  addMacros,
  dayMacros,
  entryLabel,
  entryMacros,
  mealBreakdown,
  percentOfTarget,
  scaleMacros,
  totalMacros,
  ZERO,
} from "@/lib/nutrition";
import type { Macros } from "@/lib/types";

const egg: Macros = { calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8 };

describe("macros", () => {
  it("scales an ingredient by quantity", () => {
    expect(entryMacros({ id: "a", kind: "ingredient", foodId: "egg", quantity: 2 })).toEqual(
      scaleMacros(egg, 2),
    );
  });

  it("scales fractionally", () => {
    const half = entryMacros({ id: "a", kind: "ingredient", foodId: "oats", quantity: 0.5 });
    expect(half.calories).toBeCloseTo(150);
    expect(half.protein).toBeCloseTo(5);
  });

  it("returns zeros for an unknown ingredient rather than throwing", () => {
    expect(entryMacros({ id: "a", kind: "ingredient", foodId: "nope", quantity: 3 })).toEqual(ZERO);
  });

  it("sums a meal from its ingredients", () => {
    const meal = entryMacros({ id: "a", kind: "meal", mealId: "typical-breakfast" });
    const manual = [
      { foodId: "oats", quantity: 0.5 },
      { foodId: "banana", quantity: 1 },
      { foodId: "whole-milk", quantity: 1 },
      { foodId: "coffee", quantity: 1 },
    ].reduce(
      (total, ingredient) =>
        addMacros(total, entryMacros({ id: "", kind: "ingredient", ...ingredient })),
      ZERO,
    );

    expect(meal).toEqual(manual);
    expect(meal.calories).toBeGreaterThan(400);
  });

  it("totals an empty day as zero", () => {
    expect(dayMacros({ breakfast: [], lunch: [], dinner: [], snacks: [] })).toEqual(ZERO);
  });

  it("totals every section of the sample day", () => {
    const day = dummyDay();
    const bySection = Object.values(day).map((entries) => totalMacros(entries));
    const expected = bySection.reduce((total, macros) => addMacros(total, macros), ZERO);

    expect(dayMacros(day)).toEqual(expected);
    expect(dayMacros(day).calories).toBeGreaterThan(0);
  });

  it("drops a section's worth of macros when its entries are removed", () => {
    const day = dummyDay();
    const dinnerCalories = dayMacros(day).calories - dayMacros({ ...day, dinner: [] }).calories;
    expect(dinnerCalories).toBeCloseTo(totalMacros(day.dinner).calories);
  });
});

describe("labels and formatting", () => {
  it("labels ingredients with their quantity", () => {
    expect(entryLabel({ id: "a", kind: "ingredient", foodId: "oats", quantity: 0.5 })).toEqual({
      name: "Rolled oats, dry",
      detail: "1/2 cup",
    });
  });

  it("labels meals with their ingredient count", () => {
    expect(entryLabel({ id: "a", kind: "meal", mealId: "light-dinner" })).toEqual({
      name: "Light dinner",
      detail: "4 ingredients",
    });
  });

  it("breaks a meal into ingredient lines that add up to the meal", () => {
    const lines = mealBreakdown("light-dinner");
    const summed = lines.reduce((total, line) => total + line.calories, 0);
    expect(lines).toHaveLength(4);
    expect(summed).toBeCloseTo(entryMacros({ id: "a", kind: "meal", mealId: "light-dinner" }).calories);
  });

  it("writes common fractions as fractions", () => {
    expect(formatQuantity(0.5, "cup")).toBe("1/2 cup");
    expect(formatQuantity(1.5, "tbsp")).toBe("1 1/2 tbsps");
    expect(formatQuantity(1, "cup")).toBe("1 cup");
    expect(formatQuantity(2, "cup")).toBe("2 cups");
    expect(formatQuantity(0.25, "tsp")).toBe("1/4 tsp");
    expect(formatQuantity(0.5, "oz")).toBe("1/2 oz");
  });

  it("rounds calories and grams for display", () => {
    expect(formatCalories(2207.5)).toBe("2,208");
    expect(formatGrams(6.3)).toBe("6.3");
    expect(formatGrams(15.24)).toBe("15");
  });

  it("computes percentages against a target", () => {
    expect(percentOfTarget(1100, 2200)).toBe(50);
    expect(percentOfTarget(0, 2200)).toBe(0);
    expect(percentOfTarget(5, 0)).toBe(0);
  });
});
