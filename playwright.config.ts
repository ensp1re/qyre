import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const sqliteFixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "e2e/.fixtures/sqlite.db"
);
const readonlySqliteFixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "e2e/.fixtures-readonly/sqlite.db"
);
// Worker processes read the SQLite fixture path from process.env.
process.env.QYRE_TEST_SQLITE_PATH = sqliteFixturePath;
process.env.QYRE_E2E_READONLY_SQLITE_PATH = readonlySqliteFixturePath;

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
