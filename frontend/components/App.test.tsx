import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "@/components/App";
import { formatCalories } from "@/lib/format";
import { dayMacros, entryMacros } from "@/lib/nutrition";
import { stubFetch } from "@/test/fetch-stub";
import { DATES, FOODS, dayWithSections, sampleStore } from "@/test/fixture";

const store = () => sampleStore();
const day = (index: number) => dayWithSections(DATES[index]);

/**
 * The app asks the server who is signed in, then reads the log from the API, before it renders the
 * tracker - so every test here waits for that answer before it asserts anything. The signed-out
 * screen has its own tests in session-gate.test.tsx. The server is `test/fetch-stub.ts`, over the
 * world in `test/fixture.ts`, and it is fresh for every test.
 */
const renderApp = async () => {
  render(<App />);
  await screen.findByTestId("day-total-calories");
};

const openView = async (user: ReturnType<typeof userEvent.setup>, label: string) =>
  user.click(screen.getByRole("button", { name: label }));

describe("App", () => {
  it("opens on today with its log and totals", async () => {
    await renderApp();

    expect(screen.getByTestId("day-total-calories")).toHaveTextContent(
      formatCalories(dayMacros(day(0), store()).calories),
    );
    for (const section of ["breakfast", "lunch", "dinner", "snacks"] as const) {
      expect(screen.getByTestId(`section-${section}`)).toBeInTheDocument();
    }
    expect(
      within(screen.getByTestId("section-breakfast")).getByText("Typical breakfast"),
    ).toBeInTheDocument();
  });

  it("shows the three days with the figures the server reports", async () => {
    await renderApp();
    const switcher = within(screen.getByTestId("day-switcher"));

    expect(switcher.getByText("Today")).toBeInTheDocument();
    expect(switcher.getByText("Yesterday")).toBeInTheDocument();

    for (const summary of store().days) {
      expect(screen.getByTestId(`day-${summary.date}-calories`)).toHaveTextContent(
        formatCalories(summary.macros.calories),
      );
    }
  });

  it("switches day and shows that day's log", async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByTestId(`day-${DATES[1]}`));

    expect(screen.getByTestId("day-total-calories")).toHaveTextContent(
      formatCalories(dayMacros(day(1), store()).calories),
    );
    expect(
      within(screen.getByTestId("section-lunch")).getByText("Protein lunch bowl"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("section-dinner")).getByText("Nothing logged yet."),
    ).toBeInTheDocument();
  });

  it("logs a food onto the selected day", async () => {
    const user = userEvent.setup();
    await renderApp();
    // One press of the stepper raises the default quantity of 1 by 0.25.
    const added = entryMacros({ id: "", kind: "food", foodId: "hummus", quantity: 1.25 }, store());
    const snacksBefore = dayWithSections(DATES[0]).sections.snacks.reduce(
      (total, entry) => total + entryMacros(entry, store()).calories,
      0,
    );

    await user.click(screen.getByRole("button", { name: "Add food to Snacks" }));
    await user.click(screen.getByTestId("food-hummus"));
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    await user.click(screen.getByTestId("confirm-add-food"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("section-snacks-calories")).toHaveTextContent(
      formatCalories(snacksBefore + added.calories),
    );
    expect(within(screen.getByTestId("section-snacks")).getByText("Hummus")).toBeInTheDocument();
    expect(screen.getByTestId("day-total-calories")).toHaveTextContent(
      formatCalories(dayMacros(day(0), store()).calories + added.calories),
    );
  });

  it("logs a meal onto the selected day and expands it", async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole("button", { name: "Add meal to Dinner" }));
    await user.click(screen.getByTestId("meal-post-workout-shake"));
    await user.click(screen.getByTestId("confirm-add-meal"));

    const dinner = within(screen.getByTestId("section-dinner"));
    expect(dinner.getByText("Post-workout shake")).toBeInTheDocument();
    expect(dinner.getByText("3 foods")).toBeInTheDocument();

    await user.click(dinner.getByRole("button", { name: "Show foods in Post-workout shake" }));
    expect(dinner.getByText("Whey protein")).toBeInTheDocument();
  });

  it("removes a logged entry", async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole("button", { name: "Remove Blueberries from Breakfast" }));

    expect(
      within(screen.getByTestId("section-breakfast")).queryByText("Blueberries"),
    ).not.toBeInTheDocument();
  });

  it("creates a food and then logs it", async () => {
    const user = userEvent.setup();
    await renderApp();

    await openView(user, "Foods");
    await user.click(screen.getByTestId("new-food"));
    await user.type(screen.getByTestId("food-name"), "Cup of rice");
    await user.selectOptions(screen.getByTestId("food-unit"), "cup");
    await user.type(screen.getByTestId("food-calories"), "205");
    await user.type(screen.getByTestId("food-protein"), "4.3");
    await user.type(screen.getByTestId("food-carbs"), "44.5");
    await user.type(screen.getByTestId("food-fat"), "0.4");
    await user.click(screen.getByTestId("save-food"));

    expect(await screen.findByText("Cup of rice")).toBeInTheDocument();

    await openView(user, "Day");
    await user.click(screen.getByRole("button", { name: "Add food to Lunch" }));
    await user.click(screen.getByText("Cup of rice"));
    await user.click(screen.getByTestId("confirm-add-food"));

    expect(
      await within(screen.getByTestId("section-lunch")).findByText("Cup of rice"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("day-total-calories")).toHaveTextContent(
      formatCalories(dayMacros(day(0), store()).calories + 205),
    );
  });

  it("edits a food and the day totals follow", async () => {
    const user = userEvent.setup();
    await renderApp();
    const before = dayMacros(day(0), store()).calories;

    await openView(user, "Foods");
    await user.click(screen.getByRole("button", { name: "Edit Almonds" }));
    await user.clear(screen.getByTestId("food-calories"));
    await user.type(screen.getByTestId("food-calories"), "200");
    await user.click(screen.getByTestId("save-food"));

    await openView(user, "Day");
    expect(screen.getByTestId("day-total-calories")).toHaveTextContent(
      formatCalories(before + (200 - 164)),
    );
  });

  it("refuses a delete the server refuses, and says where the food is used", async () => {
    const user = userEvent.setup();
    await renderApp();

    await openView(user, "Foods");
    await user.click(screen.getByRole("button", { name: "Delete Banana" }));
    await user.click(screen.getByTestId("confirm-delete"));

    const message = await screen.findByTestId("delete-problem");
    expect(message).toHaveTextContent("cannot be deleted");
    expect(message).toHaveTextContent("Typical breakfast");
    expect(message).toHaveTextContent("Post-workout shake");
    expect(screen.queryByTestId("confirm-delete")).not.toBeInTheDocument();
  });

  it("deletes an unused food", async () => {
    const user = userEvent.setup();
    await renderApp();

    await openView(user, "Foods");
    await user.click(screen.getByTestId("new-food"));
    await user.type(screen.getByTestId("food-name"), "Temporary food");
    await user.click(screen.getByTestId("save-food"));

    await user.click(await screen.findByRole("button", { name: "Delete Temporary food" }));
    await user.click(screen.getByTestId("confirm-delete"));

    await waitFor(() => expect(screen.queryByText("Temporary food")).not.toBeInTheDocument());
  });

  it("builds a meal from foods", async () => {
    const user = userEvent.setup();
    await renderApp();

    await openView(user, "Meals");
    await user.click(screen.getByTestId("new-meal"));
    await user.type(screen.getByTestId("meal-name"), "Rice and beans");
    await user.selectOptions(screen.getByTestId("row-food-0"), "black-beans");
    await user.click(screen.getByTestId("add-row"));
    await user.selectOptions(screen.getByTestId("row-food-1"), "white-rice");
    await user.click(screen.getByTestId("save-meal"));

    const row = (await screen.findByText("Rice and beans")).closest("li") as HTMLElement;
    expect(within(row).getByText(/Black beans, cooked 1 cup/)).toBeInTheDocument();
  });

  it("refuses a meal delete the server refuses", async () => {
    const user = userEvent.setup();
    await renderApp();

    await openView(user, "Meals");
    await user.click(screen.getByRole("button", { name: "Delete Typical breakfast" }));
    await user.click(screen.getByTestId("confirm-delete"));

    const message = await screen.findByTestId("delete-problem");
    expect(message).toHaveTextContent("cannot be deleted");
    expect(message).toHaveTextContent("Today");
    expect(screen.queryByTestId("confirm-delete")).not.toBeInTheDocument();
  });

  it("deletes a meal that no day logs", async () => {
    const user = userEvent.setup();
    await renderApp();

    await openView(user, "Meals");
    await user.click(screen.getByTestId("new-meal"));
    await user.type(screen.getByTestId("meal-name"), "Temporary meal");
    await user.click(screen.getByTestId("save-meal"));

    await user.click(await screen.findByRole("button", { name: "Delete Temporary meal" }));
    await user.click(screen.getByTestId("confirm-delete"));

    await waitFor(() => expect(screen.queryByText("Temporary meal")).not.toBeInTheDocument());
  });

  it("closes a dialog with Escape", async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole("button", { name: "Add food to Snacks" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("takes a food back out of a meal before saving it", async () => {
    const user = userEvent.setup();
    await renderApp();

    await openView(user, "Meals");
    await user.click(screen.getByTestId("new-meal"));
    await user.type(screen.getByTestId("meal-name"), "One food");
    await user.click(screen.getByTestId("add-row"));
    await user.click(screen.getByTestId("remove-row-1"));
    await user.click(screen.getByTestId("save-meal"));

    const row = (await screen.findByText("One food")).closest("li") as HTMLElement;
    // The form starts a row on the first food in the list, so ask the fixture which that is.
    const contents = within(row).getByText(new RegExp(FOODS[0].name));

    // One food, not two: the second row was removed before saving.
    expect(contents.textContent).not.toContain("·");
  });
});

/**
 * The paths a working server never takes. They exist - a load that cannot happen, a write that is
 * refused, a server that is not there - and nothing else in the suite runs them, so they are asserted
 * here rather than assumed.
 */
describe("when the server is not co-operating", () => {
  it("says the log could not be loaded, and repeats what the server said", async () => {
    stubFetch({
      intercept: ({ path }) =>
        path === "/api/foods"
          ? { ok: false, status: 503, body: { detail: "the foods list is unavailable" } }
          : undefined,
    });

    render(<App />);

    expect(await screen.findByTestId("load-failed")).toHaveTextContent("the foods list is unavailable");
  });

  it("says so in the app's own words when the server cannot be reached at all", async () => {
    // The session answers; the records do not, because the server is not there for them.
    stubFetch({ offline: ({ path }) => path.startsWith("/api/days") || path.startsWith("/api/foods") });

    render(<App />);

    expect(await screen.findByTestId("load-failed")).toHaveTextContent("Could not reach the server");
  });

  it("shows the sign-in screen when the session cannot be checked", async () => {
    stubFetch({ offline: true });

    render(<App />);

    expect(await screen.findByTestId("sign-in")).toBeInTheDocument();
  });

  it("keeps the page, and says a refresh failed", async () => {
    let failing = false;
    stubFetch({
      intercept: ({ path }) =>
        failing && path === "/api/foods"
          ? { ok: false, status: 503, body: { detail: "try again" } }
          : undefined,
    });

    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("day-total-calories");

    failing = true;
    await user.click(screen.getByRole("button", { name: "Remove Blueberries from Breakfast" }));

    expect(await screen.findByTestId("page-problem")).toHaveTextContent("try again");
    // The page is still the day it was, rather than blanked by a failed refresh.
    expect(screen.getByTestId("day-total-calories")).toBeInTheDocument();
  });

  it("closes that notice when it is dismissed", async () => {
    let failing = false;
    stubFetch({
      intercept: ({ path }) =>
        failing && path === "/api/foods" ? { ok: false, status: 503, body: { detail: "try again" } } : undefined,
    });

    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("day-total-calories");

    failing = true;
    await user.click(screen.getByRole("button", { name: "Remove Blueberries from Breakfast" }));
    await screen.findByTestId("page-problem");

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByTestId("page-problem")).not.toBeInTheDocument();
  });

  it("shows a refused save inside the form, and leaves the form open", async () => {
    stubFetch({
      intercept: ({ path, method }) =>
        method === "POST" && path === "/api/foods"
          ? { ok: false, status: 422, body: { detail: "a food needs a name" } }
          : undefined,
    });

    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("day-total-calories");

    await openView(user, "Foods");
    await user.click(screen.getByTestId("new-food"));
    await user.type(screen.getByTestId("food-name"), "Refused food");
    await user.click(screen.getByTestId("save-food"));

    expect(await screen.findByTestId("food-problem")).toHaveTextContent("a food needs a name");
    expect(screen.getByTestId("save-food")).toBeInTheDocument();
    expect(screen.queryByText("Refused food")).not.toBeInTheDocument();
  });
});
