import { describe, expect, it } from "vitest";
import { quantityRules, readQuantity } from "./quantity";
import { UNITS } from "./types";

describe("the limits for each unit", () => {
  it("give grams their own range, because 183 g is an ordinary serving", () => {
    const grams = quantityRules("g");

    expect(grams.min).toBe(1);
    expect(grams.max).toBeGreaterThanOrEqual(1000);
    expect(grams.start).toBe(100); // 1 g is not a thing anyone eats
    expect(grams.step).toBe(10);
  });

  it("keep every household unit as it was: a quarter to 20, in quarters, starting at 1", () => {
    for (const unit of UNITS.filter((unit) => unit !== "g")) {
      expect(quantityRules(unit)).toEqual({
        min: 0.25,
        max: 20,
        step: 0.25,
        start: 1,
      });
    }
  });

  it("start inside their own range, so a freshly chosen food is never invalid", () => {
    for (const unit of UNITS) {
      const { min, max, start, step } = quantityRules(unit);
      expect(start).toBeGreaterThanOrEqual(min);
      expect(start).toBeLessThanOrEqual(max);
      expect(step).toBeGreaterThan(0);
    }
  });
});

describe("reading what was typed", () => {
  it("takes 183 g as 183, and 2 cups as 2", () => {
    expect(readQuantity("183", "g")).toEqual({ ok: true, value: 183 });
    expect(readQuantity("2", "cup")).toEqual({ ok: true, value: 2 });
  });

  it("takes the ends of the range and refuses a hair beyond them", () => {
    expect(readQuantity("0.25", "cup").ok).toBe(true);
    expect(readQuantity("0.24", "cup").ok).toBe(false);
    expect(readQuantity("20", "cup").ok).toBe(true);
    expect(readQuantity("20.01", "cup").ok).toBe(false);
    expect(readQuantity("1", "g").ok).toBe(true);
    expect(readQuantity("0.5", "g").ok).toBe(false);
    expect(readQuantity("5000", "g").ok).toBe(true);
    expect(readQuantity("5001", "g").ok).toBe(false);
  });

  it("is a different range for a different unit: 25 cups is too many and 25 g is too few", () => {
    expect(readQuantity("25", "cup").ok).toBe(false);
    expect(readQuantity("25", "g").ok).toBe(true);
  });

  it("refuses an empty box, a space, and what is not a number, with a sentence that names the range", () => {
    for (const text of ["", "   ", "abc", "1,5", "NaN", "Infinity", "-3"]) {
      const result = readQuantity(text, "cup");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.problem).toContain("1/4 cup to 20 cups");
    }
    const grams = readQuantity("", "g");
    if (!grams.ok) expect(grams.problem).toContain("1 g to 5000 g");
  });

  it("rounds to two places only after the range has been checked", () => {
    expect(readQuantity("1.333", "cup")).toEqual({ ok: true, value: 1.33 });
    expect(readQuantity("183.456", "g")).toEqual({ ok: true, value: 183.46 });
    expect(readQuantity("0.249", "cup").ok).toBe(false); // would round up to the minimum, but it is below it
  });

  it("ignores spaces around the number", () => {
    expect(readQuantity("  183 ", "g")).toEqual({ ok: true, value: 183 });
  });
});
