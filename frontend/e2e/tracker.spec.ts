import { expect, test as base, type Page } from "@playwright/test";
import { formatCalories } from "../lib/format";
import { dayMacros, entryMacros, sectionMacros } from "../lib/nutrition";
import { createSeedStore } from "../lib/seed";
import { SECTIONS, type Section } from "../lib/types";

/**
 * Expected numbers come from the app's own pure functions, so a failure means the
 * rendered page and the model disagree. The page seeds itself on load with the same
 * days, so the ids and dates line up.
 */
const store = createSeedStore();
const today = store.days[0];
const yesterday = store.days[1];

const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, run) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;

      // The browser logs every failed HTTP response as a console error. A 401 from the
      // session probe, or from a deliberately refused sign-in, is the app working - the
      // signed-out path. Anything else counts.
      const url = message.location().url ?? "";
      const expected401 =
        message.text().includes("401") && (url.endsWith("/api/session") || url.endsWith("/api/login"));
      if (expected401) return;

      errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await run(errors);
  },
});

const expectQuiet = (errors: string[]) => expect(errors).toEqual([]);

const openView = (page: Page, label: string) =>
  page.getByRole("button", { name: label, exact: true }).click();

/**
 * The app asks the server who is signed in before it renders the tracker, so every test
 * starts by signing in. The gate itself - what a signed-out visitor sees, and what a
 * refused sign-in looks like - has its own tests at the end of this file.
 */
async function openTracker(page: Page) {
  await page.goto("/");

  const signIn = page.getByTestId("sign-in");
  if (await signIn.isVisible()) {
    await page.getByLabel("Username").fill("user");
    await page.getByLabel("Password").fill("password");
    await page.getByTestId("sign-in-submit").click();
  }

  await expect(page.getByTestId("day-total-calories")).toBeVisible();
}

test("opens on the seeded day with its log", async ({ page, consoleErrors }) => {
  await openTracker(page);

  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(dayMacros(today, store).calories),
  );
  for (const section of SECTIONS) {
    await expect(page.getByTestId(`section-${section}-calories`)).toHaveText(
      formatCalories(sectionMacros(today, section, store).calories),
    );
  }
  await expect(page.getByTestId("day-switcher").getByText("Today")).toBeVisible();
  await expect(page.getByTestId("day-switcher").getByText("Yesterday")).toBeVisible();
  await expect(page.getByTestId("section-breakfast").getByText("Typical breakfast")).toBeVisible();

  expectQuiet(consoleErrors);
});

test("tracks days over time and digs into one", async ({ page, consoleErrors }) => {
  await openTracker(page);

  await expect(page.getByTestId(`day-${yesterday.id}-calories`)).toHaveText(
    formatCalories(dayMacros(yesterday, store).calories),
  );

  await page.getByTestId(`day-${yesterday.id}`).click();

  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(dayMacros(yesterday, store).calories),
  );
  await expect(page.getByTestId("section-breakfast").getByText("Post-workout shake")).toBeVisible();
  await expect(page.getByTestId("section-dinner").getByText("Nothing logged yet.")).toBeVisible();

  await page.getByTestId(`day-${today.id}`).click();
  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(dayMacros(today, store).calories),
  );

  expectQuiet(consoleErrors);
});

test("logs a food with a quantity onto the selected day", async ({ page, consoleErrors }) => {
  const added = entryMacros({ id: "", kind: "food", foodId: "hummus", quantity: 2 }, store);
  const snacks = sectionMacros(today, "snacks", store).calories;

  await openTracker(page);
  await page.getByRole("button", { name: "Add food to Snacks" }).click();
  await page.getByTestId("food-hummus").click();
  await page.getByRole("spinbutton", { name: "Quantity" }).fill("2");
  await page.getByTestId("confirm-add-food").click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("section-snacks-calories")).toHaveText(
    formatCalories(snacks + added.calories),
  );
  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(dayMacros(today, store).calories + added.calories),
  );
  await expect(page.getByTestId("section-snacks").getByText("Hummus", { exact: true })).toBeVisible();

  expectQuiet(consoleErrors);
});

