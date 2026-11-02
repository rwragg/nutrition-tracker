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
import { DATES, dayWithSections, macrosOf, sampleStore } from "@/test/fixture";

/**
 * The app's own arithmetic, over the world written out in `test/fixture.ts`.
 *
 * The sample data the app ships is seeded into the backend's database now, so these tests no longer
 * derive from it: the world below is the fixture's, and the fixture works its own figures out
 * independently (`macrosOf`), which is what makes comparing against the app's maths mean something.
 */
const store = () => sampleStore();
const day = (index = 0) => dayWithSections(DATES[index]);

describe("macros", () => {
  it("scales a food by quantity", () => {
    const almonds = store().foods.find((food) => food.id === "almonds")!;

    expect(entryMacros({ id: "a", kind: "food", foodId: "almonds", quantity: 2 }, store())).toEqual(
      scaleMacros(almonds.macros, 2),
    );
  });

  it("scales fractionally", () => {
    const half = entryMacros({ id: "a", kind: "food", foodId: "oats", quantity: 0.5 }, store());

    expect(half.calories).toBeCloseTo(150);
    expect(half.protein).toBeCloseTo(5);
  });

  it("sums a meal from the foods in it", () => {
    const current = store();
    const meal = current.meals.find((candidate) => candidate.id === "protein-lunch-bowl")!;

    const manual = meal.ingredients.reduce(
      (total, ingredient) =>
        addMacros(
          total,
          entryMacros(
            { id: "", kind: "food", foodId: ingredient.foodId, quantity: ingredient.quantity },
            current,
          ),
        ),
      ZERO,
    );

    expect(mealMacros(meal, current)).toEqual(manual);
    expect(mealMacros(meal, current).calories).toBeGreaterThan(400);
  });

  it("totals an empty day as zero", () => {
    const empty = {
      id: "empty",
      date: "2026-11-05",
      macros: ZERO,
      sections: { breakfast: [], lunch: [], dinner: [], snacks: [] },
    };

    expect(dayMacros(empty, store())).toEqual(ZERO);
  });

  it("totals a day from its sections", () => {
    const current = store();
    const summed = (["breakfast", "lunch", "dinner", "snacks"] as const).reduce(
      (total, section) => addMacros(total, sectionMacros(day(), section, current)),
      ZERO,
    );
    const whole = dayMacros(day(), current);

    expect(whole.calories).toBeGreaterThan(0);
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
    expect(entryLabel({ id: "a", kind: "meal", mealId: "post-workout-shake" }, store())).toEqual({
      name: "Post-workout shake",
      detail: "3 foods",
    });
  });

  it("breaks a meal into lines that add up to the meal", () => {
    const current = store();
    const meal = current.meals.find((candidate) => candidate.id === "post-workout-shake")!;
    const lines = mealBreakdown(meal, current);
    const summed = lines.reduce((total, line) => total + line.calories, 0);

    expect(lines).toHaveLength(3);
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
  it("totals the day's sections and nothing else", () => {
    const current = store();

    expect(sectionMacros(day(), "breakfast", current).calories).toBeGreaterThan(0);
    expect(sectionMacros(day(), "dinner", current).calories).toBe(0);
    expect(totalMacros([], current)).toEqual(ZERO);
  });

  it("agrees with the fixture's own figures for every day", () => {
    const current = store();

    for (const summary of current.days) {
      const sections = dayWithSections(summary.date).sections;
      const asDay = { id: summary.date, date: summary.date, macros: ZERO, sections };

      expect(dayMacros(asDay, current).calories).toBeCloseTo(macrosOf(sections).calories);
    }
  });
});
