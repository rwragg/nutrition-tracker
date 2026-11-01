import { describe, expect, it } from "vitest";
import { dayReducer, emptyDay } from "@/lib/day";
import { dummyDay } from "@/lib/dummy-day";
import { dayMacros, totalMacros } from "@/lib/nutrition";

describe("dayReducer", () => {
  it("adds an ingredient to the chosen section only", () => {
    const day = dayReducer(emptyDay(), {
      type: "ingredient/add",
      id: "x1",
      section: "lunch",
      foodId: "egg",
      quantity: 1,
    });

    expect(day.lunch).toHaveLength(1);
    expect(day.breakfast).toHaveLength(0);
    expect(day.lunch[0]).toEqual({ id: "x1", kind: "ingredient", foodId: "egg", quantity: 1 });
  });

  it("adds a meal as a single entry", () => {
    const day = dayReducer(emptyDay(), {
      type: "meal/add",
      id: "m1",
      section: "dinner",
      mealId: "pasta-night",
    });

    expect(day.dinner).toEqual([{ id: "m1", kind: "meal", mealId: "pasta-night" }]);
    expect(totalMacros(day.dinner).calories).toBeGreaterThan(0);
  });

  it("removes by id and leaves the rest alone", () => {
    const start = dummyDay();
    const day = dayReducer(start, { type: "entry/remove", section: "snacks", id: "sn-1" });

    expect(day.snacks.map((entry) => entry.id)).toEqual(["sn-2", "sn-3"]);
    expect(totalMacros(day.snacks).calories).toBeCloseTo(
      totalMacros(start.snacks).calories - 164,
    );
  });

  it("does nothing when the id is not in the section", () => {
    const start = dummyDay();
    const day = dayReducer(start, { type: "entry/remove", section: "snacks", id: "nope" });
    expect(day).toEqual(start);
  });

  it("leaves the previous state untouched", () => {
    const start = dummyDay();
    const before = dayMacros(start).calories;
    dayReducer(start, { type: "entry/remove", section: "breakfast", id: "bf-1" });
    expect(dayMacros(start).calories).toBe(before);
  });
});
