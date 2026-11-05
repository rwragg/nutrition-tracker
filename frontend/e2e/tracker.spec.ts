import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  expect,
  test as base,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { formatCalories } from "../lib/format";
import { dayLabel } from "../lib/dates";
import { dayMacros, entryMacros, sectionMacros } from "../lib/nutrition";
import {
  SECTIONS,
  type Day,
  type Food,
  type LogEntry,
  type Meal,
  type Section,
  type Store,
} from "../lib/types";

/**
 * Approve a waiting account the way the admin does: by running the real `scripts/users.sh` against this suite's own
 * stack (Part 14, R67). There is no web route that does it, on purpose, so a browser test that needs an account that
 * can sign in has to go through the script, which also exercises the script against a live container.
 */
function approve(name: string): string {
  return execFileSync(
    "bash",
    ["scripts/users.sh", "--project", "nutrition-e2e", "approve", name],
    { cwd: path.resolve(process.cwd(), ".."), encoding: "utf8" },
  );
}

/**
 * The browser tests, against the container the compose stack builds.
 *
 * The app reads its log from the backend now, so the expected numbers are read out of the API rather
 * than out of a seeder: the state below is what the server actually holds, and the assertions then
 * run the app's own pure functions over it. Two things that follow from that:
 *
 * - a figure the *server* reports is asserted against the server's number (the day chips), and a
 *   figure the *app* computes is asserted against the app's maths (the day summary and the section
 *   subtotals). Comparing the two to each other would turn a float's summation order into a failure.
 * - a test that writes puts the log back as it found it, because the database is shared. The stack
 *   and its volume are the suite's own, and `playwright.config.ts` throws them away before each run,
 *   so the seeded starting state is the same every time.
 */
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
        message.text().includes("401") &&
        (url.endsWith("/api/session") || url.endsWith("/api/login"));
      if (expected401) return;

      errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await run(errors);
  },
});

const expectQuiet = (errors: string[]) => expect(errors).toEqual([]);

/**
 * The browser logs any non-2xx response as a console error, so a test that asks the server for a
 * refusal has to count that one out - and only that one, by status.
 */
const expectQuietApartFrom = (errors: string[], allowed: string[]) =>
  expect(
    errors.filter((line) => !allowed.some((text) => line.includes(text))),
  ).toEqual([]);

const openView = (page: Page, label: string) =>
  page.getByRole("button", { name: label, exact: true }).click();

/** Sign in for the API calls a test makes alongside the browser. */
async function signInApi(request: APIRequestContext) {
  const response = await request.post("/api/login", {
    data: { username: "user", password: "password" },
  });
  expect(response.ok()).toBeTruthy();
}

type AppState = { store: Store; open: Day; dates: string[] };

/** What the server holds right now: the records, and the day the app opens on. */
async function readState(request: APIRequestContext): Promise<AppState> {
  const foods = (await (await request.get("/api/foods")).json()) as Food[];
  const meals = (await (await request.get("/api/meals")).json()) as Meal[];
  const days = (await (await request.get("/api/days")).json()) as {
    date: string;
    macros: Day["macros"];
  }[];
  const newest = days[0].date;
  const day = (await (await request.get(`/api/days/${newest}`)).json()) as Omit<
    Day,
    "id"
  >;

  return {
    store: { foods, meals, days },
    open: {
      id: day.date,
      date: day.date,
      macros: day.macros,
      sections: day.sections,
    },
    dates: days.map((candidate) => candidate.date),
  };
}

const state = async (request: APIRequestContext) => {
  await signInApi(request);
  return readState(request);
};

/** Take a record back out, so the next test starts from the state this one found. */
async function removeEntries(
  request: APIRequestContext,
  date: string,
  matches: (entry: LogEntry) => boolean,
) {
  const day = (await (await request.get(`/api/days/${date}`)).json()) as Omit<
    Day,
    "id"
  >;

  for (const section of SECTIONS) {
    for (const entry of day.sections[section]) {
      if (matches(entry))
        await request.delete(`/api/days/${date}/entries/${entry.id}`);
    }
  }
}

async function deleteFoodNamed(request: APIRequestContext, name: string) {
  const foods = (await (await request.get("/api/foods")).json()) as Food[];
  const found = foods.filter((food) => food.name === name);

  for (const food of found)
    await request.delete(`/api/foods/${encodeURIComponent(food.id)}`);
}

async function deleteMealNamed(request: APIRequestContext, name: string) {
  const meals = (await (await request.get("/api/meals")).json()) as Meal[];
  const found = meals.filter((meal) => meal.name === name);

  for (const meal of found)
    await request.delete(`/api/meals/${encodeURIComponent(meal.id)}`);
}

/**
 * Sign in and open the tracker.
 *
 * The sign-in goes through the page's own request context, which shares its cookie jar, rather than
 * through the form: the form needs the app to have finished its session probe before it can be
 * filled, and `isVisible` does not wait, so a form-based helper races the app's own check and
 * occasionally skips signing in. Signing in first means the page renders the tracker on load.
 *
 * The gate itself - what a signed-out visitor sees, and what a refused sign-in looks like - has its
 * own tests at the end of this file, which go to the page without signing in.
 */
async function openTracker(
  page: Page,
  { profile = true }: { profile?: boolean } = {},
) {
  const signedIn = await page.request.post("/api/login", {
    data: { username: "user", password: "password" },
  });
  expect(signedIn.ok()).toBeTruthy();

  // An account with no profile cannot add anything (Part 12, R54), and most tests add something, so the
  // account gets an invented one unless the test is about having none. Either way the state is set here, so
  // a test never depends on what the one before it left behind.
  if (profile) {
    const saved = await page.request.put("/api/profile", {
      data: inventedProfile(),
    });
    expect(saved.ok()).toBeTruthy();
  } else {
    expect((await page.request.delete("/api/profile")).ok()).toBeTruthy();
  }

  await page.goto("/");
  await expect(page.getByTestId("day-total-calories")).toBeVisible();
}

