import { describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";

/**
 * The API client on its own.
 *
 * Everything here is about what the client does with an answer it did not expect: the server's
 * refusal is read out of the body when it is there, and the client says something sensible when it is
 * not. These are the paths a working server never takes, which is exactly why they need testing -
 * nothing else in the suite runs them.
 */
function respond(status: number, body?: unknown) {
  vi.stubGlobal("fetch", () =>
    Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status })),
  );
}

function capture() {
  const calls: { url: string; method: string; body: unknown }[] = [];

  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });

    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
  });

  return calls;
}

describe("the API client", () => {
  it("carries the server's structured refusal through", async () => {
    respond(409, {
      detail: {
        message: "cannot be deleted: used in 1 meal(s) (Porridge)",
        usedBy: { meals: [{ id: "porridge", name: "Porridge" }], days: ["2026-11-01"] },
      },
    });

    const failure = await api.deleteFood("oats").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(409);
    expect((failure as ApiError).message).toBe("cannot be deleted: used in 1 meal(s) (Porridge)");
    expect((failure as ApiError).refusal?.usedBy.days).toEqual(["2026-11-01"]);
  });

  it("uses a plain sentence when that is all the server sends", async () => {
    respond(404, { detail: "no such food" });

    const failure = await api.deleteFood("gone").catch((error: unknown) => error);

    expect((failure as ApiError).message).toBe("no such food");
    expect((failure as ApiError).refusal).toBeUndefined();
  });

  it("says something useful when the error body is not JSON at all", async () => {
    respond(500);

    const failure = await api.listFoods().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(500);
    expect((failure as ApiError).message).toBe("The server refused that request.");
  });

  it("says something useful when the detail is an object with no message", async () => {
    // FastAPI's own validation errors look like this: a list of faults, no sentence.
    respond(422, { detail: [{ loc: ["body", "name"], msg: "field required" }] });

    const failure = await api.createFood({
      name: "",
      unit: "cup",
      macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    }).catch((error: unknown) => error);

    expect((failure as ApiError).message).toBe("The server refused that request.");
  });

  it("reads no body from a 204", async () => {
    respond(204);

    await expect(api.deleteFood("oats")).resolves.toBeUndefined();
  });

  it("answers who is signed in, and null for a 401", async () => {
    respond(200, { username: "user" });
    await expect(api.getSession()).resolves.toEqual({ username: "user" });

    respond(401, { detail: "Not signed in" });
    await expect(api.getSession()).resolves.toBeNull();
  });

  it("lets a failure other than a 401 through, rather than calling it signed out", async () => {
    respond(500, { detail: "boom" });

    await expect(api.getSession()).rejects.toBeInstanceOf(ApiError);
  });

  it("sends a meal's ingredients as food ids and quantities", async () => {
    const calls = capture();

    await api.createMeal({ name: "Porridge", ingredients: [{ foodId: "oats", quantity: 0.5 }] });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("/api/meals");
    expect(calls[0].body).toEqual({ name: "Porridge", ingredients: [{ food_id: "oats", quantity: 0.5 }] });
  });

  it("logs a meal entry without a quantity, and a food entry with one", async () => {
    const calls = capture();

    await api.addEntry("2026-11-01", "dinner", { kind: "meal", mealId: "porridge" });
    await api.addEntry("2026-11-01", "lunch", { kind: "food", foodId: "oats", quantity: 2 });

    expect(calls[0].body).toEqual({ section: "dinner", meal_id: "porridge" });
    expect(calls[1].body).toEqual({ section: "lunch", food_id: "oats", quantity: 2 });
  });

  it("escapes a record id in the path", async () => {
    const calls = capture();

    await api.deleteFood("odd id/with a slash");

    expect(calls[0].url).toBe("/api/foods/odd%20id%2Fwith%20a%20slash");
  });
});
