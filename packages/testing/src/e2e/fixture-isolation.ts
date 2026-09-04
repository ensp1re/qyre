import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type FixtureEngine = "mongodb" | "mysql" | "postgres" | "sqlite";

export interface FixtureEngineLock {
  release(): void;
}

interface FixtureLockOwner {
  readonly acquiredAt: number;
  readonly pid: number;
  readonly token: string;
}

interface FixtureLockOptions {
  readonly orphanGraceMs?: number;
  readonly pollIntervalMs?: number;
  readonly staleAfterMs?: number;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 25;
const DEFAULT_ORPHAN_GRACE_MS = 1_000;
const DEFAULT_STALE_AFTER_MS = 10 * 60_000;
const OWNER_FILE = "owner.json";

const PROJECT_ENGINES: Readonly<Record<string, FixtureEngine>> = {
  mongodb: "mongodb",
  "mongodb-readonly": "mongodb",
  mysql: "mysql",
  "mysql-restricted": "mysql",
  postgres: "postgres",
  "postgres-restricted": "postgres",
  readonly: "postgres",
  sqlite: "sqlite",
  "sqlite-restricted": "sqlite"
};

/** Return the underlying mutable fixture shared by a Playwright project. */
export function fixtureEngineForProject(projectName: string): FixtureEngine {
  const engine = PROJECT_ENGINES[projectName];
  if (!engine) throw new Error(`Unknown Playwright fixture project: ${projectName}`);
  return engine;
}

/** Acquire fixture locks in stable order and reclaim abandoned workers. */
export async function acquireFixtureEngineLocks(
  lockRoot: string,
  engines: readonly FixtureEngine[],
  options: FixtureLockOptions = {}
): Promise<FixtureEngineLock> {
  const normalizedEngines = [...new Set(engines)].sort();
  if (normalizedEngines.length === 0) {
    throw new Error("At least one fixture engine lock is required.");
  }

  mkdirSync(lockRoot, { recursive: true });
  const locks: FixtureEngineLock[] = [];
  try {
    for (const engine of normalizedEngines) {
      locks.push(await acquireDirectoryLock(lockRoot, engine, options));
    }
  } catch (error) {
    releaseLocks(locks);
    throw error;
  }

  return {
    release(): void {
      releaseLocks(locks);
    }
  };
}

async function acquireDirectoryLock(
  lockRoot: string,
  engine: FixtureEngine,
  options: FixtureLockOptions
): Promise<FixtureEngineLock> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  const lockPath = join(lockRoot, engine);

  while (Date.now() <= deadline) {
    const owner: FixtureLockOwner = {
      acquiredAt: Date.now(),
      pid: process.pid,
      token: randomUUID()
    };

    try {
      mkdirSync(lockPath);
      writeFileSync(join(lockPath, OWNER_FILE), JSON.stringify(owner));
      return ownedLock(lockPath, owner);
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      if (clearAbandonedLock(lockPath, options)) continue;
      await delay(pollIntervalMs);
    }
  }

  throw new Error(`Timed out waiting ${timeoutMs}ms for the ${engine} E2E fixture lock.`);
}

function ownedLock(lockPath: string, owner: FixtureLockOwner): FixtureEngineLock {
  return {
    release(): void {
      try {
        const currentOwner = readOwner(lockPath);
        if (currentOwner?.token === owner.token) {
          rmSync(lockPath, { recursive: true, force: true });
        }
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
  };
}

function clearAbandonedLock(lockPath: string, options: FixtureLockOptions): boolean {
  const orphanGraceMs = options.orphanGraceMs ?? DEFAULT_ORPHAN_GRACE_MS;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  try {
    const ageMs = Date.now() - statSync(lockPath).mtimeMs;
    const owner = readOwner(lockPath);
    const abandoned =
      ageMs >= staleAfterMs || (owner ? !isProcessAlive(owner.pid) : ageMs >= orphanGraceMs);
    if (!abandoned) return false;
    rmSync(lockPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (isMissing(error)) return true;
    throw error;
  }
}

function readOwner(lockPath: string): FixtureLockOwner | undefined {
  try {
    const value = JSON.parse(
      readFileSync(join(lockPath, OWNER_FILE), "utf8")
    ) as Partial<FixtureLockOwner>;
    if (
      typeof value.acquiredAt !== "number" ||
      typeof value.pid !== "number" ||
      typeof value.token !== "string"
    ) {
      return undefined;
    }
    return value as FixtureLockOwner;
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function releaseLocks(locks: readonly FixtureEngineLock[]): void {
  for (const lock of [...locks].reverse()) lock.release();
}

function isAlreadyExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "EEXIST";
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
