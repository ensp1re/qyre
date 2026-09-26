import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRowOrderBy } from "../../src/query/row-order.js";

describe("SQLite row order", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE composite (b INTEGER, a INTEGER, n INTEGER, PRIMARY KEY (a, b)) WITHOUT ROWID;
      CREATE TABLE keyless (n INTEGER);
      CREATE TABLE shadowed (rowid TEXT, n INTEGER);
      CREATE VIEW keyless_view AS SELECT n FROM keyless;
    `);
  });

  afterEach(() => db.close());

  it("breaks ties by the primary key in key order after the user's sort", () => {
    expect(buildRowOrderBy(db, "composite", { column: "n", direction: "desc" })).toBe(
      ' ORDER BY "n" DESC, "a" ASC, "b" ASC'
    );
    expect(buildRowOrderBy(db, "composite", { column: "a", direction: "desc" })).toBe(
      ' ORDER BY "a" DESC, "b" ASC'
    );
  });

  it("falls back to an unshadowed rowid alias for keyless tables and nothing for views", () => {
    expect(buildRowOrderBy(db, "keyless", undefined)).toBe(' ORDER BY "rowid" ASC');
    expect(buildRowOrderBy(db, "shadowed", undefined)).toBe(' ORDER BY "_rowid_" ASC');
    expect(buildRowOrderBy(db, "keyless_view", { column: "n", direction: "asc" })).toBe(
      ' ORDER BY "n" ASC'
    );
  });

  it("pages a keyless table with ties in insertion order", () => {
    const insert = db.prepare("INSERT INTO keyless (n) VALUES (?)");
    for (let index = 0; index < 12; index += 1) insert.run(index % 2);
    const order = buildRowOrderBy(db, "keyless", { column: "n", direction: "asc" });
    const ids = [0, 1, 2].flatMap((page) =>
      (
        db
          .prepare(`SELECT rowid AS id FROM keyless${order} LIMIT 4 OFFSET ?`)
          .all(page * 4) as Array<{ id: number }>
      ).map((row) => row.id)
    );
    expect(ids).toEqual([1, 3, 5, 7, 9, 11, 2, 4, 6, 8, 10, 12]);
  });
});
