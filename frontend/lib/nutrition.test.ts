import { describe, expect, it } from "vitest";
import { formatCalories, formatGrams, formatQuantity } from "@/lib/format";
import {
  addMacros,
  dayMacros,
  entryLabel,
  entryMacros,
  mealBreakdown,
  mealMacros,
  percentOfTarget,
  scaleMacros,
  sectionMacros,
  totalMacros,
  ZERO,
} from "@/lib/nutrition";
import { createSeedStore } from "@/lib/seed";
import type { Macros, Store } from "@/lib/types";

const TODAY = new Date(2026, 10, 1);
const store = (): Store => createSeedStore(TODAY);

const egg: Macros = { calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8 };

describe("macros", () => {
  it("scales a food by quantity", () => {
    expect(entryMacros({ id: "a", kind: "food", foodId: "egg", quantity: 2 }, store())).toEqual(
      scaleMacros(egg, 2),
    );
  });

  it("scales fractionally", () => {
    const half = entryMacros({ id: "a", kind: "food", foodId: "oats", quantity: 0.5 }, store());
    expect(half.calories).toBeCloseTo(150);
    expect(half.protein).toBeCloseTo(5);
  });

  it("sums a meal from the foods in it", () => {
    const current = store();
    const meal = current.meals.find((candidate) => candidate.id === "typical-breakfast")!;

    const manual = meal.ingredients.reduce(
      (total, ingredient) =>
        addMacros(
          total,
          entryMacros({ id: "", kind: "food", foodId: ingredient.foodId, quantity: ingredient.quantity }, current),
        ),
      ZERO,
    );

    expect(mealMacros(meal, current)).toEqual(manual);
    expect(mealMacros(meal, current).calories).toBeGreaterThan(400);
  });

  it("totals an empty day as zero", () => {
    const current = store();
    const empty = { id: "empty", date: "2026-11-05", sections: { breakfast: [], lunch: [], dinner: [], snacks: [] } };
    expect(dayMacros(empty, current)).toEqual(ZERO);
  });

  it("totals a day from its sections", () => {
    const current = store();
    const day = current.days[0];
    const summed = (["breakfast", "lunch", "dinner", "snacks"] as const).reduce(
      (total, section) => addMacros(total, sectionMacros(day, section, current)),
      ZERO,
    );
    const whole = dayMacros(day, current);

    // Summation order differs, so compare each figure to a tolerance.
    expect(whole.calories).toBeCloseTo(summed.calories);
    expect(whole.protein).toBeCloseTo(summed.protein);
    expect(whole.carbs).toBeCloseTo(summed.carbs);
    expect(whole.fat).toBeCloseTo(summed.fat);
  });

  it("reports zero for a missing food rather than throwing", () => {
    expect(entryMacros({ id: "a", kind: "food", foodId: "gone", quantity: 3 }, store())).toEqual(ZERO);
  });

  it("computes percentages against a target", () => {
    expect(percentOfTarget(1100, 2200)).toBe(50);
    expect(percentOfTarget(0, 2200)).toBe(0);
  });
});

describe("labels and formatting", () => {
  it("labels a food with its quantity", () => {
    expect(entryLabel({ id: "a", kind: "food", foodId: "oats", quantity: 0.5 }, store())).toEqual({
      name: "Rolled oats, dry",
      detail: "1/2 cup",
    });
  });

  it("labels a meal with how many foods it holds", () => {
    expect(entryLabel({ id: "a", kind: "meal", mealId: "light-dinner" }, store())).toEqual({
      name: "Light dinner",
      detail: "4 foods",
    });
  });

  it("breaks a meal into lines that add up to the meal", () => {
    const current = store();
    const meal = current.meals.find((candidate) => candidate.id === "light-dinner")!;
    const lines = mealBreakdown(meal, current);
    const summed = lines.reduce((total, line) => total + line.calories, 0);

    expect(lines).toHaveLength(4);
    expect(summed).toBeCloseTo(mealMacros(meal, current).calories);
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
});

describe("totals over the whole store", () => {
  it("totals every seeded day without touching the others", () => {
    const current = store();
    const totals = current.days.map((day) => dayMacros(day, current).calories);

    expect(totals).toHaveLength(3);
    expect(totals.every((calories) => calories > 0)).toBe(true);
    expect(Math.max(...totals)).toBe(totals[0]);
  });

  it("totals a section only from that section", () => {
    const current = store();
    const day = current.days[0];
    expect(sectionMacros(day, "dinner", current).calories).toBeGreaterThan(0);
    expect(totalMacros([], current)).toEqual(ZERO);
  });
});

describe("the seeded sample day", () => {
  it("matches the figures the app reports for it", () => {
    const current = store();
    const today = dayMacros(current.days[0], current);

    expect(formatCalories(today.calories)).toBe("2,208");
    expect(formatGrams(today.protein)).toBe("121");
    expect(formatGrams(today.carbs)).toBe("303");
    expect(formatGrams(today.fat)).toBe("68");
  });
});
