import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Humb's end-to-end tests.
 *
 * - `@smoke` specs run with no database (just the built UI) and gate `pnpm test:e2e`.
 * - `@full` specs require HUMB_TEST_DATABASE_URL and run via `pnpm test:e2e:full`.
 *
 * See docs/RELIABILITY.md.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    // Runs the real Humb server (serving both the API and the built web app on one port), not a
    // separate vite-preview process with no backend behind it - see e2e/server.ts.
    command: "pnpm --filter @humbdb/web build && pnpm exec tsx e2e/server.ts",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
