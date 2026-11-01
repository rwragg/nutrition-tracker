import { expect, test as base, type Page } from "@playwright/test";
import { dummyDay } from "../lib/dummy-day";
import { formatCalories, formatGrams } from "../lib/format";
import { addMacros, dayMacros, entryMacros, totalMacros } from "../lib/nutrition";
import { DAILY_TARGETS } from "../lib/targets";
import type { Section } from "../lib/types";

/**
 * The expected numbers are computed from the same pure functions the app uses,
 * so a failure here means the rendered page and the model disagree.
 */
const SAMPLE = dummyDay();
const ingredient = (foodId: string, quantity: number) =>
  entryMacros({ id: "", kind: "ingredient", foodId, quantity });
const meal = (mealId: string) => entryMacros({ id: "", kind: "meal", mealId });

const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, run) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await run(errors);
  },
});

const openAddIngredient = (page: Page, section: string) =>
  page.getByRole("button", { name: `Add ingredient to ${section}` }).click();

const openAddMeal = (page: Page, section: string) =>
  page.getByRole("button", { name: `Add meal to ${section}` }).click();

const expectQuiet = (errors: string[]) => expect(errors).toEqual([]);

test("opens with the sample day already logged", async ({ page, consoleErrors }) => {
  await page.goto("/");

  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(dayMacros(SAMPLE).calories),
  );
  await expect(page.getByTestId("day-target-calories")).toHaveText(
    formatCalories(DAILY_TARGETS.calories),
  );

  for (const section of ["breakfast", "lunch", "dinner", "snacks"] as Section[]) {
    await expect(page.getByTestId(`section-${section}-calories`)).toHaveText(
      formatCalories(totalMacros(SAMPLE[section]).calories),
    );
  }

  await expect(page.getByTestId("macro-protein")).toHaveText(
    formatGrams(dayMacros(SAMPLE).protein),
  );
  await expect(page.getByTestId("section-breakfast").getByText("Typical breakfast")).toBeVisible();
  await expect(page.getByTestId("section-breakfast").getByText("Blueberries")).toBeVisible();

  expectQuiet(consoleErrors);
});

test("adds an ingredient with a quantity and updates both totals", async ({ page, consoleErrors }) => {
  const before = dayMacros(SAMPLE);
  const added = ingredient("hummus", 2);

  await page.goto("/");
  await openAddIngredient(page, "Snacks");
  await page.getByLabel("Search ingredients").fill("hummus");
  await page.getByTestId("food-hummus").click();
  await page.getByRole("spinbutton", { name: "Quantity" }).fill("2");
  await page.getByTestId("confirm-add-ingredient").click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(addMacros(before, added).calories),
  );
  await expect(page.getByTestId("section-snacks-calories")).toHaveText(
    formatCalories(totalMacros(SAMPLE.snacks).calories + added.calories),
  );
  await expect(
    page.getByTestId("section-snacks").getByText("Hummus", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("section-snacks").getByText("2 tbsps")).toBeVisible();

  expectQuiet(consoleErrors);
});

test("adds a meal as one entry and expands to its ingredients", async ({ page, consoleErrors }) => {
  const after = addMacros(dayMacros(SAMPLE), meal("post-workout-shake"));

  await page.goto("/");
  await openAddMeal(page, "Dinner");
  await page.getByTestId("meal-post-workout-shake").click();
  await page.getByTestId("confirm-add-meal").click();

  const dinner = page.getByTestId("section-dinner");
  await expect(dinner.getByText("Post-workout shake")).toBeVisible();
  await expect(dinner.getByText("3 ingredients")).toBeVisible();
  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(after.calories),
  );

  await dinner.getByRole("button", { name: "Show ingredients of Post-workout shake" }).click();
  await expect(dinner.getByText("Whey protein")).toBeVisible();
  await expect(dinner.getByText("1 scoop")).toBeVisible();

  expectQuiet(consoleErrors);
});

test("removes an entry and updates the totals", async ({ page, consoleErrors }) => {
  const removed = ingredient("almonds", 1);

  await page.goto("/");
  await page.getByRole("button", { name: "Remove Almonds from Snacks" }).click();

  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(dayMacros(SAMPLE).calories - removed.calories),
  );
  await expect(page.getByTestId("section-snacks").getByText("Almonds")).toHaveCount(0);

  expectQuiet(consoleErrors);
});

test("closes the dialog with Escape without changing the day", async ({ page, consoleErrors }) => {
  await page.goto("/");
  const total = await page.getByTestId("day-total-calories").textContent();

  await openAddIngredient(page, "Breakfast");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("day-total-calories")).toHaveText(total ?? "");

  expectQuiet(consoleErrors);
});

test("lays out on a phone viewport without horizontal overflow", async ({ page, consoleErrors }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByTestId("day-total-calories")).toBeVisible();
  for (const section of ["breakfast", "lunch", "dinner", "snacks"] as Section[]) {
    await expect(page.getByTestId(`section-${section}`)).toBeVisible();
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  expectQuiet(consoleErrors);
});
