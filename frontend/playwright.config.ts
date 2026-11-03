import { defineConfig, devices } from "@playwright/test";

/**
 * The browser tests run against the real container, on a port of their own and in a compose project
 * of their own.
 *
 * They have to: the suite writes to a real database now, so two things follow. It must start from a
 * *freshly seeded* one every time - the seed's dates are relative to when it ran, so "today" is only
 * the day the app opens on if nothing has aged - and it must not write into the database a developer
 * is using. A separate project name gives it a separate volume, and `down -v` at the start of each
 * run throws that volume away.
 */
const PORT = Number(process.env.NUTRITION_PORT ?? 8100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // One worker, because the tests share one database: they read its state and some of them write to
  // it, so running them concurrently would let one test's write race another's read. This is also
  // what made the suite flaky before the frontend was API-backed - a different test timing out on
  // first render in each run - and one worker removes that too.
  workers: 1,
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // The first render now waits for the API before it can show the day, so the default 5s is thin.
    actionTimeout: 10_000,
  },
  expect: { timeout: 10_000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `npm run test:e2e` takes this stack down before and after the run. It has to be the script's
    // job rather than this command's: Playwright checks the URL *before* it runs the command, so a
    // stack left behind by an earlier run would fail the run before anything could clean it up.
    // USDA_API_KEY is blanked: the compose file reads the project's .env, and the suite must never spend
    // the real key or depend on what USDA says today. With no key, lookup answers "not configured",
    // which is the deterministic thing to assert; the lookup flow itself is covered by the unit tests.
    command: `cd .. && USDA_API_KEY= NUTRITION_PORT=${PORT} docker compose -p nutrition-e2e up --build --wait`,
    url: `${BASE_URL}/api/health`,
    // Never reuse: this stack exists to be thrown away and rebuilt, which is what makes the seeded
    // starting state the suite asserts against true on every run.
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
