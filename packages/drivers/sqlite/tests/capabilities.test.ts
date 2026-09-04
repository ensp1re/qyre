import { chmodSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeCapabilities,
  tablePermissionsFromCapabilities
} from "../src/runtime/capabilities.js";

function makeFixture(): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "qyre-sqlite-capabilities-"));
  const dbPath = join(dir, "fixture.db");
  const setup = new Database(dbPath);
  setup.exec("CREATE TABLE t (id INTEGER)");
  setup.close();
  return { dir, dbPath };
}

describe("computeCapabilities (F094)", () => {
  const openHandles: Database.Database[] = [];
  const chmoddedPaths: string[] = [];

  afterEach(() => {
    for (const handle of openHandles.splice(0)) handle.close();
    for (const path of chmoddedPaths.splice(0)) chmodSync(path, 0o755);
  });

  it("reports full writability for a normal writable file", () => {
    const { dbPath } = makeFixture();
    const db = new Database(dbPath, { fileMustExist: true });
    openHandles.push(db);

    expect(computeCapabilities(dbPath, db)).toEqual({
      supportsSql: true,
      rowExportFormats: ["csv", "json", "sql"],
      jsonExportMode: "json",
      supportsAccessInspection: true,
      supportsRowMutations: true,
      supportsDdl: true,
      supportsIndexManagement: true,
      supportsDatabaseManagement: false,
      supportsTransactions: true,
      readOnlyReason: null
    });
  });

  it("reports read-only for a chmod-read-only file", () => {
    const { dbPath } = makeFixture();
    chmodSync(dbPath, 0o444);
    chmoddedPaths.push(dbPath);
    const db = new Database(dbPath, { fileMustExist: true });
    openHandles.push(db);

    expect(computeCapabilities(dbPath, db)).toMatchObject({
      supportsRowMutations: false,
      readOnlyReason: "connection"
    });
  });

  it("reports read-only for a writable file inside a read-only directory", () => {
    const { dir, dbPath } = makeFixture();
    chmodSync(dir, 0o555);
    chmoddedPaths.push(dir);
    const db = new Database(dbPath, { fileMustExist: true });
    openHandles.push(db);

    expect(computeCapabilities(dbPath, db)).toMatchObject({
      supportsRowMutations: false,
      readOnlyReason: "connection"
    });
  });

  it("reports read-only for a connection explicitly opened read-only (a 'mode=ro' target)", () => {
    const { dbPath } = makeFixture();
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    openHandles.push(db);

    expect(computeCapabilities(dbPath, db)).toMatchObject({
      supportsRowMutations: false,
      readOnlyReason: "connection"
    });
  });

  it("reports read-only when PRAGMA query_only is on, independent of file/dir/open-mode", () => {
    const { dbPath } = makeFixture();
    const db = new Database(dbPath, { fileMustExist: true });
    openHandles.push(db);
    db.pragma("query_only = 1");

    expect(computeCapabilities(dbPath, db)).toMatchObject({
      supportsRowMutations: false,
      readOnlyReason: "connection"
    });
  });
});

describe("tablePermissionsFromCapabilities (F094)", () => {
  it("grants every mutation when the session is writable", () => {
    expect(
      tablePermissionsFromCapabilities({
        supportsSql: true,
        rowExportFormats: ["csv", "json", "sql"],
        jsonExportMode: "json",
        supportsAccessInspection: true,
        supportsRowMutations: true,
        supportsDdl: true,
        supportsIndexManagement: true,
        supportsDatabaseManagement: false,
        supportsTransactions: true,
        readOnlyReason: null
      })
    ).toEqual({ select: true, insert: true, update: true, delete: true });
  });

  it("only allows select when the session is read-only", () => {
    expect(
      tablePermissionsFromCapabilities({
        supportsSql: true,
        rowExportFormats: ["csv", "json", "sql"],
        jsonExportMode: "json",
        supportsAccessInspection: true,
        supportsRowMutations: false,
        supportsDdl: false,
        supportsIndexManagement: false,
        supportsDatabaseManagement: false,
        supportsTransactions: false,
        readOnlyReason: "connection"
      })
    ).toEqual({ select: true, insert: false, update: false, delete: false });
  });
});
