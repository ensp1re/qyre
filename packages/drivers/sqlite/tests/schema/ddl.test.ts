import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { alterColumn, renameAndAlterColumn } from "../../src/schema/ddl.js";

function tableSql(db: Database.Database, table: string): string {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(table) as {
    sql: string;
  };
  return row.sql;
}

describe("SQLite column alter rebuild", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("keeps CASCADE and SET NULL child rows when renaming and altering a parent column", () => {
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE cascade_child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id) ON DELETE CASCADE);
      CREATE TABLE set_null_child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id) ON DELETE SET NULL);
      INSERT INTO parent VALUES (1, 'one'), (2, 'two');
      INSERT INTO cascade_child VALUES (10, 1), (11, 2);
      INSERT INTO set_null_child VALUES (20, 1);
    `);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);

    renameAndAlterColumn(db, "parent", "name", {
      newName: "label",
      changes: { nullable: false }
    });

    expect(db.prepare("SELECT parent_id FROM cascade_child ORDER BY id").pluck().all()).toEqual([
      1, 2
    ]);
    expect(db.prepare("SELECT parent_id FROM set_null_child").pluck().all()).toEqual([1]);
    expect(db.prepare("SELECT label FROM parent ORDER BY id").pluck().all()).toEqual([
      "one",
      "two"
    ]);
    expect(tableSql(db, "parent")).toMatch(/"label" TEXT NOT NULL/);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });

  it("leaves foreign keys disabled when the connection had them disabled", () => {
    db.pragma("foreign_keys = OFF");
    db.exec("CREATE TABLE plain (id INTEGER PRIMARY KEY, note TEXT)");

    alterColumn(db, "plain", "note", { nullable: false });

    expect(db.pragma("foreign_keys", { simple: true })).toBe(0);
  });

  it("refuses to rebuild inside an open transaction, where foreign keys cannot be disabled", () => {
    db.exec("CREATE TABLE plain (id INTEGER PRIMARY KEY, note TEXT); BEGIN");

    expect(() => alterColumn(db, "plain", "note", { nullable: false })).toThrow(
      expect.objectContaining({ statusCode: 409 })
    );
    db.exec("ROLLBACK");
  });

  it("rolls back the rename and rebuild when the foreign key check fails", () => {
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
      INSERT INTO parent VALUES (1, 'one');
    `);
    db.pragma("foreign_keys = OFF");
    db.exec("INSERT INTO child VALUES (1, 99)");
    db.pragma("foreign_keys = ON");

    expect(() =>
      renameAndAlterColumn(db, "parent", "name", {
        newName: "label",
        changes: { dataType: "BLOB" }
      })
    ).toThrow(
      expect.objectContaining({ statusCode: 400, message: expect.stringMatching(/foreign key/) })
    );
    expect(tableSql(db, "parent")).toContain("name TEXT");
    expect(db.prepare("SELECT count(*) FROM child").pluck().get()).toBe(1);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("preserves inline UNIQUE, COLLATE and exact DEFAULT expressions", () => {
    db.exec(`
      CREATE TABLE people (
        id INTEGER PRIMARY KEY,
        email TEXT UNIQUE COLLATE NOCASE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        stamp TEXT DEFAULT (datetime('now', 'localtime')),
        score INTEGER DEFAULT -1,
        note TEXT DEFAULT NULL
      );
      INSERT INTO people (id, email) VALUES (1, 'Ada@example.com');
    `);

    alterColumn(db, "people", "note", { dataType: "BLOB" });
    alterColumn(db, "people", "email", { nullable: false });

    const defaults = Object.fromEntries(
      (db.pragma("table_info(people)") as Array<{ name: string; dflt_value: string | null }>).map(
        (row) => [row.name, row.dflt_value]
      )
    );
    expect(defaults).toEqual({
      id: null,
      email: null,
      created_at: "CURRENT_TIMESTAMP",
      stamp: "datetime('now', 'localtime')",
      score: "-1",
      note: "NULL"
    });
    expect(tableSql(db, "people")).toMatch(/email TEXT UNIQUE COLLATE NOCASE NOT NULL/);
    expect(tableSql(db, "people")).toMatch(/note BLOB DEFAULT NULL/);
    expect(() => db.exec("INSERT INTO people (id, email) VALUES (2, 'ada@EXAMPLE.com')")).toThrow(
      /UNIQUE/
    );
    const uniqueIndexes = (db.pragma("index_list(people)") as Array<{ origin: string }>).filter(
      (index) => index.origin === "u"
    );
    expect(uniqueIndexes).toHaveLength(1);
  });

  it("preserves composite and column-list-less foreign keys with their actions", () => {
    db.exec(`
      CREATE TABLE parent (a INTEGER, b INTEGER, PRIMARY KEY (a, b));
      CREATE TABLE single_parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (
        id INTEGER PRIMARY KEY,
        x INTEGER,
        y INTEGER,
        sid INTEGER REFERENCES single_parent ON DELETE SET NULL,
        note TEXT,
        FOREIGN KEY (x, y) REFERENCES parent (a, b) ON UPDATE CASCADE ON DELETE CASCADE MATCH SIMPLE
      );
      INSERT INTO parent VALUES (1, 2);
      INSERT INTO single_parent VALUES (7);
      INSERT INTO child VALUES (1, 1, 2, 7, 'n');
    `);
    const before = db.pragma("foreign_key_list(child)");

    alterColumn(db, "child", "note", { dataType: "BLOB" });

    expect(db.pragma("foreign_key_list(child)")).toEqual(before);
    db.exec("UPDATE parent SET b = 3");
    expect(db.prepare("SELECT y FROM child").pluck().get()).toBe(3);
    db.exec("DELETE FROM single_parent");
    expect(db.prepare("SELECT sid FROM child").pluck().get()).toBeNull();
  });

  it("preserves AUTOINCREMENT and its sequence high-water mark", () => {
    db.exec(`
      CREATE TABLE counters (id INTEGER PRIMARY KEY AUTOINCREMENT, note TEXT);
      INSERT INTO counters (note) VALUES ('a'), ('b'), ('c');
      DELETE FROM counters WHERE id = 3;
    `);

    alterColumn(db, "counters", "note", { nullable: false });

    expect(tableSql(db, "counters")).toContain("AUTOINCREMENT");
    db.exec("INSERT INTO counters (note) VALUES ('d')");
    expect(db.prepare("SELECT max(id) FROM counters").pluck().get()).toBe(4);
  });

  it("preserves CHECK constraints, generated columns, STRICT and WITHOUT ROWID", () => {
    db.exec(`
      CREATE TABLE items (
        sku TEXT PRIMARY KEY,
        qty INTEGER NOT NULL CHECK (qty >= 0),
        price INTEGER,
        total INTEGER GENERATED ALWAYS AS (qty * price) STORED,
        label TEXT AS (upper(sku)),
        note TEXT
      ) STRICT, WITHOUT ROWID;
      INSERT INTO items (sku, qty, price, note) VALUES ('ab', 2, 5, 'x');
    `);

    alterColumn(db, "items", "note", { nullable: false, default: "none" });

    const sql = tableSql(db, "items");
    expect(sql).toContain("CHECK (qty >= 0)");
    expect(sql).toContain("GENERATED ALWAYS AS (qty * price) STORED");
    expect(sql).toMatch(/\) STRICT, WITHOUT ROWID$/);
    expect(db.prepare("SELECT total, label, note FROM items").get()).toEqual({
      total: 10,
      label: "AB",
      note: "x"
    });
    expect(() => db.exec("INSERT INTO items (sku, qty) VALUES ('c', -1)")).toThrow(/CHECK/);
    expect(() => db.exec("INSERT INTO items (sku, qty, price) VALUES ('d', 1, 'x')")).toThrow();
  });

  it("keeps views and triggers that reference the rebuilt table working", () => {
    db.exec(`
      CREATE TABLE events (id INTEGER PRIMARY KEY, kind TEXT);
      CREATE TABLE audit (event_id INTEGER);
      CREATE VIEW event_kinds AS SELECT kind FROM events;
      CREATE TRIGGER events_audit AFTER INSERT ON events BEGIN INSERT INTO audit VALUES (new.id); END;
      INSERT INTO events (kind) VALUES ('a');
    `);

    alterColumn(db, "events", "kind", { nullable: false });

    db.exec("INSERT INTO events (kind) VALUES ('b')");
    expect(db.prepare("SELECT kind FROM event_kinds ORDER BY kind").pluck().all()).toEqual([
      "a",
      "b"
    ]);
    expect(db.prepare("SELECT count(*) FROM audit").pluck().get()).toBe(2);
  });

  it("refuses to alter a generated column with a 400 error and leaves the table unchanged", () => {
    db.exec("CREATE TABLE totals (a INTEGER, doubled INTEGER AS (a * 2))");
    const before = tableSql(db, "totals");

    let caught: unknown;
    try {
      alterColumn(db, "totals", "doubled", { nullable: false });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ statusCode: 400, message: /Generated columns/ });
    expect(tableSql(db, "totals")).toBe(before);
  });

  it("refuses to rebuild a virtual table with a 400 error", () => {
    db.exec("CREATE VIRTUAL TABLE docs USING fts5(body)");

    expect(() => alterColumn(db, "docs", "body", { nullable: false })).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("rewrites quoted identifiers, comments and constraint names faithfully", () => {
    db.exec(`
      CREATE TABLE "odd ""name""" (
        [id] INTEGER PRIMARY KEY, -- key, with comma
        \`val\` VARCHAR(10, 2) CONSTRAINT val_nn NOT NULL ON CONFLICT FAIL CONSTRAINT val_d DEFAULT 'a,b',
        /* keep ( this */ other TEXT
      );
      INSERT INTO "odd ""name""" (id, val, other) VALUES (1, 'v', 'o');
    `);

    alterColumn(db, 'odd "name"', "val", { nullable: true });

    const sql = tableSql(db, 'odd "name"');
    expect(sql).toContain("`val` VARCHAR(10, 2) CONSTRAINT val_d DEFAULT 'a,b'");
    expect(sql).toContain("-- key, with comma");
    expect(db.prepare('SELECT val, other FROM "odd ""name"""').get()).toEqual({
      val: "v",
      other: "o"
    });
    db.exec('INSERT INTO "odd ""name""" (id, val) VALUES (2, NULL)');
  });
});
