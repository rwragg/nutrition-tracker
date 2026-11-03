import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "@/components/App";
import type { FoodCandidate } from "@/lib/types";
import { stubFetch } from "@/test/fetch-stub";

const TEMPEH: FoodCandidate = {
  fdcId: "174272",
  name: "Tempeh",
  dataType: "SR Legacy",
  unit: "g",
  per100g: { calories: 192, protein: 20.3, carbs: 7.64, fat: 10.8 },
  macros: { calories: 1.92, protein: 0.203, carbs: 0.0764, fat: 0.108 },
};

type User = ReturnType<typeof userEvent.setup>;

/** Day view, Lunch, Add food, then the "not in your list" link: how a person gets here. */
async function openLookup(user: User) {
  render(<App />);
  await screen.findByTestId("day-total-calories");
  await user.click(screen.getByRole("button", { name: "Add food to Lunch" }));
  await user.click(await screen.findByTestId("open-lookup"));
  await screen.findByRole("dialog", { name: "Look up a food for Lunch" });
}

async function lookUp(user: User, name: string) {
  await user.type(screen.getByTestId("lookup-name"), name);
  await user.click(screen.getByTestId("lookup-go"));
}

describe("adding a food to a day that is not in the list", () => {
  it("is reached from Add food, and the picker is left behind", async () => {
    stubFetch();
    const user = userEvent.setup();
    await openLookup(user);

    expect(screen.queryByRole("dialog", { name: /Add food to/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("lookup-go")).toBeDisabled();
  });

  it("looks up what was typed, and shows each candidate's figures", async () => {
    const asked: string[] = [];
    stubFetch({ lookup: { results: [TEMPEH], asked } });
    const user = userEvent.setup();
    await openLookup(user);

    await lookUp(user, "tempeh");

    expect(await screen.findByTestId("candidate-174272")).toHaveTextContent("per 100 g · 192 kcal");
    expect(asked).toEqual(["tempeh"]);
  });

  it("looks up on Enter as well as on the button", async () => {
    const asked: string[] = [];
    stubFetch({ lookup: { results: [TEMPEH], asked } });
    const user = userEvent.setup();
    await openLookup(user);

    await user.type(screen.getByTestId("lookup-name"), "tempeh{Enter}");

    await screen.findByTestId("candidate-174272");
    expect(asked).toEqual(["tempeh"]);
  });

  it("shows what a choice will add, in grams, before anything is written (R33)", async () => {
    const writes: string[] = [];
    stubFetch({
      lookup: { results: [TEMPEH] },
      intercept: ({ path, method }) => {
        if (method !== "GET") writes.push(`${method} ${path}`);
        return undefined;
      },
    });
    const user = userEvent.setup();
    await openLookup(user);
    await lookUp(user, "tempeh");

    await user.click(await screen.findByRole("button", { name: "Choose Tempeh" }));

    // 100 g by default: 1.92 kcal a gram is 192, and 0.203 g protein a gram is 20.3
    expect(screen.getByTestId("lookup-preview")).toHaveTextContent("192 kcal · 20 g protein");
    expect(screen.getByTestId("lookup-grams")).toHaveValue(100);

    await user.clear(screen.getByTestId("lookup-grams"));
    await user.type(screen.getByTestId("lookup-grams"), "183");
    expect(screen.getByTestId("lookup-preview")).toHaveTextContent("351 kcal");

    expect(writes).toEqual([]);
  });

  it("makes the food and logs it in one step, then shows it on the day and in the list", async () => {
    const writes: { path: string; body: unknown }[] = [];
    stubFetch({
      lookup: { results: [TEMPEH] },
      intercept: ({ path, method, body }) => {
        if (method === "POST") writes.push({ path, body });
        return undefined;
      },
    });
    const user = userEvent.setup();
    await openLookup(user);
    await lookUp(user, "tempeh");
    await user.click(await screen.findByRole("button", { name: "Choose Tempeh" }));
    await user.clear(screen.getByTestId("lookup-grams"));
    await user.type(screen.getByTestId("lookup-grams"), "150");

    await user.click(screen.getByTestId("confirm-lookup-add"));

    await within(screen.getByTestId("section-lunch")).findByText("Tempeh");
    expect(writes).toHaveLength(2);
    expect(writes[0].path).toBe("/api/foods");
    expect(writes[0].body).toMatchObject({ name: "Tempeh", unit: "g", calories: 1.92, source: "usda", source_id: "174272" });
    expect(writes[1].path).toMatch(/\/entries$/);
    expect(writes[1].body).toMatchObject({ section: "lunch", quantity: 150 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // and it is a food in the list now, marked as USDA's
    await user.click(screen.getByRole("button", { name: "Foods" }));
    expect(await screen.findByTestId("source-food-1")).toHaveTextContent("USDA");
  });

  it("reuses a food it already made from the same USDA id, rather than making a second", async () => {
    const foodWrites: unknown[] = [];
    stubFetch({
      lookup: { results: [TEMPEH] },
      intercept: ({ path, method, body }) => {
        if (method === "POST" && path === "/api/foods") foodWrites.push(body);
        return undefined;
      },
    });
    const user = userEvent.setup();
    await openLookup(user);
    await lookUp(user, "tempeh");
    await user.click(await screen.findByRole("button", { name: "Choose Tempeh" }));
    await user.click(screen.getByTestId("confirm-lookup-add"));
    await within(screen.getByTestId("section-lunch")).findByText("Tempeh");

    await user.click(screen.getByRole("button", { name: "Add food to Dinner" }));
    await user.click(await screen.findByTestId("open-lookup"));
    await lookUp(user, "tempeh");
    await user.click(await screen.findByRole("button", { name: "Choose Tempeh" }));
    await user.click(screen.getByTestId("confirm-lookup-add"));

    await within(screen.getByTestId("section-dinner")).findByText("Tempeh");
    expect(foodWrites).toHaveLength(1);
  });

  it("offers the person's own foods first, and takes them back to the picker with it chosen", async () => {
    stubFetch({ lookup: { results: [TEMPEH] } });
    const user = userEvent.setup();
    await openLookup(user);

    await user.type(screen.getByTestId("lookup-name"), "hummus");
    const own = await screen.findByTestId("lookup-own");
    await user.click(within(own).getByRole("button", { name: "Add Hummus from your list" }));

    const picker = await screen.findByRole("dialog", { name: "Add food to Lunch" });
    expect(within(picker).getByRole("option", { name: /Hummus/ })).toHaveAttribute("aria-selected", "true");
  });

  it("goes back to choosing when the person wants another", async () => {
    stubFetch({ lookup: { results: [TEMPEH] } });
    const user = userEvent.setup();
    await openLookup(user);
    await lookUp(user, "tempeh");
    await user.click(await screen.findByRole("button", { name: "Choose Tempeh" }));

    await user.click(screen.getByTestId("lookup-choose-another"));

    expect(screen.queryByTestId("lookup-chosen")).not.toBeInTheDocument();
    expect(screen.getByTestId("lookup-name")).toHaveValue("tempeh");
    expect(screen.getByTestId("confirm-lookup-add")).toBeDisabled();
  });

  it("says when the food was made but logging it failed, and shows the food in the list", async () => {
    stubFetch({
      lookup: { results: [TEMPEH] },
      intercept: ({ path, method }) =>
        method === "POST" && path.endsWith("/entries")
          ? { ok: false, status: 500, body: { detail: "the database is busy" } }
          : undefined,
    });
    const user = userEvent.setup();
    await openLookup(user);
    await lookUp(user, "tempeh");
    await user.click(await screen.findByRole("button", { name: "Choose Tempeh" }));

    await user.click(screen.getByTestId("confirm-lookup-add"));

    expect(await screen.findByTestId("lookup-add-problem")).toHaveTextContent(
      "Tempeh is in your list now, but logging it failed: the database is busy",
    );
    // the dialog stays so it can be tried again, and the food really is in the list
    expect(screen.getByRole("dialog", { name: "Look up a food for Lunch" })).toBeInTheDocument();
  });

  it("shows the server's sentence when lookup is not set up, and USDA having nothing", async () => {
    stubFetch({ lookup: { refuse: { status: 503, detail: "food lookup is not configured" } } });
    const user = userEvent.setup();
    await openLookup(user);
    await lookUp(user, "tempeh");
    expect(await screen.findByTestId("lookup-problem")).toHaveTextContent("food lookup is not configured");
  });

  it("says USDA has nothing, in words", async () => {
    stubFetch({ lookup: { results: [] } });
    const user = userEvent.setup();
    await openLookup(user);
    await lookUp(user, "zzzz");
    expect(await screen.findByTestId("lookup-empty")).toHaveTextContent("nothing under that name");
  });

  it("does not let grams go to zero or past the limit", async () => {
    stubFetch({ lookup: { results: [TEMPEH] } });
    const user = userEvent.setup();
    await openLookup(user);
    await lookUp(user, "tempeh");
    await user.click(await screen.findByRole("button", { name: "Choose Tempeh" }));

    await user.clear(screen.getByTestId("lookup-grams"));
    await user.type(screen.getByTestId("lookup-grams"), "0");
    expect(screen.getByTestId("confirm-lookup-add")).toBeDisabled();

    await user.clear(screen.getByTestId("lookup-grams"));
    await user.type(screen.getByTestId("lookup-grams"), "999999");
    await waitFor(() => expect(screen.getByTestId("lookup-grams")).toHaveValue(5000));
  });
});
