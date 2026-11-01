import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "@/components/App";
import { formatCalories } from "@/lib/format";
import { dayMacros, entryMacros } from "@/lib/nutrition";
import { createSeedStore } from "@/lib/seed";
import type { Store } from "@/lib/types";

const store = (): Store => createSeedStore();

const openView = async (user: ReturnType<typeof userEvent.setup>, label: string) =>
  user.click(screen.getByRole("button", { name: label }));

describe("App", () => {
  it("opens on the seeded day with its log and totals", () => {
    render(<App />);
    const seed = store();

    expect(screen.getByTestId("day-total-calories")).toHaveTextContent(
      formatCalories(dayMacros(seed.days[0], seed).calories),
    );
    for (const section of ["breakfast", "lunch", "dinner", "snacks"] as const) {
      expect(screen.getByTestId(`section-${section}`)).toBeInTheDocument();
    }
    expect(within(screen.getByTestId("section-breakfast")).getByText("Typical breakfast")).toBeInTheDocument();
  });

  it("shows three seeded days with their calories", () => {
    render(<App />);
    const seed = store();
    const switcher = within(screen.getByTestId("day-switcher"));

    expect(switcher.getByText("Today")).toBeInTheDocument();
    expect(switcher.getByText("Yesterday")).toBeInTheDocument();
    for (const day of seed.days) {
      expect(screen.getByTestId(`day-${day.id}-calories`)).toHaveTextContent(
        formatCalories(dayMacros(day, seed).calories),
      );
    }
  });

  it("switches day and shows that day's log", async () => {
    const user = userEvent.setup();
    render(<App />);
    const seed = store();
    const yesterday = seed.days[1];

    await user.click(screen.getByTestId(`day-${yesterday.id}`));

    expect(screen.getByTestId("day-total-calories")).toHaveTextContent(
      formatCalories(dayMacros(yesterday, seed).calories),
    );
    expect(within(screen.getByTestId("section-lunch")).getByText("Protein lunch bowl")).toBeInTheDocument();
    expect(within(screen.getByTestId("section-dinner")).getByText("Nothing logged yet.")).toBeInTheDocument();
  });

  it("logs a food onto the selected day", async () => {
    const user = userEvent.setup();
    render(<App />);
    const seed = store();
    // One press of the stepper raises the default quantity of 1 by 0.25.
    const added = entryMacros({ id: "", kind: "food", foodId: "hummus", quantity: 1.25 }, seed);
    const snacksBefore = seed.days[0].sections.snacks.reduce(
      (total, entry) => total + entryMacros(entry, seed).calories,
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
      formatCalories(dayMacros(seed.days[0], seed).calories + added.calories),
    );
  });

  it("logs a meal onto the selected day and expands it", async () => {
    const user = userEvent.setup();
    render(<App />);

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
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Remove Blueberries from Breakfast" }));

    expect(within(screen.getByTestId("section-breakfast")).queryByText("Blueberries")).not.toBeInTheDocument();
  });

  it("creates a food and then logs it", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openView(user, "Foods");
    await user.click(screen.getByTestId("new-food"));
    await user.type(screen.getByTestId("food-name"), "Cup of rice");
    await user.selectOptions(screen.getByTestId("food-unit"), "cup");
    await user.type(screen.getByTestId("food-calories"), "205");
    await user.type(screen.getByTestId("food-protein"), "4.3");
    await user.type(screen.getByTestId("food-carbs"), "44.5");
    await user.type(screen.getByTestId("food-fat"), "0.4");
    await user.click(screen.getByTestId("save-food"));

    expect(screen.getByText("Cup of rice")).toBeInTheDocument();

    await openView(user, "Day");
    await user.click(screen.getByRole("button", { name: "Add food to Lunch" }));
    await user.click(screen.getByText("Cup of rice"));
    await user.click(screen.getByTestId("confirm-add-food"));

    expect(within(screen.getByTestId("section-lunch")).getByText("Cup of rice")).toBeInTheDocument();
    expect(screen.getByTestId("day-total-calories")).toHaveTextContent(
      formatCalories(dayMacros(store().days[0], store()).calories + 205),
    );
  });

  it("edits a food and the day totals follow", async () => {
    const user = userEvent.setup();
    render(<App />);
    const seed = store();
    const before = dayMacros(seed.days[0], seed).calories;

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

  it("refuses to delete a food that is in use, and says where", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openView(user, "Foods");
    await user.click(screen.getByRole("button", { name: "Delete Banana" }));

    const message = screen.getByTestId("delete-message");
    expect(message).toHaveTextContent("cannot be deleted");
    expect(message).toHaveTextContent("Typical breakfast");
    expect(message).toHaveTextContent("Post-workout shake");
    expect(screen.queryByTestId("confirm-delete")).not.toBeInTheDocument();
  });

  it("deletes an unused food", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openView(user, "Foods");
    await user.click(screen.getByTestId("new-food"));
    await user.type(screen.getByTestId("food-name"), "Temporary food");
    await user.click(screen.getByTestId("save-food"));

    await user.click(screen.getByRole("button", { name: "Delete Temporary food" }));
    await user.click(screen.getByTestId("confirm-delete"));

    expect(screen.queryByText("Temporary food")).not.toBeInTheDocument();
  });

  it("builds a meal from foods", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openView(user, "Meals");
    await user.click(screen.getByTestId("new-meal"));
    await user.type(screen.getByTestId("meal-name"), "Rice and beans");
    await user.selectOptions(screen.getByTestId("row-food-0"), "black-beans");
    await user.click(screen.getByTestId("add-row"));
    await user.selectOptions(screen.getByTestId("row-food-1"), "white-rice");
    await user.click(screen.getByTestId("save-meal"));

    const row = screen.getByText("Rice and beans").closest("li") as HTMLElement;
    expect(within(row).getByText(/Black beans, cooked 1 cup/)).toBeInTheDocument();
  });

  it("refuses to delete a meal that a day logs", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openView(user, "Meals");
    await user.click(screen.getByRole("button", { name: "Delete Typical breakfast" }));

    expect(screen.getByTestId("delete-message")).toHaveTextContent("cannot be deleted");
    expect(screen.getByTestId("delete-message")).toHaveTextContent("Today");
    expect(screen.queryByTestId("confirm-delete")).not.toBeInTheDocument();
  });

  it("deletes a meal that no day logs", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openView(user, "Meals");
    await user.click(screen.getByTestId("new-meal"));
    await user.type(screen.getByTestId("meal-name"), "Temporary meal");
    await user.click(screen.getByTestId("save-meal"));

    await user.click(screen.getByRole("button", { name: "Delete Temporary meal" }));
    await user.click(screen.getByTestId("confirm-delete"));

    expect(screen.queryByText("Temporary meal")).not.toBeInTheDocument();
  });

  it("closes a dialog with Escape", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add food to Snacks" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