test("opens on the newest day, with its log and its figures", async ({
  page,
  request,
  consoleErrors,
}) => {
  const { store, open } = await state(request);

  await openTracker(page);

  // The app's own arithmetic over the entries the server returned.
  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(dayMacros(open, store).calories),
  );
  for (const section of SECTIONS) {
    await expect(page.getByTestId(`section-${section}-calories`)).toHaveText(
      formatCalories(sectionMacros(open, section, store).calories),
    );
  }

  // The chip is the figure the server reports for that date.
  await expect(page.getByTestId(`day-${open.date}-calories`)).toHaveText(
    formatCalories(open.macros.calories),
  );
  await expect(
    page.getByTestId("day-switcher").getByText("Today"),
  ).toBeVisible();

  expectQuiet(consoleErrors);
});

test("lists every logged day, newest first, each with the server's figure", async ({
  page,
  request,
  consoleErrors,
}) => {
  const { store } = await state(request);

  await openTracker(page);

  await expect(
    page.getByTestId("day-switcher").getByRole("button"),
  ).toHaveCount(store.days.length);
  for (const day of store.days) {
    await expect(page.getByTestId(`day-${day.date}-calories`)).toHaveText(
      formatCalories(day.macros.calories),
    );
  }

  expectQuiet(consoleErrors);
});

test("digs into another day", async ({ page, request, consoleErrors }) => {
  const { store, dates } = await state(request);
  const other = dates[1];
  const day = (await (await request.get(`/api/days/${other}`)).json()) as Omit<
    Day,
    "id"
  >;
  const target: Day = {
    id: day.date,
    date: day.date,
    macros: day.macros,
    sections: day.sections,
  };

  await openTracker(page);
  await page.getByTestId(`day-${other}`).click();

  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(dayMacros(target, store).calories),
  );

  for (const section of SECTIONS) {
    const card = page.getByTestId(`section-${section}`);
    if (day.sections[section].length === 0) {
      await expect(card.getByText("Nothing logged yet.")).toBeVisible();
    } else {
      await expect(card.getByText("Nothing logged yet.")).toHaveCount(0);
    }
  }

  expectQuiet(consoleErrors);
});

test("logs a food with a quantity onto the selected day", async ({
  page,
  request,
  consoleErrors,
}) => {
  const { store, open } = await state(request);
  const added = entryMacros(
    { id: "", kind: "food", foodId: "hummus", quantity: 2 },
    store,
  );
  const before = dayMacros(open, store).calories;

  await openTracker(page);
  await page.getByRole("button", { name: "Add food to Snacks" }).click();
  await page.getByTestId("food-hummus").click();
  await page.getByRole("spinbutton", { name: "Quantity" }).fill("2");
  await page.getByTestId("confirm-add-food").click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(before + added.calories),
  );
  await expect(
    page.getByTestId("section-snacks").getByText("Hummus", { exact: true }),
  ).toBeVisible();

  await removeEntries(
    request,
    open.date,
    (entry) => entry.kind === "food" && entry.foodId === "hummus",
  );
  expectQuiet(consoleErrors);
});

