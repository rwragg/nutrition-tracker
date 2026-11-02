import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTracker } from "@/lib/use-tracker";

/** A day as the server sends it: a date and empty sections, with one calorie figure to tell days apart. */
function wireDay(date: string, calories: number) {
  return {
    date,
    macros: { calories, protein: 0, carbs: 0, fat: 0 },
    sections: { breakfast: [], lunch: [], dinner: [], snacks: [] },
  };
}

describe("picking a day", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the day that was picked last, even when an earlier day answers after it", async () => {
    // Day reads that the test answers by hand, so it decides which one lands first.
    const pending: Record<string, (value: Response) => void> = {};

    vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
      const path = new URL(String(input), "http://localhost").pathname;
      const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));

      if (path === "/api/foods" || path === "/api/meals") return json([]);
      if (path === "/api/days") {
        return json([
          { date: "2026-11-02", macros: { calories: 100, protein: 0, carbs: 0, fat: 0 } },
          { date: "2026-11-01", macros: { calories: 200, protein: 0, carbs: 0, fat: 0 } },
          { date: "2026-10-31", macros: { calories: 300, protein: 0, carbs: 0, fat: 0 } },
        ]);
      }

      const date = path.replace("/api/days/", "");
      if (date === "2026-11-02") return json(wireDay(date, 100));
      return new Promise<Response>((resolve) => {
        pending[date] = resolve;
      });
    });

    const { result } = renderHook(() => useTracker());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let slow!: Promise<void>;
    let fast!: Promise<void>;
    act(() => {
      slow = result.current.selectDay("2026-11-01");
      fast = result.current.selectDay("2026-10-31");
    });
    await waitFor(() => expect(Object.keys(pending)).toHaveLength(2));

    // The second pick answers first, then the first pick answers late.
    await act(async () => {
      pending["2026-10-31"](new Response(JSON.stringify(wireDay("2026-10-31", 300))));
      await fast;
      pending["2026-11-01"](new Response(JSON.stringify(wireDay("2026-11-01", 200))));
      await slow;
    });

    expect(result.current.day?.date).toBe("2026-10-31");
  });
});
