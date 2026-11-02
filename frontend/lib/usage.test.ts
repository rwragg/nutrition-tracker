import { describe, expect, it } from "vitest";
import { toIsoDate, shiftIsoDate } from "@/lib/dates";
import { describeFoodUsage, describeMealUsage, describeRefusal } from "@/lib/usage";

const today = toIsoDate(new Date());
const yesterday = shiftIsoDate(today, -1);
const older = "2026-01-02";

describe("saying where a record is still used", () => {
  it("names the meals that use a food", () => {
    expect(describeFoodUsage([{ name: "Porridge" }, { name: "Shake" }], [], today)).toBe(
      "used in 2 meals (Porridge, Shake)",
    );
  });

  it("names the days a food is logged on, in the app's own words", () => {
    expect(describeFoodUsage([], [today, yesterday], today)).toBe(
      "logged directly on 2 days (Today, Yesterday)",
    );
  });

  it("names both when a food is used both ways", () => {
    expect(describeFoodUsage([{ name: "Porridge" }], [today], today)).toBe(
      "used in 1 meal (Porridge) and logged directly on 1 day (Today)",
    );
  });

  it("says nothing when nothing refers to it", () => {
    expect(describeFoodUsage([], [], today)).toBe("");
  });

  it("falls back to the date itself when it is not today or yesterday", () => {
    expect(describeMealUsage([older], today)).toContain("2 Jan");
  });
});

describe("turning a refusal into a sentence", () => {
  it("explains a food that is in use", () => {
    const sentence = describeRefusal(
      { message: "cannot be deleted", usedBy: { meals: [{ id: "p", name: "Porridge" }], days: [today] } },
      "food",
      today,
    );

    expect(sentence).toContain("This food cannot be deleted");
    expect(sentence).toContain("Porridge");
    expect(sentence).toContain("Today");
  });

  it("explains a meal that is logged", () => {
    const sentence = describeRefusal(
      { message: "cannot be deleted", usedBy: { meals: [], days: [today] } },
      "meal",
      today,
    );

    expect(sentence).toContain("This meal cannot be deleted");
    expect(sentence).toContain("logged on 1 day (Today)");
  });

  it("returns nothing when the refusal named no usage, so the server's own message is shown", () => {
    // A 409 that is not about usage at all - the caller falls back to the server's sentence.
    expect(
      describeRefusal({ message: "cannot be deleted", usedBy: { meals: [], days: [] } }, "food", today),
    ).toBeNull();
  });
});
