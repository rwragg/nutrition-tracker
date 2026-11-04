import { describe, expect, it } from "vitest";
import {
  cmToFeetAndInches,
  feetAndInchesToCm,
  formatHeight,
  formatWeight,
  kgToLb,
  lbToKg,
  parseNumber,
  roundTo,
} from "@/lib/units";

/** The conversions the form uses (Part 12, R39). Display only: the server stores and calculates in metric. */
describe("units", () => {
  it("converts 165 lb to 74.84 kg and back to 165", () => {
    expect(roundTo(lbToKg(165), 2)).toBe(74.84);
    expect(roundTo(kgToLb(74.84274), 1)).toBe(165);
  });

  it("converts 5 ft 9 in to 175.3 cm and back", () => {
    expect(roundTo(feetAndInchesToCm(5, 9), 1)).toBe(175.3);
    expect(cmToFeetAndInches(175.26)).toEqual({ feet: 5, inches: 9 });
  });

  it("round-trips a typed weight and height to what was typed", () => {
    for (const pounds of [100, 135.5, 165, 250.4]) {
      expect(roundTo(kgToLb(lbToKg(pounds)), 1)).toBe(pounds);
    }
    for (const [feet, inches] of [[4, 11], [5, 0], [5, 7.5], [6, 3]]) {
      expect(cmToFeetAndInches(feetAndInchesToCm(feet, inches))).toEqual({ feet, inches });
    }
  });

  it("never writes 12 inches: it carries into the next foot", () => {
    // 182.85 cm is 71.99 inches, which rounds to 72.0 - 6 ft 0 in, not 5 ft 12 in.
    expect(cmToFeetAndInches(182.85)).toEqual({ feet: 6, inches: 0 });
  });

  it("writes a figure as short as it can be", () => {
    expect(formatWeight(74.84274, "imperial")).toBe("165 lb");
    expect(formatWeight(82, "metric")).toBe("82 kg");
    expect(formatWeight(82.46, "metric")).toBe("82.5 kg");
    expect(formatHeight(175.26, "imperial")).toBe("5 ft 9 in");
    expect(formatHeight(178, "metric")).toBe("178 cm");
  });

  it("reads only what is a number", () => {
    expect(parseNumber("82")).toBe(82);
    expect(parseNumber(" 82.5 ")).toBe(82.5);
    expect(parseNumber(".5")).toBe(0.5);
    // an empty box is not zero, and trailing text is not ignored
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
    expect(parseNumber("12abc")).toBeNull();
    expect(parseNumber("1,5")).toBeNull();
    expect(parseNumber("-4")).toBeNull();
    expect(parseNumber("1e3")).toBeNull();
  });
});