test("logs a meal and expands it into its foods", async ({
  page,
  request,
  consoleErrors,
}) => {
  const { store, open } = await state(request);
  // A meal with more than one food that this day does not already log. Adding one that is already
  // there leaves two rows with the same name and the same "N foods" detail, so an assertion inside
  // the section can be satisfied by the row that was there before the write - which passed here for
  // months by winning a race against the app's own re-read.
  const meal = store.meals.find(
    (candidate) =>
      candidate.ingredients.length > 1 &&
      !open.sections.dinner.some(
        (entry) => entry.kind === "meal" && entry.mealId === candidate.id,
      ),
  )!;
  const firstFood = store.foods.find(
    (food) => food.id === meal.ingredients[0]!.foodId,
  )!;

  await openTracker(page);
  await page.getByRole("button", { name: "Add meal to Dinner" }).click();
  await page.getByTestId(`meal-${meal.id}`).click();

  const posted = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/days/${open.date}/entries`) &&
      response.request().method() === "POST",
  );
  await page.getByTestId("confirm-add-meal").click();
  const created = (await (await posted).json()) as { id: string };

  // Scoped to the entry the write created, by id: no other row can stand in for it.
  const row = page.getByTestId(`entry-${created.id}`);
  await expect(row.getByText(meal.name)).toBeVisible();
  await expect(row.getByText(`${meal.ingredients.length} foods`)).toBeVisible();

  await row.getByRole("button", { name: `Show foods in ${meal.name}` }).click();
  await expect(row.getByText(firstFood.name)).toBeVisible();

  // Only what this test wrote. Removing every entry for the meal would take the sample's own dinner
  // with it, so the next test would read a day the seed did not write.
  await request.delete(`/api/days/${open.date}/entries/${created.id}`);
  expectQuiet(consoleErrors);
});

test("removes a logged entry and the figures follow", async ({
  page,
  request,
  consoleErrors,
}) => {
  const { store, open } = await state(request);
  const before = dayMacros(open, store).calories;

  // Put one there to remove, so this test does not depend on what the sample happens to hold.
  await request.post(`/api/days/${open.date}/entries`, {
    data: { section: "snacks", food_id: "hummus", quantity: 2 },
  });

  await openTracker(page);
  await page.getByRole("button", { name: "Remove Hummus from Snacks" }).click();

  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(before),
  );
  await expect(
    page.getByTestId("section-snacks").getByText("Hummus", { exact: true }),
  ).toHaveCount(0);

  expectQuiet(consoleErrors);
});

test("the log survives a reload", async ({ page, request, consoleErrors }) => {
  const { store, open } = await state(request);
  const added = entryMacros(
    { id: "", kind: "food", foodId: "hummus", quantity: 2 },
    store,
  );
  const expected = formatCalories(
    dayMacros(open, store).calories + added.calories,
  );

  await openTracker(page);
  await page.getByRole("button", { name: "Add food to Snacks" }).click();
  await page.getByTestId("food-hummus").click();
  await page.getByRole("spinbutton", { name: "Quantity" }).fill("2");
  await page.getByTestId("confirm-add-food").click();

  await expect(page.getByTestId("day-total-calories")).toHaveText(expected);

  // R23: the same day, the same entries, after the page is loaded from scratch.
  await page.reload();
  await expect(page.getByTestId("day-total-calories")).toHaveText(expected);
  await expect(
    page.getByTestId("section-snacks").getByText("Hummus", { exact: true }),
  ).toBeVisible();

  await removeEntries(
    request,
    open.date,
    (entry) => entry.kind === "food" && entry.foodId === "hummus",
  );
  expectQuiet(consoleErrors);
});

test("a second session sees the same log", async ({
  page,
  request,
  consoleErrors,
}) => {
  const { store, open } = await state(request);
  const added = entryMacros(
    { id: "", kind: "food", foodId: "hummus", quantity: 2 },
    store,
  );
  const expected = formatCalories(
    dayMacros(open, store).calories + added.calories,
  );

  await openTracker(page);
  await page.getByRole("button", { name: "Add food to Snacks" }).click();
  await page.getByTestId("food-hummus").click();
  await page.getByRole("spinbutton", { name: "Quantity" }).fill("2");
  await page.getByTestId("confirm-add-food").click();
  await expect(page.getByTestId("day-total-calories")).toHaveText(expected);

  const second = await page.context().browser()!.newContext();
  const other = await second.newPage();
  await openTracker(other);
  await expect(other.getByTestId("day-total-calories")).toHaveText(expected);
  await expect(
    other.getByTestId("section-snacks").getByText("Hummus", { exact: true }),
  ).toBeVisible();
  await second.close();

  await removeEntries(
    request,
    open.date,
    (entry) => entry.kind === "food" && entry.foodId === "hummus",
  );
  expectQuiet(consoleErrors);
});

test("creates a food, then logs it on a day", async ({
  page,
  request,
  consoleErrors,
}) => {
  const { store, open } = await state(request);
  const before = dayMacros(open, store).calories;

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

  await expect(
    page.getByTestId("foods-view").getByText("Cup of rice"),
  ).toBeVisible();

  await openView(page, "Day");
  await page.getByRole("button", { name: "Add food to Lunch" }).click();
  await page
    .getByRole("listbox", { name: "Foods" })
    .getByText("Cup of rice")
    .click();
  await page.getByTestId("confirm-add-food").click();

  await expect(
    page.getByTestId("section-lunch").getByText("Cup of rice"),
  ).toBeVisible();
  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(before + 205),
  );

  await removeEntries(
    request,
    open.date,
    (entry) => entry.kind === "food" && entry.foodId === "rice",
  );
  await deleteFoodNamed(request, "Cup of rice");
  expectQuiet(consoleErrors);
});

test("edits a food and every day that logs it follows", async ({
  page,
  request,
  consoleErrors,
}) => {
  await state(request);

  await request.post("/api/foods", {
    data: {
      name: "Steady food",
      unit: "cup",
      calories: 100,
      protein: 1,
      carbs: 1,
      fat: 1,
    },
  });

  const { store, open } = await readState(request);
  const created = store.foods.find((food) => food.name === "Steady food")!;
  await request.post(`/api/days/${open.date}/entries`, {
    data: { section: "lunch", food_id: created.id, quantity: 1 },
  });

  // The day as it stands with the new food in it, computed the app's way.
  const { store: withFood, open: dayWithFood } = await readState(request);
  const before = dayMacros(dayWithFood, withFood).calories;

  await openTracker(page);
  await openView(page, "Foods");
  await page.getByRole("button", { name: "Edit Steady food" }).click();
  await page.getByTestId("food-calories").fill("300");
  await page.getByTestId("save-food").click();

  await openView(page, "Day");
  await expect(page.getByTestId("day-total-calories")).toHaveText(
    formatCalories(before + 200),
  );

  await removeEntries(
    request,
    open.date,
    (entry) => entry.kind === "food" && entry.foodId === created.id,
  );
  await deleteFoodNamed(request, "Steady food");
  expectQuiet(consoleErrors);
});

test("creates a meal from foods and logs it", async ({
  page,
  request,
  consoleErrors,
}) => {
  const { open } = await state(request);

  await openTracker(page);
  await openView(page, "Meals");

  await page.getByTestId("new-meal").click();
  await page.getByTestId("meal-name").fill("Rice and beans");
  await page.getByTestId("row-food-0").selectOption("black-beans");
  await page.getByTestId("add-row").click();
  await page.getByTestId("row-food-1").selectOption("white-rice");
  await page.getByTestId("save-meal").click();

  const row = page
    .getByTestId("meals-view")
    .getByText("Rice and beans")
    .locator("xpath=../..");
  await expect(row).toContainText("Black beans, cooked 1 cup");
  await expect(row).toContainText("White rice, cooked 1 cup");

  await openView(page, "Day");
  await page.getByRole("button", { name: "Add meal to Lunch" }).click();
  await page
    .getByRole("listbox", { name: "Meals" })
    .getByText("Rice and beans")
    .click();
  await page.getByTestId("confirm-add-meal").click();

  await expect(
    page.getByTestId("section-lunch").getByText("Rice and beans"),
  ).toBeVisible();

  const meals = (await (await request.get("/api/meals")).json()) as Meal[];
  const built = meals.find((meal) => meal.name === "Rice and beans")!;
  await removeEntries(
    request,
    open.date,
    (entry) => entry.kind === "meal" && entry.mealId === built.id,
  );
  await deleteMealNamed(request, "Rice and beans");
  expectQuiet(consoleErrors);
});

test("deletes a food nothing uses", async ({
  page,
  request,
  consoleErrors,
}) => {
  await state(request);

  await openTracker(page);
  await openView(page, "Foods");

  await page.getByTestId("new-food").click();
  await page.getByTestId("food-name").fill("Temporary food");
  await page.getByTestId("save-food").click();

  await page.getByRole("button", { name: "Delete Temporary food" }).click();
  await page.getByTestId("confirm-delete").click();

  await expect(
    page.getByTestId("foods-view").getByText("Temporary food"),
  ).toHaveCount(0);
  expectQuiet(consoleErrors);
});

test("deletes a meal nothing logs", async ({
  page,
  request,
  consoleErrors,
}) => {
  await state(request);

  await openTracker(page);
  await openView(page, "Meals");

  await page.getByTestId("new-meal").click();
  await page.getByTestId("meal-name").fill("Temporary meal");
  await page.getByTestId("save-meal").click();

  await page.getByRole("button", { name: "Delete Temporary meal" }).click();
  await page.getByTestId("confirm-delete").click();

  await expect(
    page.getByTestId("meals-view").getByText("Temporary meal"),
  ).toHaveCount(0);
  expectQuiet(consoleErrors);
});

test("refuses to delete a food that meals still use, and names them", async ({
  page,
  request,
  consoleErrors,
}) => {
  const { store } = await state(request);
  // A food some meal uses, whichever the sample happens to hold.
  const used = store.foods.find((food) =>
    store.meals.some((meal) =>
      meal.ingredients.some((item) => item.foodId === food.id),
    ),
  )!;
  const meals = store.meals.filter((meal) =>
    meal.ingredients.some((item) => item.foodId === used.id),
  );

  await openTracker(page);
  await openView(page, "Foods");

  await page.getByRole("button", { name: `Delete ${used.name}` }).click();
  await page.getByTestId("confirm-delete").click();

  const refusal = page.getByTestId("delete-problem");
  await expect(refusal).toContainText("cannot be deleted");
  for (const meal of meals) {
    await expect(refusal).toContainText(meal.name);
  }
  await expect(page.getByTestId("confirm-delete")).toHaveCount(0);

  // The food is still there, and the dialog closes.
  await page.getByTestId("close-after-problem").click();
  await expect(
    page.getByRole("button", { name: `Delete ${used.name}` }),
  ).toBeVisible();

  // The 409 is the point of this test: the browser logs it as a console error like any other 4xx.
  expectQuietApartFrom(consoleErrors, ["409"]);
});

test("refuses to delete a meal that a day logs, and names the day", async ({
  page,
  request,
  consoleErrors,
}) => {
  const { store, open } = await state(request);
  const logged = store.meals.find((meal) =>
    SECTIONS.some((section) =>
      open.sections[section].some(
        (entry) => entry.kind === "meal" && entry.mealId === meal.id,
      ),
    ),
  )!;

  await openTracker(page);
  await openView(page, "Meals");

  await page.getByRole("button", { name: `Delete ${logged.name}` }).click();
  await page.getByTestId("confirm-delete").click();

  const refusal = page.getByTestId("delete-problem");
  await expect(refusal).toContainText("cannot be deleted");
  await expect(refusal).toContainText(dayLabel(open.date, open.date));
  await expect(page.getByTestId("confirm-delete")).toHaveCount(0);

  expectQuietApartFrom(consoleErrors, ["409"]);
});

test("opens the dialog as an opaque Bootstrap modal", async ({
  page,
  request,
  consoleErrors,
}) => {
  await state(request);
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

  // The same defect, in the other variable Bootstrap only defines on .modal: --bs-modal-padding. Without
  // it the body's padding is zero and every dialog's content sits hard against its edge, which no test
  // noticed until a screenshot did.
  const padding = await dialog
    .locator(".modal-body")
    .evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft));
  expect(padding).toBeGreaterThanOrEqual(16);

  expectQuiet(consoleErrors);
});

test("lays out on a phone viewport without horizontal overflow", async ({
  page,
  request,
  consoleErrors,
}) => {
  await state(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await openTracker(page);

  await expect(page.getByTestId("day-total-calories")).toBeVisible();
  for (const section of SECTIONS as readonly Section[]) {
    await expect(page.getByTestId(`section-${section}`)).toBeVisible();
  }

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  expectQuiet(consoleErrors);
});

test.describe("the sign-in gate", () => {
  test("asks for credentials when nobody is signed in", async ({
    page,
    consoleErrors,
  }) => {
    await page.goto("/");

    await expect(page.getByTestId("sign-in")).toBeVisible();
    await expect(page.getByTestId("day-total-calories")).toHaveCount(0);

    expectQuiet(consoleErrors);
  });

  test("refuses the wrong password, says so, and stays put", async ({
    page,
    consoleErrors,
  }) => {
    await page.goto("/");
    await page.getByLabel("Username").fill("user");
    await page.getByLabel("Password").fill("wrong");
    await page.getByTestId("sign-in-submit").click();

    // Scoped to the panel: Next.js ships its own role="alert" route announcer.
    await expect(page.getByTestId("sign-in").getByRole("alert")).toContainText(
      "did not match",
    );
    await expect(page.getByTestId("day-total-calories")).toHaveCount(0);

    expectQuiet(consoleErrors);
  });

  test("signs in and then logs out, back to the sign-in screen", async ({
    page,
    request,
    consoleErrors,
  }) => {
    await state(request);
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

  test("registers an account through the screen, waits for approval, and then starts with nothing", async ({
    page,
    consoleErrors,
  }) => {
    // R24 and Part 14 end to end: the real stack, a new account that cannot be used until it is approved, and then a log
    // of its own - empty, rather than the seeded one with someone else's name on it (R25).
    const name = `newcomer-${Date.now()}`;
    const password = "a-long-enough-password";

    await page.goto("/");
    await page.getByTestId("show-register").click();
    await expect(page.getByTestId("register")).toBeVisible();

    await page.getByLabel("Username").fill(name);
    await page.getByLabel("Email").fill(`${name}@example.com`);
    await page.getByLabel(/^Password/).fill(password);
    await page.getByTestId("sign-in-submit").click();

    // not signed in: it says it is waiting, and offers the way back
    await expect(page.getByTestId("waiting-for-approval")).toContainText(name);
    await expect(page.getByTestId("signed-in-as")).toHaveCount(0);

    // and the right password is refused, in the server's words, until the admin approves it
    await page.getByTestId("back-to-sign-in").click();
    await page.getByLabel("Username").fill(name);
    await page.getByLabel(/^Password/).fill(password);
    await page.getByTestId("sign-in-submit").click();
    await expect(page.getByTestId("sign-in").getByRole("alert")).toHaveText(
      "Your account is waiting for approval.",
    );
    await expect(page.getByTestId("signed-in-as")).toHaveCount(0);

    // the admin approves it, from the machine
    expect(approve(name)).toContain(`approved '${name}'`);

    await page.getByLabel(/^Password/).fill(password);
    await page.getByTestId("sign-in-submit").click();

    // in, as the new account, on an empty day
    await expect(page.getByTestId("signed-in-as")).toHaveText(name);
    await expect(page.getByTestId("day-total-calories")).toHaveText("0");

    // and the seeded log is still not theirs
    const foods = await page.request.get("/api/foods");
    expect(foods.status()).toBe(200);
    expect(await foods.json()).toEqual([]);

    // the two refusals above are 403s the browser logs, which is what this test is about
    expectQuietApartFrom(consoleErrors, ["403"]);
  });

  test("a registration that is refused says which field, and stays on the form", async ({
    page,
    consoleErrors,
  }) => {
    const name = `taken-${Date.now()}`;

    // register it once, for real
    await page.goto("/");
    await page.getByTestId("show-register").click();
    await page.getByLabel("Username").fill(name);
    await page.getByLabel("Email").fill(`${name}@example.com`);
    await page.getByLabel(/^Password/).fill("a-long-enough-password");
    await page.getByTestId("sign-in-submit").click();
    await expect(page.getByTestId("waiting-for-approval")).toContainText(name);

    // then try to take it again
    await page.getByTestId("back-to-sign-in").click();
    await expect(page.getByTestId("sign-in")).toBeVisible();
    await page.getByTestId("show-register").click();
    await page.getByLabel("Username").fill(name);
    await page.getByLabel("Email").fill(`other-${name}@example.com`);
    await page.getByLabel(/^Password/).fill("a-long-enough-password");
    await page.getByTestId("sign-in-submit").click();

    // the server's sentence names the field, and the form is still there to fix it in
    await expect(page.getByTestId("register").getByRole("alert")).toContainText(
      "username",
    );
    await expect(page.getByTestId("register").getByRole("alert")).toContainText(
      "already registered",
    );
    await expect(page.getByTestId("day-total-calories")).toHaveCount(0);

    // The 409 is the point of this test: the browser logs it as a console error like any other 4xx.
    expectQuietApartFrom(consoleErrors, ["409"]);
  });
});

test("shows a pairing code for linking a Telegram chat", async ({
  page,
  consoleErrors,
}) => {
  // The e2e stack has no bot, so the flow stops where the person would switch to Telegram. What can be
  // checked here is the half the app owns: a real code from the real server, in the alphabet people can
  // read, with the exact line to send - and that asking for one did not link anything.
  await openTracker(page);

  await page.getByTestId("open-telegram").click();
  await expect(page.getByRole("dialog", { name: "Telegram" })).toBeVisible();
  await expect(page.getByTestId("telegram-get-code")).toBeVisible();

  await page.getByTestId("telegram-get-code").click();

  const code = (await page.getByTestId("telegram-code").textContent()) ?? "";
  expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  await expect(page.getByTestId("telegram-bind-line")).toHaveText(
    `/bind ${code}`,
  );
  await expect(page.getByTestId("telegram-expiry")).toContainText("minutes");

  // a second code replaces the first, because two live codes would be two chances to bind
  await page.getByTestId("telegram-new-code").click();
  await expect(page.getByTestId("telegram-code")).not.toHaveText(code);

  const link = await page.request.get("/api/telegram/link");
  expect(await link.json()).toEqual({ telegram_id: null });

  await page.getByTestId("close-dialog").click();
  await expect(page.getByTestId("telegram-dialog")).toHaveCount(0);

  expectQuiet(consoleErrors);
});

test("a new food that is really an old one is caught before it is created", async ({
  page,
  request,
  consoleErrors,
}) => {
  // The seeded list has "Greek yogurt, plain 0%". Typing the short name must offer it rather than
  // let a second copy be made - checked against the real server's list, and by counting what it holds.
  const before = (await state(request)).store.foods.length;
  await openTracker(page);

  await page.getByRole("button", { name: "Foods", exact: true }).click();
  await page.getByTestId("new-food").click();
  await page.getByTestId("food-name").fill("greek yogurt");

  await expect(page.getByTestId("similar-heading")).toHaveText(
    "Already in your list:",
  );
  const offered = page.getByRole("button", {
    name: "Edit Greek yogurt, plain 0% instead",
  });
  await expect(offered).toBeVisible();

  await offered.click();

  await expect(page.getByRole("dialog", { name: "Edit food" })).toBeVisible();
  await expect(page.getByTestId("food-name")).toHaveValue(
    "Greek yogurt, plain 0%",
  );
  await page.getByRole("button", { name: "Cancel" }).click();

  expect((await state(request)).store.foods).toHaveLength(before);

  expectQuiet(consoleErrors);
});

test("looking a food up says so plainly when lookup is not set up", async ({
  page,
  consoleErrors,
}) => {
  // The suite's stack has no USDA key on purpose, so this is the deterministic half: the button is
  // there, it asks the real server, and the person is told the truth rather than shown a dead end.
  await openTracker(page);

  await page.getByRole("button", { name: "Foods", exact: true }).click();
  await page.getByTestId("new-food").click();
  await expect(page.getByTestId("lookup-food")).toBeDisabled();

  await page.getByTestId("food-name").fill("tempeh");
  await page.getByTestId("lookup-food").click();

  await expect(page.getByTestId("lookup-problem")).toHaveText(
    "food lookup is not configured",
  );
  // and the form is still a working form
  await expect(page.getByTestId("save-food")).toBeEnabled();

  // the browser logs the 503 as a console error; it is the point of the test
  expectQuietApartFrom(consoleErrors, ["503"]);
});

test("adding a food to a day that is not in the list says plainly when lookup is not set up", async ({
  page,
  consoleErrors,
}) => {
  await openTracker(page);

  await page.getByRole("button", { name: "Add food to Lunch" }).click();
  await page.getByTestId("open-lookup").click();
  await expect(
    page.getByRole("dialog", { name: "Look up a food for Lunch" }),
  ).toBeVisible();
  await expect(page.getByTestId("lookup-go")).toBeDisabled();

  await page.getByTestId("lookup-name").fill("tempeh");
  await page.getByTestId("lookup-go").click();

  await expect(page.getByTestId("lookup-problem")).toHaveText(
    "food lookup is not configured",
  );
  await expect(page.getByTestId("confirm-lookup-add")).toBeDisabled();

  // nothing was written: the day and the list are as they were
  await page.getByRole("button", { name: "Close" }).first().click();
  const foods = await (await page.request.get("/api/foods")).json();
  expect(foods.some((food: { name: string }) => food.name === "Tempeh")).toBe(
    false,
  );

  expectQuietApartFrom(consoleErrors, ["503"]);
});

// --- a profile, and the targets worked out from it (Part 12) ------------------------------------
//
// These run against the real backend, so the arithmetic on screen is the server's own. The person is
// invented and the date of birth is worked out from today so that they are 40 for the next six months,
// which keeps example A's figures (2,150 kcal, 130 g) true on any day the suite runs. Each test removes
// what it saved, because the database is shared.

/** A date that makes someone 40 now and for about the next half year. */
function bornForty(): string {
  const born = new Date();
  born.setFullYear(born.getFullYear() - 40);
  born.setMonth(born.getMonth() - 6);
  return born.toISOString().slice(0, 10);
}

/** Example A in docs/PLAN.md, as the API takes it. Nobody real (R51). */
function inventedProfile() {
  return {
    display_name: "Ana Example",
    sex: "male",
    birth_date: bornForty(),
    height_cm: 178,
    weight_kg: 82,
    activity: "moderate",
    goal: "lose",
    units: "metric",
  };
}

async function fillProfile(page: Page) {
  await page.getByTestId("profile-name").fill("Ana Example");
  await page.getByTestId("profile-sex").selectOption("male");
  await page.getByTestId("profile-birth").fill(bornForty());
  await page.getByTestId("profile-height-cm").fill("178");
  await page.getByTestId("profile-weight").fill("82");
  await page.getByTestId("profile-activity").selectOption("moderate");
  await page.getByTestId("profile-goal").selectOption("lose");
}

test("an account with no profile sees the standard targets and an offer to set one up", async ({
  page,
  consoleErrors,
}) => {
  await openTracker(page, { profile: false });

  await expect(page.getByTestId("day-target-calories")).toHaveText("2,200");
  await expect(page.getByTestId("macro-protein-target")).toHaveText("140");
  await expect(page.getByTestId("macro-carbs-target")).toHaveText("250");
  await expect(page.getByTestId("profile-prompt")).toContainText(
    "standard targets",
  );

  expectQuiet(consoleErrors);
});

test("sets up a profile, and the Day view takes the server's own figures", async ({
  page,
  consoleErrors,
}) => {
  await openTracker(page, { profile: false });

  await page.getByTestId("open-profile").click();
  await expect(page.getByRole("dialog", { name: "Profile" })).toBeVisible();
  await expect(page.getByTestId("profile-estimate-note")).toContainText(
    "estimates",
  );

  await fillProfile(page);
  await page.getByTestId("save-profile").click();

  // example A in docs/PLAN.md, worked out by the real backend
  await expect(page.getByTestId("profile-in-force")).toHaveText(
    /2,150 kcal and 130 g protein/,
  );
  await expect(page.getByTestId("working-resting")).toContainText(
    "age 40: 1,737.5 kcal",
  );
  await expect(page.getByTestId("working-need")).toContainText("Times 1.55");
  await expect(page.getByTestId("working-goal")).toContainText(
    "Minus 20% to lose fat: 2,154.5 kcal",
  );

  await page.getByTestId("close-dialog").click();
  await expect(page.getByTestId("day-target-calories")).toHaveText("2,150");
  await expect(page.getByTestId("macro-protein-target")).toHaveText("130");
  await expect(page.getByTestId("macro-carbs-target")).toHaveCount(0);
  await expect(page.getByTestId("day-basis")).toContainText(
    "From your profile (82 kg, set",
  );

  // it is the server's, so it is still there after a reload
  await page.reload();
  await expect(page.getByTestId("day-target-calories")).toHaveText("2,150");

  // put the account back as it was found
  await page.request.delete("/api/profile");
  expectQuiet(consoleErrors);
});

test("a figure typed in pounds is stored in kilograms and shown back in pounds", async ({
  page,
  consoleErrors,
}) => {
  await openTracker(page, { profile: false });
  await page.getByTestId("open-profile").click();

  await page.getByTestId("profile-units").selectOption("imperial");
  await page.getByTestId("profile-name").fill("Ana Example");
  await page.getByTestId("profile-birth").fill(bornForty());
  await page.getByTestId("profile-height-ft").fill("5");
  await page.getByTestId("profile-height-in").fill("9");
  await page.getByTestId("profile-weight").fill("165");
  await page.getByTestId("save-profile").click();
  await expect(page.getByTestId("profile-saved")).toBeVisible();

  // what the server holds is metric, whatever the form showed
  const stored = await (await page.request.get("/api/profile")).json();
  expect(stored.profile.units).toBe("imperial");
  expect(stored.profile.weight_kg).toBeCloseTo(74.84, 2);
  expect(stored.profile.height_cm).toBeCloseTo(175.26, 2);

  // and the Day view says it in the units chosen
  await page.getByTestId("close-dialog").click();
  await expect(page.getByTestId("day-basis")).toContainText("165 lb");

  // opening it and saving again without touching the weight is not a new weigh-in
  const before = stored.profile.weight_on;
  await page.getByTestId("open-profile").click();
  await expect(page.getByTestId("profile-weight")).toHaveValue("165");
  await page.getByTestId("save-profile").click();
  await expect(page.getByTestId("profile-saved")).toBeVisible();
  const after = await (await page.request.get("/api/profile")).json();
  expect(after.profile.weight_kg).toBe(stored.profile.weight_kg);
  expect(after.profile.weight_on).toBe(before);

  await page.request.delete("/api/profile");
  expectQuiet(consoleErrors);
});

test("a refused profile says which field, and nothing is saved", async ({
  page,
  consoleErrors,
}) => {
  await openTracker(page, { profile: false });
  await page.getByTestId("open-profile").click();
  await fillProfile(page);
  await page.getByTestId("profile-height-cm").fill("5");

  await page.getByTestId("save-profile").click();

  await expect(page.getByTestId("profile-problem")).toContainText(
    "Height (cm):",
  );
  await expect(page.getByTestId("profile-saved")).toHaveCount(0);
  const answer = await (await page.request.get("/api/profile")).json();
  expect(answer).toEqual({ profile: null, targets: null });
  await expect(page.getByTestId("day-target-calories")).toHaveText("2,200");

  // the browser logs the 422 as a console error; it is the point of the test
  expectQuietApartFrom(consoleErrors, ["422"]);
});

test("the person's own calorie target wins, and the dialog says what the calculation gave", async ({
  page,
  consoleErrors,
}) => {
  await openTracker(page, { profile: false });
  await page.getByTestId("open-profile").click();
  await fillProfile(page);
  await page.getByTestId("profile-kcal-own").fill("2300");

  await page.getByTestId("save-profile").click();

  await expect(page.getByTestId("working-calories-own")).toContainText(
    "your own calorie target of 2,300 kcal; the calculation gave 2,150",
  );
  await page.getByTestId("close-dialog").click();
  await expect(page.getByTestId("day-target-calories")).toHaveText("2,300");
  await expect(page.getByTestId("day-basis")).toContainText(
    "Calories: your own",
  );

  await page.request.delete("/api/profile");
  expectQuiet(consoleErrors);
});

test("removing the profile puts the standard targets back", async ({
  page,
  consoleErrors,
}) => {
  await openTracker(page, { profile: false });
  await page.getByTestId("open-profile").click();
  await fillProfile(page);
  await page.getByTestId("save-profile").click();
  await expect(page.getByTestId("profile-saved")).toBeVisible();

  await page.getByTestId("profile-remove").click();
  await page.getByTestId("profile-remove-yes").click();

  await expect(page.getByTestId("profile-dialog")).toHaveCount(0);
  await expect(page.getByTestId("day-target-calories")).toHaveText("2,200");
  await expect(page.getByTestId("profile-prompt")).toBeVisible();
  expect(await (await page.request.get("/api/profile")).json()).toEqual({
    profile: null,
    targets: null,
  });

  expectQuiet(consoleErrors);
});

// --- Part 12, R54: a profile comes before adding anything -----------------------------------------

test("with no profile nothing can be added, and setting one up is the way through to a first logged meal", async ({
  page,
  request,
  consoleErrors,
}) => {
  await openTracker(page, { profile: false });
  const { open } = await state(request);
  const before = new Set(
    SECTIONS.flatMap((section) =>
      open.sections[section].map((entry) => entry.id),
    ),
  );

  // the server refuses all three creates, in its own words, and nothing is written
  const foods = (await (await page.request.get("/api/foods")).json()) as Food[];
  const refused = await Promise.all([
    page.request.post("/api/foods", {
      data: {
        name: "R54 food",
        unit: "cup",
        calories: 1,
        protein: 1,
        carbs: 1,
        fat: 1,
      },
    }),
    page.request.post("/api/meals", {
      data: {
        name: "R54 meal",
        ingredients: [{ food_id: foods[0].id, quantity: 1 }],
      },
    }),
    page.request.post(`/api/days/${open.date}/entries`, {
      data: { section: "lunch", food_id: foods[0].id, quantity: 1 },
    }),
  ]);
  expect(refused.map((response) => response.status())).toEqual([409, 409, 409]);
  expect((await refused[0].json()).detail).toBe(
    "set up your profile before adding anything",
  );
  expect(
    ((await (await page.request.get("/api/foods")).json()) as Food[]).length,
  ).toBe(foods.length);

  // the screen says so before anyone fills anything in, and will not add
  await page.getByRole("button", { name: "Add food to Lunch" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add food to Lunch" });
  await addDialog.getByText("Rolled oats, dry").click();
  await expect(page.getByTestId("need-profile")).toContainText(
    "A profile comes first",
  );
  await expect(page.getByTestId("confirm-add-food")).toBeDisabled();

  // the link: this dialog closes, the profile one opens, and saving it opens the gate
  await page.getByTestId("need-profile-open").click();
  await expect(addDialog).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Profile" })).toBeVisible();
  await fillProfile(page);
  await page.getByTestId("save-profile").click();
  await expect(page.getByTestId("profile-in-force")).toHaveText(
    /2,150 kcal and 130 g protein/,
  );
  await page.getByTestId("close-dialog").click();

  // and now the same thing works, through to the server
  await page.getByRole("button", { name: "Add food to Lunch" }).click();
  await page
    .getByRole("dialog", { name: "Add food to Lunch" })
    .getByText("Rolled oats, dry")
    .click();
  await expect(page.getByTestId("need-profile")).toHaveCount(0);
  await page.getByTestId("confirm-add-food").click();
  await expect(page.getByTestId("section-lunch")).toContainText(
    "Rolled oats, dry",
  );

  const after = (await (
    await page.request.get(`/api/days/${open.date}`)
  ).json()) as Omit<Day, "id">;
  const added = SECTIONS.flatMap((section) => after.sections[section]).filter(
    (entry) => !before.has(entry.id),
  );
  expect(added).toHaveLength(1);

  // put it back as it was found: the entry, and the profile
  await removeEntries(request, open.date, (entry) => !before.has(entry.id));
  await page.request.delete("/api/profile");
  expectQuiet(consoleErrors);
});

// --- The quantity box: typing 183 must give 183 -------------------------------------------------

test("typing 183 into the quantity of a gram food logs 183 g, and an impossible amount is explained, not changed", async ({
  page,
  request,
  consoleErrors,
}) => {
  await openTracker(page);
  const created = await page.request.post("/api/foods", {
    data: {
      name: "E2E quantity yogurt",
      unit: "g",
      calories: 0.61,
      protein: 0.1,
      carbs: 0.047,
      fat: 0.0033,
    },
  });
  expect(created.status()).toBe(201);
  const food = (await created.json()) as Food;

  const { open } = await state(request);
  const before = new Set(
    SECTIONS.flatMap((section) =>
      open.sections[section].map((entry) => entry.id),
    ),
  );
  await page.reload();
  await expect(page.getByTestId("day-total-calories")).toBeVisible();

  await page.getByRole("button", { name: "Add food to Lunch" }).click();
  await page.getByTestId(`food-${food.id}`).click();
  const quantity = page.getByLabel("Quantity", { exact: true });
  await expect(quantity).toHaveValue("100"); // a gram food starts at a sensible amount, not at 1 g

  // real keystrokes, the way the bug was met: clear the box, then type
  await quantity.clear();
  await quantity.pressSequentially("183");
  await expect(quantity).toHaveValue("183");
  await expect(page.getByTestId("quantity-problem")).toHaveCount(0);
  await expect(page.getByTestId("food-preview")).toContainText("112 kcal");

  // an amount that cannot be right is said to be, and left as typed
  await quantity.clear();
  await quantity.pressSequentially("99999");
  await expect(quantity).toHaveValue("99999");
  await expect(page.getByTestId("quantity-problem")).toContainText(
    "1 g to 5000 g",
  );
  await expect(page.getByTestId("confirm-add-food")).toBeDisabled();
  if (process.env.QTY_SHOT)
    await page.getByRole("dialog").screenshot({ path: process.env.QTY_SHOT });

  await quantity.clear();
  await quantity.pressSequentially("183");
  await page.getByTestId("confirm-add-food").click();
  await expect(page.getByTestId("section-lunch")).toContainText(
    "E2E quantity yogurt",
  );

  // and the server holds 183, not a clamped or rounded stand-in
  const after = (await (
    await page.request.get(`/api/days/${open.date}`)
  ).json()) as Omit<Day, "id">;
  const added = SECTIONS.flatMap((section) => after.sections[section]).filter(
    (entry) => !before.has(entry.id),
  );
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({
    kind: "food",
    foodId: food.id,
    quantity: 183,
  });

  await removeEntries(request, open.date, (entry) => !before.has(entry.id));
  await deleteFoodNamed(request, "E2E quantity yogurt");
  await page.request.delete("/api/profile");
  expectQuiet(consoleErrors);
});
