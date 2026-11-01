import { describe, expect, it } from "vitest";
import { createSeedStore, seedDays } from "@/lib/seed";
import { foodUsage, mealUsage, storeReducer, type StoreAction } from "@/lib/store";
import { dayMacros } from "@/lib/nutrition";
import type { Food, Meal, Store } from "@/lib/types";

const TODAY = new Date(2026, 10, 1);

const store = (): Store => createSeedStore(TODAY);

const newFood: Food = {
  id: "rice-cup",
  name: "Cup of rice",
  unit: "cup",
  macros: { calories: 205, protein: 4.3, carbs: 44.5, fat: 0.4 },
};

const reduce = (actions: StoreAction[], start: Store = store()): Store =>
  actions.reduce(storeReducer, start);

describe("food CRUD", () => {
  it("creates a food", () => {
    const next = reduce([{ type: "food/add", food: newFood }]);
    expect(next.foods.at(-1)).toEqual(newFood);
    expect(next.foods).toHaveLength(store().foods.length + 1);
  });

  it("updates a food in place", () => {
    const edited = { ...newFood, id: "almonds", name: "Almonds, roasted", macros: { ...newFood.macros, calories: 200 } };
    const next = reduce([{ type: "food/update", food: edited }]);

    expect(next.foods.find((food) => food.id === "almonds")).toEqual(edited);
    expect(next.foods).toHaveLength(store().foods.length);
  });

  it("deletes a food nothing refers to", () => {
    const next = reduce([
      { type: "food/add", food: newFood },
      { type: "food/delete", foodId: "rice-cup" },
    ]);

    expect(next.foods.find((food) => food.id === "rice-cup")).toBeUndefined();
  });

  it("refuses to delete a food a meal uses, and leaves it untouched", () => {
    const start = store();
    const next = storeReducer(start, { type: "food/delete", foodId: "banana" });

    expect(next).toBe(start);
    expect(next.foods.find((food) => food.id === "banana")).toBeDefined();
  });

  it("refuses to delete a food logged directly on a day", () => {
    const start = store();
    const next = storeReducer(start, { type: "food/delete", foodId: "almonds" });

    expect(next).toBe(start);
  });

  it("reports where a food is used", () => {
    const usage = foodUsage(store(), "banana");

    expect(usage.meals.map((meal) => meal.id).sort()).toEqual(["post-workout-shake", "typical-breakfast"]);
    expect(usage.days).toHaveLength(0);
    expect(usage.total).toBe(2);
  });

  it("reports a food used by a meal and logged on a day", () => {
    const usage = foodUsage(store(), "whole-milk");
    expect(usage.meals.map((meal) => meal.id).sort()).toEqual(["post-workout-shake", "typical-breakfast"]);
    expect(usage.total).toBe(2);
  });

  it("reports an unused food as free", () => {
    expect(foodUsage(store(), "sweet-potato").total).toBe(0);
  });
});

describe("meal CRUD", () => {
  const newMeal: Meal = {
    id: "rice-bowl",
    name: "Rice bowl",
    ingredients: [{ foodId: "white-rice", quantity: 1 }],
  };

  it("creates a meal", () => {
    const next = reduce([{ type: "meal/add", meal: newMeal }]);
    expect(next.meals.at(-1)).toEqual(newMeal);
  });

  it("updates a meal, including its foods", () => {
    const edited: Meal = {
      ...newMeal,
      id: "light-dinner",
      ingredients: [{ foodId: "quinoa", quantity: 2 }],
    };
    const next = reduce([{ type: "meal/update", meal: edited }]);

    expect(next.meals.find((meal) => meal.id === "light-dinner")).toEqual(edited);
  });

  it("updating a meal changes that day's totals", () => {
    const start = store();
    const day = start.days[0];
    const before = dayMacros(day, start).calories;

    const next = reduce(
      [{ type: "meal/update", meal: { id: "light-dinner", name: "Light dinner", ingredients: [] } }],
      start,
    );

    expect(dayMacros(next.days[0], next).calories).toBeLessThan(before);
  });

  it("deletes a meal no day logs", () => {
    const next = reduce([
      { type: "meal/add", meal: newMeal },
      { type: "meal/delete", mealId: "rice-bowl" },
    ]);

    expect(next.meals.find((meal) => meal.id === "rice-bowl")).toBeUndefined();
  });

  it("refuses to delete a meal a day logs", () => {
    const start = store();
    expect(mealUsage(start, "typical-breakfast")).toHaveLength(2);
    expect(storeReducer(start, { type: "meal/delete", mealId: "typical-breakfast" })).toBe(start);
  });
});

