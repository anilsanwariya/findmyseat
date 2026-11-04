import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests. By default they start the app locally (vite dev) against the
 * Supabase project in .env. Set E2E_BASE_URL to test a deployed site instead.
 *
 *   npm run test:e2e                         public pages only
 *   E2E_OWNER_EMAIL=… E2E_OWNER_PASSWORD=… npm run test:e2e   + owner flow
 *
 * See e2e/README.md before running the owner flow: it writes to the live database.
 */
const PORT = 4173;
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
// Use a preinstalled Chromium when one is provided (e.g. PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/...).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /public\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx vite dev --host 127.0.0.1 --port ${PORT}`,
        url: `${baseURL}/manifest.webmanifest`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        // The email module refuses to load without a key; tests never send email.
        env: { LOVABLE_API_KEY: process.env.LOVABLE_API_KEY || "e2e-placeholder" },
      },
});
