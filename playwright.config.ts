import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { E2E_PROJECTS } from "./e2e/support/project-config.js";

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
  projects: E2E_PROJECTS.map((project) => ({
    name: project.name,
    ...(project.testScope === "role-matrix" ? { grep: /@role-matrix/ } : {}),
    use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${project.port}` }
  })),
  webServer: E2E_PROJECTS.map((project) => ({
    command: "pnpm exec tsx e2e/server.ts",
    url: `http://localhost:${project.port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      QYRE_E2E_PORT: String(project.port),
      QYRE_E2E_ENGINE: project.engine,
      ...(project.access === "read-only" ? { QYRE_E2E_READ_ONLY: "1" } : {}),
      ...(project.access === "restricted" ? { QYRE_E2E_RESTRICTED: "1" } : {})
    }
  }))
});
