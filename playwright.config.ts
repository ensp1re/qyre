import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Qyre's end-to-end tests.
 *
 * - `@smoke` specs run with no database (just the built UI) and gate `pnpm test:e2e`.
 * - `@full` specs run against three live servers, one per engine (see e2e/server.ts), gated by
 *   `pnpm test:e2e:full` and matching `docs/product-specs/connect-and-inspect-sqlite.md`'s "same
 *   spec, parameterized by engine/fixture" requirement:
 *   - "postgres" project: requires QYRE_TEST_DATABASE_URL.
 *   - "sqlite" project: self-contained, no setup required - the fixture file is created on the fly.
 *   - "mysql" project: requires QYRE_TEST_MYSQL_URL (F014).
 *   All projects run every spec (including @smoke), since @qyre/web build's built once up front
 *   by the test:e2e/test:e2e:full npm scripts, not by any webServer command, to avoid multiple
 *   `vite build` processes racing to write apps/web/dist at once.
 *
 * See docs/RELIABILITY.md.
 */
const sqliteFixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "e2e/.fixtures/sqlite.db"
);
// Set on process.env (not just passed via webServer's `env` below) so the "sqlite" project's test
// files - which run in Playwright's own worker processes, not the spawned webServer command - can
// also read it via requireTestSqlitePath().
process.env.QYRE_TEST_SQLITE_PATH = sqliteFixturePath;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "postgres",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173" }
    },
    {
      name: "sqlite",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4175" }
    },
    {
      name: "mysql",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4177" }
    }
  ],
  webServer: [
    {
      command: "pnpm exec tsx e2e/server.ts",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        QYRE_E2E_ENGINE: "postgres"
      }
    },
    {
      command: "pnpm exec tsx e2e/server.ts",
      url: "http://localhost:4175",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // QYRE_TEST_SQLITE_PATH is already on process.env (set above) and inherited automatically.
      env: {
        QYRE_E2E_PORT: "4175",
        QYRE_E2E_ENGINE: "sqlite"
      }
    },
    {
      command: "pnpm exec tsx e2e/server.ts",
      url: "http://localhost:4177",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // QYRE_TEST_MYSQL_URL is inherited from the parent shell environment, same as
      // QYRE_TEST_DATABASE_URL for the "postgres" project above.
      env: {
        QYRE_E2E_PORT: "4177",
        QYRE_E2E_ENGINE: "mysql"
      }
    }
  ]
});
