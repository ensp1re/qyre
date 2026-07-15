import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  acquireFixtureEngineLocks,
  fixtureEngineForProject,
  type FixtureEngine
} from "@qyre/testing";
import { expect, test as base } from "@playwright/test";

const lockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../.locks");

interface FixtureIsolationOptions {
  readonly fixtureEngines: readonly FixtureEngine[] | undefined;
  readonly fixtureIsolation: void;
}

/**
 * Every E2E test holds the lock for its underlying mutable engine fixture for its complete lifetime.
 * Projects backed by the same database (for example postgres/readonly/postgres-restricted) share a
 * lock, while unrelated engines retain Playwright's normal parallelism.
 */
export const test = base.extend<FixtureIsolationOptions>({
  fixtureEngines: [undefined, { option: true }],
  fixtureIsolation: [
    async ({ fixtureEngines }, use, testInfo) => {
      const engines = fixtureEngines ?? [fixtureEngineForProject(testInfo.project.name)];
      const lock = await acquireFixtureEngineLocks(lockRoot, engines);
      try {
        await use();
      } finally {
        lock.release();
      }
    },
    { auto: true, timeout: 180_000 }
  ]
});

export { expect };
