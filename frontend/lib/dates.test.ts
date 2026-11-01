import { describe, expect, it } from "vitest";
import { dayLabel, shiftIsoDate, toIsoDate } from "@/lib/dates";

describe("dates", () => {
  it("writes a local calendar date", () => {
    expect(toIsoDate(new Date(2026, 10, 1))).toBe("2026-11-01");
    expect(toIsoDate(new Date(2026, 0, 9))).toBe("2026-01-09");
  });

  it("steps across month and year boundaries", () => {
    expect(shiftIsoDate("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftIsoDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftIsoDate("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("names today and yesterday, then falls back to a weekday", () => {
    expect(dayLabel("2026-11-01", "2026-11-01")).toBe("Today");
    expect(dayLabel("2026-10-31", "2026-11-01")).toBe("Yesterday");
    expect(dayLabel("2026-10-30", "2026-11-01")).toBe("Fri 30 Oct");
  });
});
