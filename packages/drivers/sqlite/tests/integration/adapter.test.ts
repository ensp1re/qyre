/**
 * Integration tests for {@link SqliteAdapter} against a real SQLite file.
 *
 * Unlike @qyre/postgres's integration tests, these need no external service or env var - SQLite is
 * just a local file, created fresh per test run. This is a real, product-relevant difference worth
 * proving, not just asserting: no QYRE_TEST_DATABASE_URL, no Postgres container, no CI service.
 */
import { chmodSync, copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SqliteAdapter } from "../../src/index.js";

describe("SqliteAdapter integration", () => {
  let adapter: SqliteAdapter;
  let dbPath: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "qyre-sqlite-"));
    dbPath = join(dir, "fixture.db");

    const setup = new Database(dbPath);
    setup.exec(`
      CREATE TABLE qyre_demo_users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_qyre_demo_users_email ON qyre_demo_users(email);
      CREATE TABLE qyre_demo_empty (id INTEGER PRIMARY KEY, note TEXT);
      CREATE TABLE qyre_demo_composite (a INTEGER, b INTEGER, PRIMARY KEY (a, b));
      CREATE TABLE qyre_demo_orders (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES qyre_demo_users(id),
        total REAL NOT NULL
      );
      INSERT INTO qyre_demo_users (name, email) VALUES
        ('Ada Lovelace', 'ada@example.com'),
        ('Alan Turing', 'alan@example.com'),
        ('Grace Hopper', 'grace@example.com');
    `);
    setup.close();

    adapter = new SqliteAdapter({ engine: "sqlite", raw: dbPath });
    await adapter.connect();
  });

  afterAll(async () => {
    await adapter?.disconnect();
  });

  it("pings successfully", async () => {
    expect(await adapter.ping()).toBe(true);
  });

  it("lists tables under a single 'main' schema, excluding sqlite's internal tables", async () => {
    const overview = await adapter.getOverview();
    expect(overview.schemas).toHaveLength(1);
    const mainSchema = overview.schemas[0];
    expect(mainSchema?.name).toBe("main");
    expect(mainSchema?.tables).toEqual(
      expect.arrayContaining(["qyre_demo_users", "qyre_demo_empty", "qyre_demo_composite"])
    );
    expect(mainSchema?.tables.some((name) => name.startsWith("sqlite_"))).toBe(false);
  });

  it("introspects columns, the primary key, a real index, and an exact row count", async () => {
    const table = await adapter.getTable("main", "qyre_demo_users");

    expect(table.columns.map((column) => column.name)).toEqual(["id", "name", "email"]);
    const idColumn = table.columns.find((column) => column.name === "id");
    expect(idColumn?.isPrimaryKey).toBe(true);
    expect(idColumn?.isForeignKey).toBe(false);
    expect(table.columns.find((column) => column.name === "name")?.nullable).toBe(false);

    const emailIndex = table.indexes?.find((index) => index.name === "idx_qyre_demo_users_email");
    expect(emailIndex).toBeDefined();
    expect(emailIndex?.unique).toBe(true);
    expect(emailIndex?.primary).toBe(false);
    expect(emailIndex?.columns).toEqual(["email"]);

    expect(table.rowCount).toBe(3);
  });

  it("reports the connected engine's name and version", async () => {
    expect(await adapter.getVersion()).toMatch(/^SQLite \d/);
  });

  it("flags a column referencing another table as a foreign key", async () => {
    const table = await adapter.getTable("main", "qyre_demo_orders");
    const userIdColumn = table.columns.find((column) => column.name === "user_id");
    expect(userIdColumn?.isForeignKey).toBe(true);
    // F061: also resolves what the FK actually references, not just that it is one.
    expect(userIdColumn?.references).toEqual({ table: "qyre_demo_users", column: "id" });
    expect(table.columns.find((column) => column.name === "total")?.isForeignKey).toBe(false);
  });

  it("marks a composite primary key's auto-index as primary, without an integer-rowid PK needing one", async () => {
    const composite = await adapter.getTable("main", "qyre_demo_composite");
    expect(composite.columns.every((column) => column.isPrimaryKey)).toBe(true);

    const pkIndex = composite.indexes?.find((index) => index.primary);
    expect(pkIndex).toBeDefined();
    expect(pkIndex?.columns).toEqual(["a", "b"]);

    // qyre_demo_users' `id INTEGER PRIMARY KEY` is a rowid alias - SQLite creates no separate
    // index entry for it (unlike the composite case above), yet isPrimaryKey must still be true.
    const users = await adapter.getTable("main", "qyre_demo_users");
    expect(users.indexes?.some((index) => index.primary)).toBe(false);
    expect(users.columns.find((column) => column.name === "id")?.isPrimaryKey).toBe(true);
  });

  it("returns correct columns even when a table/query has zero rows", async () => {
    const table = await adapter.getTable("main", "qyre_demo_empty");
    expect(table.columns.map((column) => column.name)).toEqual(["id", "note"]);
    expect(table.rowCount).toBe(0);

    const page = await adapter.getRows("main", "qyre_demo_empty", 0, 10);
    expect(page.rows).toEqual([]);
    expect(page.columns).toEqual(["id", "note"]);
  });

  it("returns a page of rows", async () => {
    const page = await adapter.getRows("main", "qyre_demo_users", 0, 10);
    expect(page.rows).toHaveLength(3);
    expect(page.columns).toEqual(["id", "name", "email"]);
  });

  it("runs a read-only query", async () => {
    const result = await adapter.runReadOnlyQuery("SELECT * FROM qyre_demo_users");
    expect(result.rows).toHaveLength(3);
  });

  it("rejects a mutating query before it ever reaches the database", async () => {
    await expect(adapter.runReadOnlyQuery("DELETE FROM qyre_demo_users")).rejects.toThrow();

    const after = await adapter.getRows("main", "qyre_demo_users", 0, 10);
    expect(after.rows).toHaveLength(3);
  });

  it("SQLite's own query_only pragma refuses a write, independent of assertReadOnly (F094)", () => {
    // Unlike Postgres, SQLite has no writable-CTE or stored-procedure equivalent that could hide a
    // write behind a leading SELECT/WITH keyword - assertReadOnly's strict allowlist (only SELECT,
    // WITH, EXPLAIN, SHOW, TABLE, VALUES may lead a statement) already has no known bypass here. So
    // this test proves the real safety property directly, bypassing assertReadOnly entirely: since
    // F094 stopped connect() forcing every connection permanently read-only, runReadOnlyQuery's
    // actual backstop is now toggling `PRAGMA query_only` around the query (see adapter.ts), not the
    // connection's open mode - reproduce that toggle on a fresh, writable-opened handle directly.
    const directHandle = new Database(dbPath, { fileMustExist: true });
    try {
      directHandle.pragma("query_only = 1");
      expect(() => directHandle.exec("DELETE FROM qyre_demo_users")).toThrow(/readonly database/);
    } finally {
      directHandle.close();
    }
  });

  it("reports full writability and permissions for a normal writable fixture (F094)", async () => {
    await expect(adapter.getCapabilities()).resolves.toEqual({
      supportsSql: true,
      supportsRowMutations: true,
      supportsDdl: true,
      supportsIndexManagement: true,
      supportsDatabaseManagement: false,
      supportsTransactions: true,
      readOnlyReason: null
    });

    await expect(adapter.getTable("main", "qyre_demo_users")).resolves.toMatchObject({
      permissions: { select: true, insert: true, update: true, delete: true }
    });

    const tables = await adapter.getAllTables();
    expect(tables.find((table) => table.name === "qyre_demo_users")?.permissions).toEqual({
      select: true,
      insert: true,
      update: true,
      delete: true
    });
  });

  it("reports read-only capabilities and permissions for a chmod-read-only file copy (F094)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qyre-sqlite-readonly-"));
    const readOnlyPath = join(dir, "readonly.db");
    copyFileSync(dbPath, readOnlyPath);
    chmodSync(readOnlyPath, 0o444);

    const readOnlyAdapter = new SqliteAdapter({ engine: "sqlite", raw: readOnlyPath });
    try {
      await readOnlyAdapter.connect();
      await expect(readOnlyAdapter.getCapabilities()).resolves.toEqual({
        supportsSql: true,
        supportsRowMutations: false,
        supportsDdl: false,
        supportsIndexManagement: false,
        supportsDatabaseManagement: false,
        supportsTransactions: false,
        readOnlyReason: "connection"
      });
      await expect(readOnlyAdapter.getTable("main", "qyre_demo_users")).resolves.toMatchObject({
        permissions: { select: true, insert: false, update: false, delete: false }
      });
    } finally {
      await readOnlyAdapter.disconnect();
      chmodSync(readOnlyPath, 0o644);
    }
  });

  it("reports read-only capabilities for a file inside a read-only directory (F094)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qyre-sqlite-rodir-"));
    const nestedPath = join(dir, "nested.db");
    copyFileSync(dbPath, nestedPath);
    chmodSync(dir, 0o555);

    const roDirAdapter = new SqliteAdapter({ engine: "sqlite", raw: nestedPath });
    try {
      await roDirAdapter.connect();
      await expect(roDirAdapter.getCapabilities()).resolves.toMatchObject({
        supportsRowMutations: false,
        readOnlyReason: "connection"
      });
    } finally {
      await roDirAdapter.disconnect();
      chmodSync(dir, 0o755);
    }
  });
});
