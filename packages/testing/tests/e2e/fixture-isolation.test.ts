import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireFixtureEngineLocks,
  fixtureEngineForProject
} from "../../src/e2e/fixture-isolation.js";

const directories: string[] = [];
const fastOptions = { pollIntervalMs: 5, timeoutMs: 1_000 };

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function lockRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), "qyre-e2e-lock-"));
  directories.push(directory);
  return directory;
}

describe("fixtureEngineForProject", () => {
  it.each([
    ["postgres", "postgres"],
    ["readonly", "postgres"],
    ["postgres-restricted", "postgres"],
    ["mysql", "mysql"],
    ["mysql-restricted", "mysql"],
    ["sqlite", "sqlite"],
    ["sqlite-restricted", "sqlite"],
    ["mongodb", "mongodb"],
    ["mongodb-readonly", "mongodb"]
  ] as const)("maps %s to its shared %s fixture", (project, engine) => {
    expect(fixtureEngineForProject(project)).toBe(engine);
  });

  it("rejects an unregistered project instead of sharing the wrong fixture", () => {
    expect(() => fixtureEngineForProject("unknown")).toThrow("Unknown Playwright fixture project");
  });
});

describe("acquireFixtureEngineLocks", () => {
  it("serializes contenders for the same engine", async () => {
    const root = lockRoot();
    const first = await acquireFixtureEngineLocks(root, ["postgres"], fastOptions);
    let secondAcquired = false;
    const secondPromise = acquireFixtureEngineLocks(root, ["postgres"], fastOptions).then(
      (lock) => {
        secondAcquired = true;
        return lock;
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(secondAcquired).toBe(false);

    first.release();
    const second = await secondPromise;
    expect(secondAcquired).toBe(true);
    second.release();
  });

  it("allows different engines to proceed concurrently", async () => {
    const root = lockRoot();
    const postgres = await acquireFixtureEngineLocks(root, ["postgres"], fastOptions);
    const mysql = await acquireFixtureEngineLocks(root, ["mysql"], fastOptions);

    mysql.release();
    postgres.release();
  });

  it("uses a stable order for overlapping multi-engine requests", async () => {
    const root = lockRoot();
    const firstPromise = acquireFixtureEngineLocks(root, ["postgres", "mongodb"], fastOptions);
    const secondPromise = acquireFixtureEngineLocks(root, ["mongodb", "postgres"], fastOptions);
    const first = await firstPromise;

    first.release();
    const second = await secondPromise;
    second.release();
  });

  it("reclaims a lock left by a dead worker", async () => {
    const root = lockRoot();
    const engineLock = join(root, "postgres");
    mkdirSync(engineLock);
    writeFileSync(
      join(engineLock, "owner.json"),
      JSON.stringify({ acquiredAt: Date.now(), pid: 999_999, token: "dead-worker" })
    );

    const lock = await acquireFixtureEngineLocks(root, ["postgres"], fastOptions);
    lock.release();
  });
});
