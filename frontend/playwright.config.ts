import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:8000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // The app is a static export served by FastAPI, so the browser tests run against
  // the real container rather than a Next.js server. Playwright kills the compose
  // process on exit, which stops the container with it.
  //
  // reuseExistingServer locally, so a stack the developer already has running is
  // used as-is instead of colliding on the port; CI gets a clean build every time,
  // which is the run that proves the committed source rather than a warm container.
  webServer: {
    command: "cd .. && docker compose up --build --wait",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
