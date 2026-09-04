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

/** Serialize tests sharing a mutable engine fixture. */
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
