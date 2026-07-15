import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Qyre's end-to-end tests.
 *
 * - `@smoke` specs run with no database (just the built UI) and gate `pnpm test:e2e`.
 * - `@full` specs run against four live servers, one per engine (see e2e/server.ts), gated by
 *   `pnpm test:e2e:full` and matching `docs/product-specs/connect-and-inspect-sqlite.md`'s "same
 *   spec, parameterized by engine/fixture" requirement:
 *   - "postgres" project: requires QYRE_TEST_DATABASE_URL.
 *   - "sqlite" project: self-contained, no setup required - the fixture file is created on the fly.
 *   - "mysql" project: requires QYRE_TEST_MYSQL_URL (F014).
 *   - "mongodb" project: requires QYRE_TEST_MONGO_URL; SQL-only specs skip it explicitly.
 *   - F121 role-matrix-only projects add restricted Postgres/MySQL roles, a read-only SQLite file,
 *     and a forced-read-only MongoDB session. MongoDB's shared fixture has authorization disabled,
 *     so its Qyre-level override is the applicable read-only boundary.
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
const readonlySqliteFixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "e2e/.fixtures-readonly/sqlite.db"
);
// Set on process.env (not just passed via webServer's `env` below) so the "sqlite" project's test
// files - which run in Playwright's own worker processes, not the spawned webServer command - can
// also read it via requireTestSqlitePath().
process.env.QYRE_TEST_SQLITE_PATH = sqliteFixturePath;
process.env.QYRE_E2E_READONLY_SQLITE_PATH = readonlySqliteFixturePath;

export default defineConfig({
  testDir: "./e2e",
  // F144's automatic fixture lock serializes tests that share an underlying engine database, so
  // Playwright can retain cross-engine parallelism without allowing fixture resets to race.
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
    },
    {
      name: "mongodb",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4179" }
    },
    {
      name: "readonly",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4181" }
    },
    {
      name: "postgres-restricted",
      grep: /@role-matrix/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4183" }
    },
    {
      name: "mysql-restricted",
      grep: /@role-matrix/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4185" }
    },
    {
      name: "sqlite-restricted",
      grep: /@role-matrix/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4187" }
    },
    {
      name: "mongodb-readonly",
      grep: /@role-matrix/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4189" }
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
    },
    {
      command: "pnpm exec tsx e2e/server.ts",
      url: "http://localhost:4179",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        QYRE_E2E_PORT: "4179",
        QYRE_E2E_ENGINE: "mongodb"
      }
    },
    {
      // F096/F097: connects to the same fully-writable Postgres fixture as the "postgres" project
      // above, but with --read-only forced - proving the flag overrides real grants rather than
      // merely reflecting an already-restricted fixture user.
      command: "pnpm exec tsx e2e/server.ts",
      url: "http://localhost:4181",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        QYRE_E2E_PORT: "4181",
        QYRE_E2E_ENGINE: "postgres",
        QYRE_E2E_READ_ONLY: "1"
      }
    },
    {
      command: "pnpm exec tsx e2e/server.ts",
      url: "http://localhost:4183",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        QYRE_E2E_PORT: "4183",
        QYRE_E2E_ENGINE: "postgres",
        QYRE_E2E_RESTRICTED: "1"
      }
    },
    {
      command: "pnpm exec tsx e2e/server.ts",
      url: "http://localhost:4185",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        QYRE_E2E_PORT: "4185",
        QYRE_E2E_ENGINE: "mysql",
        QYRE_E2E_RESTRICTED: "1"
      }
    },
    {
      command: "pnpm exec tsx e2e/server.ts",
      url: "http://localhost:4187",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        QYRE_E2E_PORT: "4187",
        QYRE_E2E_ENGINE: "sqlite",
        QYRE_E2E_RESTRICTED: "1"
      }
    },
    {
      command: "pnpm exec tsx e2e/server.ts",
      url: "http://localhost:4189",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        QYRE_E2E_PORT: "4189",
        QYRE_E2E_ENGINE: "mongodb",
        QYRE_E2E_READ_ONLY: "1"
      }
    }
  ]
});
