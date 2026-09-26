import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitBatch, insertRow } from "../../src/write/mutations.js";

describe("SQLite row inserts", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE tags (name TEXT PRIMARY KEY, hits INTEGER DEFAULT 0) WITHOUT ROWID;
      CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT DEFAULT 'empty');
    `);
  });

  afterEach(() => {
    db.close();
  });

  it("returns the inserted row from a WITHOUT ROWID table", () => {
    expect(insertRow(db, "tags", { name: "sqlite" })).toEqual({
      row: { name: "sqlite", hits: 0 }
    });
    expect(db.prepare("SELECT count(*) FROM tags").pluck().get()).toBe(1);
  });

  it("returns defaults for a rowid table insert", () => {
    expect(insertRow(db, "notes", {})).toEqual({ row: { id: 1, body: "empty" } });
  });

  it("commits a batch of inserts into a WITHOUT ROWID table", () => {
    const result = commitBatch(db, [
      { type: "insert", schema: "main", table: "tags", values: { name: "a" } },
      { type: "insert", schema: "main", table: "tags", values: { name: "b", hits: 2 } }
    ]);

    expect(result).toEqual({
      committed: true,
      results: [{ row: { name: "a", hits: 0 } }, { row: { name: "b", hits: 2 } }]
    });
    expect(db.prepare("SELECT count(*) FROM tags").pluck().get()).toBe(2);
  });
});