test("logs a meal and expands it into its foods", async ({ page, consoleErrors }) => {
  await openTracker(page);
  await page.getByRole("button", { name: "Add meal to Dinner" }).click();
  await page.getByTestId("meal-post-workout-shake").click();
  await page.getByTestId("confirm-add-meal").click();

  const dinner = page.getByTestId("section-dinner");
  await expect(dinner.getByText("Post-workout shake")).toBeVisible();
  await expect(dinner.getByText("3 foods")).toBeVisible();

  await dinner.getByRole("button", { name: "Show foods in Post-workout shake" }).click();
  await expect(dinner.getByText("Whey protein")).toBeVisible();

  expectQuiet(consoleErrors);
});

test("removes a logged entry", async ({ page, consoleErrors }) => {
  const removed = entryMacros({ id: "", kind: "food", foodId: "almonds", quantity: 1 }, store);

  await openTracker(page);
  await page.getByRole("button", { name: "Remove Almonds from Snacks" }).click();

  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(dayMacros(today, store).calories - removed.calories),
  );
  await expect(page.getByTestId("section-snacks").getByText("Almonds")).toHaveCount(0);

  expectQuiet(consoleErrors);
});

test("creates a food, then logs it on a day", async ({ page, consoleErrors }) => {
  await openTracker(page);
  await openView(page, "Foods");

  await page.getByTestId("new-food").click();
  await page.getByTestId("food-name").fill("Cup of rice");
  await page.getByTestId("food-unit").selectOption("cup");
  await page.getByTestId("food-calories").fill("205");
  await page.getByTestId("food-protein").fill("4.3");
  await page.getByTestId("food-carbs").fill("44.5");
  await page.getByTestId("food-fat").fill("0.4");
  await page.getByTestId("save-food").click();

  await expect(page.getByTestId("foods-view").getByText("Cup of rice")).toBeVisible();

  await openView(page, "Day");
  await page.getByRole("button", { name: "Add food to Lunch" }).click();
  await page.getByRole("listbox", { name: "Foods" }).getByText("Cup of rice").click();
  await page.getByTestId("confirm-add-food").click();

  await expect(page.getByTestId("section-lunch").getByText("Cup of rice")).toBeVisible();
  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(dayMacros(today, store).calories + 205),
  );

  expectQuiet(consoleErrors);
});

test("edits a food and every day that logs it follows", async ({ page, consoleErrors }) => {
  const before = dayMacros(today, store).calories;

  await openTracker(page);
  await openView(page, "Foods");

  await page.getByRole("button", { name: "Edit Almonds" }).click();
  await page.getByTestId("food-calories").fill("200");
  await page.getByTestId("save-food").click();

  await openView(page, "Day");
  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(before + (200 - 164)),
  );

  expectQuiet(consoleErrors);
});

test("creates a meal from foods and logs it", async ({ page, consoleErrors }) => {
  await openTracker(page);
  await openView(page, "Meals");

  await page.getByTestId("new-meal").click();
  await page.getByTestId("meal-name").fill("Rice and beans");
  await page.getByTestId("row-food-0").selectOption("black-beans");
  await page.getByTestId("add-row").click();
  await page.getByTestId("row-food-1").selectOption("white-rice");
  await page.getByTestId("save-meal").click();

  const row = page.getByTestId("meals-view").getByText("Rice and beans").locator("xpath=../..");
  await expect(row).toContainText("Black beans, cooked 1 cup");
  await expect(row).toContainText("White rice, cooked 1 cup");

  await openView(page, "Day");
  await page.getByRole("button", { name: "Add meal to Lunch" }).click();
  await page.getByRole("listbox", { name: "Meals" }).getByText("Rice and beans").click();
  await page.getByTestId("confirm-add-meal").click();

  await expect(page.getByTestId("section-lunch").getByText("Rice and beans")).toBeVisible();

  expectQuiet(consoleErrors);
});

test("deletes a food nothing uses", async ({ page, consoleErrors }) => {
  await openTracker(page);
  await openView(page, "Foods");

  await page.getByTestId("new-food").click();
  await page.getByTestId("food-name").fill("Temporary food");
  await page.getByTestId("save-food").click();

  await page.getByRole("button", { name: "Delete Temporary food" }).click();
  await page.getByTestId("confirm-delete").click();

  await expect(page.getByTestId("foods-view").getByText("Temporary food")).toHaveCount(0);

  expectQuiet(consoleErrors);
});

