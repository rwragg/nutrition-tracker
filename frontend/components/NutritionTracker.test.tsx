import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import NutritionTracker from "@/components/NutritionTracker";
import { dummyDay } from "@/lib/dummy-day";
import { FOODS_BY_ID } from "@/lib/foods";
import { formatCalories, formatGrams } from "@/lib/format";
import { addMacros, dayMacros, entryMacros, totalMacros } from "@/lib/nutrition";
import { DAILY_TARGETS } from "@/lib/targets";
import type { Section } from "@/lib/types";

const ingredient = (foodId: string, quantity: number) =>
  entryMacros({ id: "", kind: "ingredient", foodId, quantity });

const meal = (mealId: string) => entryMacros({ id: "", kind: "meal", mealId });

describe("NutritionTracker", () => {
  it("opens with the sample day already logged", () => {
    render(<NutritionTracker />);

    const sample = dummyDay();
    expect(screen.getByTestId("day-total-calories")).toHaveTextContent(
      formatCalories(dayMacros(sample).calories),
    );

    for (const section of ["breakfast", "lunch", "dinner", "snacks"] as Section[]) {
      expect(screen.getByTestId(`section-${section}-calories`)).toHaveTextContent(
        formatCalories(totalMacros(sample[section]).calories),
      );
    }

    const breakfast = within(screen.getByTestId("section-breakfast"));
    expect(breakfast.getByText("Typical breakfast")).toBeInTheDocument();
    expect(breakfast.getByText("Blueberries")).toBeInTheDocument();
  });

  it("shows the calorie target and macro bars", () => {
    render(<NutritionTracker />);
    const macros = dayMacros(dummyDay());

    expect(screen.getByTestId("day-target-calories")).toHaveTextContent(
      formatCalories(DAILY_TARGETS.calories),
    );
    expect(screen.getByTestId("macro-protein")).toHaveTextContent(formatGrams(macros.protein));
  });

  it("adds an ingredient to the chosen section and updates the totals", async () => {
    const user = userEvent.setup();
    render(<NutritionTracker />);

    const before = dayMacros(dummyDay());
    // One press of the stepper raises the default quantity of 1 by 0.25.
    const added = ingredient("egg", 1.25);
    const after = addMacros(before, added);

    await user.click(screen.getByRole("button", { name: "Add ingredient to Lunch" }));
    await user.click(screen.getByTestId("food-egg"));
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    await user.click(screen.getByTestId("confirm-add-ingredient"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("day-total-calories")).toHaveTextContent(
      formatCalories(after.calories),
    );
    expect(screen.getByTestId("section-lunch-calories")).toHaveTextContent(
      formatCalories(totalMacros(dummyDay().lunch).calories + added.calories),
    );
    expect(within(screen.getByTestId("section-lunch")).getByText("Egg, large")).toBeInTheDocument();
  });

  it("filters the ingredient list as you type", async () => {
    const user = userEvent.setup();
    render(<NutritionTracker />);

    await user.click(screen.getByRole("button", { name: "Add ingredient to Snacks" }));
    await user.type(screen.getByLabelText("Search ingredients"), "almond");

    expect(screen.getByTestId("food-almonds")).toBeInTheDocument();
    expect(screen.queryByTestId("food-banana")).not.toBeInTheDocument();
  });

  it("adds a meal as one entry with its ingredients", async () => {
    const user = userEvent.setup();
    render(<NutritionTracker />);

    const after = addMacros(dayMacros(dummyDay()), meal("post-workout-shake"));

    await user.click(screen.getByRole("button", { name: "Add meal to Dinner" }));
    await user.click(screen.getByTestId("meal-post-workout-shake"));
    await user.click(screen.getByTestId("confirm-add-meal"));

    const dinner = within(screen.getByTestId("section-dinner"));
    expect(dinner.getByText("Post-workout shake")).toBeInTheDocument();
    expect(dinner.getByText("3 ingredients")).toBeInTheDocument();
    expect(screen.getByTestId("day-total-calories")).toHaveTextContent(
      formatCalories(after.calories),
    );
  });

  it("expands a meal to show its ingredients", async () => {
    const user = userEvent.setup();
    render(<NutritionTracker />);

    const breakfast = within(screen.getByTestId("section-breakfast"));
    expect(breakfast.queryByText("Rolled oats, dry")).not.toBeInTheDocument();

    await user.click(breakfast.getByRole("button", { name: "Show ingredients of Typical breakfast" }));

    expect(breakfast.getByText("Rolled oats, dry")).toBeInTheDocument();
    expect(breakfast.getByText(FOODS_BY_ID.oats.name)).toBeInTheDocument();
  });

  it("removes an entry and updates the totals", async () => {
    const user = userEvent.setup();
    render(<NutritionTracker />);

    const before = dayMacros(dummyDay());
    const removed = ingredient("almonds", 1);

    await user.click(screen.getByRole("button", { name: "Remove Almonds from Snacks" }));

    expect(screen.getByTestId("day-total-calories")).toHaveTextContent(
      formatCalories(before.calories - removed.calories),
    );
    expect(within(screen.getByTestId("section-snacks")).queryByText("Almonds")).not.toBeInTheDocument();
  });

  it("closes a dialog with Escape", async () => {
    const user = userEvent.setup();
    render(<NutritionTracker />);

    await user.click(screen.getByRole("button", { name: "Add ingredient to Snacks" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
