import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "@/components/App";
import type { FoodCandidate } from "@/lib/types";
import { stubFetch } from "@/test/fetch-stub";

/** What USDA offers, in the shape the server sends: per 100 g for reading, per gram for storing (D13). */
const TEMPEH: FoodCandidate = {
  fdcId: "174272",
  name: "Tempeh",
  dataType: "SR Legacy",
  unit: "g",
  per100g: { calories: 192, protein: 20.3, carbs: 7.64, fat: 10.8 },
  macros: { calories: 1.92, protein: 0.203, carbs: 0.0764, fat: 0.108 },
};
const TEMPEH_COOKED: FoodCandidate = {
  fdcId: "172467",
  name: "Tempeh, cooked",
  dataType: "SR Legacy",
  unit: "g",
  per100g: { calories: 195, protein: 19.9, carbs: 7.62, fat: 11.4 },
  macros: { calories: 1.95, protein: 0.199, carbs: 0.0762, fat: 0.114 },
};

async function openNewFood(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await screen.findByTestId("day-total-calories");
  await user.click(screen.getByRole("button", { name: "Foods" }));
  await user.click(screen.getByTestId("new-food"));
}

describe("looking up a food that is not in the list", () => {
  it("offers the button once there is a name, and not before", async () => {
    stubFetch();
    const user = userEvent.setup();
    await openNewFood(user);

    expect(screen.getByTestId("lookup-food")).toBeDisabled();
    await user.type(screen.getByTestId("food-name"), "te");
    expect(screen.getByTestId("lookup-food")).toBeEnabled();
  });

  it("asks for what was typed, and lists what comes back with figures per 100 g", async () => {
    const asked: string[] = [];
    stubFetch({ lookup: { results: [TEMPEH, TEMPEH_COOKED], asked } });
    const user = userEvent.setup();
    await openNewFood(user);

    await user.type(screen.getByTestId("food-name"), "tempeh");
    await user.click(screen.getByTestId("lookup-food"));

    const row = await screen.findByTestId("candidate-174272");
    expect(asked).toEqual(["tempeh"]);
    expect(row).toHaveTextContent("Tempeh");
    expect(row).toHaveTextContent("per 100 g · 192 kcal");
    expect(row).toHaveTextContent("P 20");
    expect(screen.getByTestId("candidate-172467")).toHaveTextContent("Tempeh, cooked");
  });

  it("does not look anything up, or write anything, until asked", async () => {
    const asked: string[] = [];
    const writes: string[] = [];
    stubFetch({
      lookup: { results: [TEMPEH], asked },
      intercept: ({ path, method }) => {
        if (method !== "GET") writes.push(`${method} ${path}`);
        return undefined;
      },
    });
    const user = userEvent.setup();
    await openNewFood(user);

    await user.type(screen.getByTestId("food-name"), "tempeh");

    expect(asked).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("fills the form from a pick, per gram, and writes nothing yet (R33)", async () => {
    const writes: string[] = [];
    stubFetch({
      lookup: { results: [TEMPEH, TEMPEH_COOKED] },
      intercept: ({ path, method }) => {
        if (method !== "GET") writes.push(`${method} ${path}`);
        return undefined;
      },
    });
    const user = userEvent.setup();
    await openNewFood(user);
    await user.type(screen.getByTestId("food-name"), "tempeh");
    await user.click(screen.getByTestId("lookup-food"));

    await user.click(await screen.findByRole("button", { name: "Use Tempeh, cooked" }));

    expect(screen.getByTestId("food-name")).toHaveValue("Tempeh, cooked");
    expect(screen.getByTestId("food-unit")).toHaveValue("g");
    expect(screen.getByTestId("food-calories")).toHaveValue(1.95);
    expect(screen.getByTestId("food-protein")).toHaveValue(0.199);
    expect(screen.getByTestId("usda-note")).toBeInTheDocument();
    expect(screen.queryByTestId("lookup-results")).not.toBeInTheDocument();
    expect(writes).toEqual([]);
  });

  it("saves a picked food as a USDA food, with USDA's id, and the list says so", async () => {
    const bodies: unknown[] = [];
    stubFetch({
      lookup: { results: [TEMPEH] },
      intercept: ({ path, method, body }) => {
        if (method === "POST" && path === "/api/foods") bodies.push(body);
        return undefined;
      },
    });
    const user = userEvent.setup();
    await openNewFood(user);
    await user.type(screen.getByTestId("food-name"), "tempeh");
    await user.click(screen.getByTestId("lookup-food"));
    await user.click(await screen.findByRole("button", { name: "Use Tempeh" }));

    await user.click(screen.getByTestId("save-food"));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      name: "Tempeh",
      unit: "g",
      calories: 1.92,
      protein: 0.203,
      source: "usda",
      source_id: "174272",
    });
    expect(await screen.findByTestId("source-food-1")).toHaveTextContent("USDA");
  });

  it("lets the person correct a figure before saving, and still records where it started", async () => {
    const bodies: Record<string, unknown>[] = [];
    stubFetch({
      lookup: { results: [TEMPEH] },
      intercept: ({ path, method, body }) => {
        if (method === "POST" && path === "/api/foods") bodies.push(body as Record<string, unknown>);
        return undefined;
      },
    });
    const user = userEvent.setup();
    await openNewFood(user);
    await user.type(screen.getByTestId("food-name"), "tempeh");
    await user.click(screen.getByTestId("lookup-food"));
    await user.click(await screen.findByRole("button", { name: "Use Tempeh" }));

    await user.clear(screen.getByTestId("food-calories"));
    await user.type(screen.getByTestId("food-calories"), "2");
    await user.click(screen.getByTestId("save-food"));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ calories: 2, source: "usda", source_id: "174272" });
  });

  it("drops the USDA label when the unit is changed, because the figures are no longer per gram", async () => {
    const bodies: Record<string, unknown>[] = [];
    stubFetch({
      lookup: { results: [TEMPEH] },
      intercept: ({ path, method, body }) => {
        if (method === "POST" && path === "/api/foods") bodies.push(body as Record<string, unknown>);
        return undefined;
      },
    });
    const user = userEvent.setup();
    await openNewFood(user);
    await user.type(screen.getByTestId("food-name"), "tempeh");
    await user.click(screen.getByTestId("lookup-food"));
    await user.click(await screen.findByRole("button", { name: "Use Tempeh" }));

    await user.selectOptions(screen.getByTestId("food-unit"), "cup");
    expect(screen.queryByTestId("usda-note")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("save-food"));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ source: "typed" });
    expect(bodies[0].source_id).toBeUndefined();
  });

  it("says plainly when USDA has nothing, and when lookup is not set up", async () => {
    stubFetch({ lookup: { results: [] } });
    const user = userEvent.setup();
    await openNewFood(user);
    await user.type(screen.getByTestId("food-name"), "zzzz");
    await user.click(screen.getByTestId("lookup-food"));
    expect(await screen.findByTestId("lookup-empty")).toHaveTextContent("nothing under that name");
  });

  it("shows the server's sentence when lookup is not configured or USDA fails", async () => {
    stubFetch({ lookup: { refuse: { status: 503, detail: "food lookup is not configured" } } });
    const user = userEvent.setup();
    await openNewFood(user);
    await user.type(screen.getByTestId("food-name"), "tempeh");
    await user.click(screen.getByTestId("lookup-food"));

    expect(await screen.findByTestId("lookup-problem")).toHaveTextContent("food lookup is not configured");
    // and the form still works without it
    await user.type(screen.getByTestId("food-calories"), "190");
    expect(screen.getByTestId("save-food")).toBeEnabled();
  });

  it("clears the results when the name is changed, so they never answer a different question", async () => {
    stubFetch({ lookup: { results: [TEMPEH] } });
    const user = userEvent.setup();
    await openNewFood(user);
    await user.type(screen.getByTestId("food-name"), "tempeh");
    await user.click(screen.getByTestId("lookup-food"));
    await screen.findByTestId("lookup-results");

    await user.type(screen.getByTestId("food-name"), " bacon");

    expect(screen.queryByTestId("lookup-results")).not.toBeInTheDocument();
  });

  it("is not offered when editing a food that exists", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("day-total-calories");
    await user.click(screen.getByRole("button", { name: "Foods" }));
    await user.click(screen.getByRole("button", { name: "Edit Hummus" }));

    const dialog = await screen.findByRole("dialog", { name: "Edit food" });
    expect(within(dialog).queryByTestId("lookup-food")).not.toBeInTheDocument();
  });
});