test("deletes a meal nothing logs", async ({ page, consoleErrors }) => {
  await openTracker(page);
  await openView(page, "Meals");

  await page.getByTestId("new-meal").click();
  await page.getByTestId("meal-name").fill("Temporary meal");
  await page.getByTestId("save-meal").click();

  await page.getByRole("button", { name: "Delete Temporary meal" }).click();
  await page.getByTestId("confirm-delete").click();

  await expect(page.getByTestId("meals-view").getByText("Temporary meal")).toHaveCount(0);

  expectQuiet(consoleErrors);
});

test("refuses to delete a food that meals still use, and names them", async ({ page, consoleErrors }) => {
  await openTracker(page);
  await openView(page, "Foods");

  await page.getByRole("button", { name: "Delete Banana" }).click();

  await expect(page.getByTestId("delete-message")).toContainText("cannot be deleted");
  await expect(page.getByTestId("delete-message")).toContainText("Typical breakfast");
  await expect(page.getByTestId("delete-message")).toContainText("Post-workout shake");
  await expect(page.getByTestId("confirm-delete")).toHaveCount(0);

  await page.getByTestId("close-dialog").click();
  await expect(page.getByRole("button", { name: "Delete Banana" })).toBeVisible();

  expectQuiet(consoleErrors);
});

test("refuses to delete a meal that a day logs", async ({ page, consoleErrors }) => {
  await openTracker(page);
  await openView(page, "Meals");

  await page.getByRole("button", { name: "Delete Typical breakfast" }).click();

  await expect(page.getByTestId("delete-message")).toContainText("cannot be deleted");
  await expect(page.getByTestId("delete-message")).toContainText("Today");
  await expect(page.getByTestId("confirm-delete")).toHaveCount(0);

  expectQuiet(consoleErrors);
});

test("opens the dialog as an opaque Bootstrap modal", async ({ page, consoleErrors }) => {
  await openTracker(page);
  await page.getByRole("button", { name: "Add food to Breakfast" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Add food to Breakfast")).toBeVisible();

  // Bootstrap's .modal-content takes its background from --bs-modal-bg, which is
  // only defined on .modal. Used anywhere else it goes transparent.
  const background = await dialog
    .locator(".modal-content")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).toBe("rgb(18, 22, 31)");

  expectQuiet(consoleErrors);
});

test("lays out on a phone viewport without horizontal overflow", async ({ page, consoleErrors }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTracker(page);

  await expect(page.getByTestId("day-total-calories")).toBeVisible();
  for (const section of SECTIONS as readonly Section[]) {
    await expect(page.getByTestId(`section-${section}`)).toBeVisible();
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  expectQuiet(consoleErrors);
});

test.describe("the sign-in gate", () => {
  test("asks for credentials when nobody is signed in", async ({ page, consoleErrors }) => {
    await page.goto("/");

    await expect(page.getByTestId("sign-in")).toBeVisible();
    await expect(page.getByTestId("day-total-calories")).toHaveCount(0);

    expectQuiet(consoleErrors);
  });

  test("refuses the wrong password, says so, and stays put", async ({ page, consoleErrors }) => {
    await page.goto("/");
    await page.getByLabel("Username").fill("user");
    await page.getByLabel("Password").fill("wrong");
    await page.getByTestId("sign-in-submit").click();

    // Scoped to the panel: Next.js ships its own role="alert" route announcer.
    await expect(page.getByTestId("sign-in").getByRole("alert")).toContainText("did not match");
    await expect(page.getByTestId("day-total-calories")).toHaveCount(0);

    expectQuiet(consoleErrors);
  });

  test("signs in and then logs out, back to the sign-in screen", async ({ page, consoleErrors }) => {
    await openTracker(page);
    await expect(page.getByTestId("signed-in-as")).toHaveText("user");

    await page.getByTestId("sign-out").click();

    await expect(page.getByTestId("sign-in")).toBeVisible();
    await expect(page.getByTestId("day-total-calories")).toHaveCount(0);

    expectQuiet(consoleErrors);
  });

  test("the API refuses a signed-out caller", async ({ request }) => {
    // The screen is a convenience; this is the protection.
    expect((await request.get("/api/foods")).status()).toBe(401);
  });

  test("the data is what is protected, not the markup", async ({ page }) => {
    // P4.2 as restated: the shell is a file the browser must download, so it is public.
    // Asserted here on purpose, so it stays a decision rather than an accident.
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
  });
});
