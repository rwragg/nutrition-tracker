/**
 * Capture the documentation screenshots from the running app.
 *
 * Why a script rather than hand-taken images: the README and the plan both assert that the
 * screenshots are of the running app, and a claim like that decays the moment the UI changes.
 * Re-running this refreshes every image from the current build, so the claim stays true.
 *
 * Against a *seeded* stack, never the live database: the repository is public, and the live log is
 * somebody's health record. The app's own seed exists for exactly this.
 *
 * Usage — with a seeded stack already listening (see README, "Screenshots"):
 *
 *   cd frontend
 *   BASE=http://127.0.0.1:8200 node scripts/capture-screenshots.mjs
 *
 * The sign-in goes through the API rather than the form, the same way `e2e/tracker.spec.ts` does:
 * the form needs the app's session probe to have finished before it can be filled, and `isVisible`
 * does not wait, so a form-based helper races the app and sometimes skips the sign-in entirely.
 * The credentials are the seeded local ones the test suite already uses — dev-only, no secret is
 * read from the environment, and nothing here prints a password.
 */

import { chromium } from "@playwright/test";
import { mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:8200";
const OUT = resolve(process.env.OUT ?? "../docs/screenshots");
const SEED_USER = "user";
const SEED_PASSWORD = "password";

/** A desktop-shaped shot with two device pixels per CSS pixel, so text is legible when scaled. */
const VIEWPORT = { width: 1600, height: 1000 };

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  colorScheme: "light",
});
const page = await context.newPage();

const shots = [];
async function shot(name, note) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path });
  const { size } = await stat(path);
  shots.push({ name: `${name}.png`, note, bytes: size });
}

/** Wait for layout to settle: animations and the macro bars' transitions are not instant. */
const settle = () => page.waitForTimeout(600);

try {
  const signedIn = await page.request.post(`${BASE}/api/login`, {
    data: { username: SEED_USER, password: SEED_PASSWORD },
  });
  if (!signedIn.ok()) {
    throw new Error(`sign-in failed: HTTP ${signedIn.status()} — is the seeded stack running?`);
  }

  // ---- The day: what the app shows on open ----
  await page.goto(`${BASE}/`);
  await page.getByTestId("day-total-calories").waitFor();
  await settle();
  await shot("day", "The day view: sections, entries and the macro bars");

  // ---- The catalogue ----
  await page.getByRole("button", { name: "Foods", exact: true }).click();
  await page.getByTestId("new-food").waitFor();
  await settle();
  await shot("foods", "The food catalogue with its own foods and their source");

  // ---- A new food, with the duplicate caught before it is saved ----
  await page.getByTestId("new-food").click();
  await page.getByTestId("food-name").waitFor();
  await page.getByTestId("food-name").fill("Gree");
  await page.getByTestId("similar-foods").waitFor().catch(() => {});
  await settle();
  await shot("new-food", "New food: a near-duplicate already in the list is offered instead");
  await page.getByRole("button", { name: "Close" }).first().click();

  // ---- USDA: candidates for a food the catalogue does not have ----
  // Reached the way a person reaches it: from the day, adding a food that is not in the list.
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await page.getByRole("button", { name: "Add food to Lunch" }).click();
  await page.getByTestId("open-lookup").click();
  await page.getByTestId("lookup-name").waitFor();
  await page.getByTestId("lookup-name").fill("tempeh");
  await page.getByTestId("lookup-go").click();
  await page.getByTestId("lookup-results").waitFor({ timeout: 30_000 });
  await settle();
  await shot("usda-lookup", "USDA FoodData Central: candidates for a food not in the catalogue");

  // ---- Picking one: the figures arrive per 100 g and are converted to the quantity ----
  await page.locator('[data-testid^="candidate-"] button').first().click();
  await page.getByTestId("confirm-lookup-add").waitFor();
  await settle();
  await shot("usda-add", "The chosen candidate: name and figures editable before anything is written");

  await page.getByRole("button", { name: "Close" }).first().click();
  await settle();

  // ---- Meals: the saved repeatable meals ----
  await page.getByRole("button", { name: "Meals", exact: true }).click();
  await settle();
  await shot("meals", "Saved meals, each one a shortcut that logs in a single step");

  // ---- Linking a chat: the one-time code, never a password ----
  await page.getByTestId("open-telegram").click();
  await page.getByTestId("telegram-get-code").waitFor();
  await page.getByTestId("telegram-get-code").click();
  await page.getByTestId("telegram-code").waitFor();
  await settle();
  await shot("pairing", "Linking a Telegram chat: a one-time code the app mints, redeemed in the chat");

  await page.getByTestId("close-dialog").click();

  // ---- The gate ----
  await page.getByTestId("sign-out").click();
  await page.getByRole("button", { name: /sign in/i }).waitFor();
  await settle();
  await shot("sign-in", "The sign-in gate: nothing is readable until an account is signed in");

  console.log(JSON.stringify({ ok: true, base: BASE, out: OUT, shots }, null, 2));
} finally {
  await browser.close();
}
