import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { ensureSqliteFile } from "../src/fixtures/sqlite.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("ensureSqliteFile", () => {
  it("recreates a generated fixture that has an invalid SQLite format", () => {
    const directory = mkdtempSync(join(tmpdir(), "qyre-sqlite-fixture-"));
    directories.push(directory);
    const path = join(directory, "fixture.sqlite");
    writeFileSync(path, Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(64, 0xff)]));

    ensureSqliteFile(path);

    const database = new Database(path);
    expect(database.pragma("quick_check", { simple: true })).toBe("ok");
    database.close();
  });
});
