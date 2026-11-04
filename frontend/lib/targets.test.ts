import { describe, expect, it } from "vitest";
import { DAILY_TARGETS, basisLine, dayTargets, shortDate } from "@/lib/targets";
import type { ProfileState } from "@/lib/types";

const NOW = new Date(2026, 10, 20);

function state(overrides: Partial<ProfileState["targets"]> = {}, units: "metric" | "imperial" = "metric"): ProfileState {
  return {
    profile: {
      displayName: "Ana Example",
      sex: "male",
      birthDate: "1986-03-01",
      heightCm: 178,
      weightKg: units === "imperial" ? 74.84274 : 82,
      weightOn: "2026-11-04",
      activity: "moderate",
      goal: "lose",
      units,
      kcalOverride: null,
      proteinOverride: null,
    },
    targets: {
      calories: 2150,
      protein: 130,
      caloriesFrom: "profile",
      proteinFrom: "profile",
      computed: { calories: 2150, protein: 130 },
      working: {
        age: 40, resting: 1737.5, activityFactor: 1.55, dailyNeed: 2693.1, goalFactor: 0.8,
        afterGoal: 2154.5, floor: 1500, floored: false, proteinPerKg: 1.6, proteinBeforeRounding: 131.2,
      },
      ...overrides,
    },
  };
}

describe("which targets are in force", () => {
  it("is the standard four for an account with no profile (R38)", () => {
    expect(dayTargets(null)).toEqual({ calories: 2200, protein: 140, carbs: 250, fat: 70 });
    expect(dayTargets(null)).toEqual(DAILY_TARGETS);
  });

  it("takes calories and protein from the profile, and has no carbs or fat target (D30)", () => {
    expect(dayTargets(state())).toEqual({ calories: 2150, protein: 130, carbs: null, fat: null });
  });

  it("uses the figure in force, which is the person's own where they set one", () => {
    const own = state({ calories: 2300, caloriesFrom: "own" });
    expect(dayTargets(own).calories).toBe(2300);
  });

  it("does not hand back the shared constant to be changed", () => {
    const targets = dayTargets(null);
    targets.calories = 1;
    expect(DAILY_TARGETS.calories).toBe(2200);
  });
});

describe("what the targets rest on (R48)", () => {
  it("says nothing without a profile", () => {
    expect(basisLine(null, NOW)).toBeNull();
  });

  it("names the weight and the day it was set", () => {
    expect(basisLine(state(), NOW)).toBe("From your profile (82 kg, set 4 Nov).");
  });

  it("shows the weight in the units the person chose", () => {
    expect(basisLine(state({}, "imperial"), NOW)).toBe("From your profile (165 lb, set 4 Nov).");
  });

  it("says which figure is the person's own", () => {
    expect(basisLine(state({ caloriesFrom: "own" }), NOW)).toBe(
      "Calories: your own. Protein: from your profile (82 kg, set 4 Nov).",
    );
    expect(basisLine(state({ proteinFrom: "own" }), NOW)).toBe(
      "Protein: your own. Calories: from your profile (82 kg, set 4 Nov).",
    );
    expect(basisLine(state({ caloriesFrom: "own", proteinFrom: "own" }), NOW)).toBe("Your own targets.");
  });

  it("puts the year on a weight from another year", () => {
    expect(shortDate("2026-11-04", NOW)).toBe("4 Nov");
    expect(shortDate("2025-12-30", NOW)).toBe("30 Dec 2025");
  });
});