describe("log entries", () => {
  it("adds a food entry to one section of one day", () => {
    const start = store();
    const dayId = start.days[1].id;
    const next = reduce(
      [
        {
          type: "entry/add",
          dayId,
          section: "dinner",
          entry: { id: "new-1", kind: "food", foodId: "sweet-potato", quantity: 1 },
        },
      ],
      start,
    );

    const day = next.days.find((candidate) => candidate.id === dayId);
    expect(day?.sections.dinner).toHaveLength(1);
    expect(next.days[0]).toEqual(start.days[0]);
  });

  it("adds a meal entry and counts its foods", () => {
    const start = store();
    const next = reduce(
      [
        {
          type: "entry/add",
          dayId: start.days[0].id,
          section: "dinner",
          entry: { id: "new-2", kind: "meal", mealId: "pasta-night" },
        },
      ],
      start,
    );

    expect(dayMacros(next.days[0], next).calories).toBeGreaterThan(dayMacros(start.days[0], start).calories);
  });

  it("removes an entry by id and leaves its neighbours", () => {
    const start = store();
    const next = reduce(
      [{ type: "entry/remove", dayId: start.days[0].id, section: "snacks", entryId: "t-sn-1" }],
      start,
    );

    expect(next.days[0].sections.snacks.map((entry) => entry.id)).toEqual(["t-sn-2", "t-sn-3"]);
  });

  it("ignores an unknown entry id", () => {
    const start = store();
    expect(
      storeReducer(start, {
        type: "entry/remove",
        dayId: start.days[0].id,
        section: "snacks",
        entryId: "nope",
      }),
    ).toEqual(start);
  });

  it("ignores an unknown day", () => {
    const start = store();
    expect(
      storeReducer(start, {
        type: "entry/add",
        dayId: "1999-01-01",
        section: "lunch",
        entry: { id: "x", kind: "food", foodId: "egg", quantity: 1 },
      }),
    ).toEqual(start);
  });

  it("never mutates the store it was given", () => {
    const start = store();
    const snapshot = JSON.stringify(start);
    reduce([{ type: "food/add", food: newFood }], start);
    reduce([{ type: "entry/remove", dayId: start.days[0].id, section: "lunch", entryId: "t-ln-1" }], start);

    expect(JSON.stringify(start)).toBe(snapshot);
  });
});

describe("seed", () => {
  it("ships three days, newest first, ending today", () => {
    const days = seedDays(TODAY);
    expect(days).toHaveLength(3);
    expect(days.map((day) => day.date)).toEqual(["2026-11-01", "2026-10-31", "2026-10-30"]);
  });

  it("gives every entry a unique id", () => {
    const ids = store()
      .days.flatMap((day) => Object.values(day.sections).flat())
      .map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("references only foods and meals that exist", () => {
    const start = store();
    const foodIds = new Set(start.foods.map((food) => food.id));
    const mealIds = new Set(start.meals.map((meal) => meal.id));

    for (const meal of start.meals) {
      for (const ingredient of meal.ingredients) {
        expect(foodIds.has(ingredient.foodId)).toBe(true);
      }
    }
    for (const day of start.days) {
      for (const entry of Object.values(day.sections).flat()) {
        if (entry.kind === "food") expect(foodIds.has(entry.foodId)).toBe(true);
        else expect(mealIds.has(entry.mealId)).toBe(true);
      }
    }
  });

  it("hands out a fresh copy each time", () => {
    const first = store();
    first.foods.push(newFood);
    expect(store().foods.find((food) => food.id === "rice-cup")).toBeUndefined();
  });
});
