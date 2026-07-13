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

  it("inserts a row via the implicit rowid, reports it back, and it's visible via getRows (F099)", async () => {
    const result = await adapter.mutations.insertRow?.("main", "qyre_demo_users", {
      name: "Insert Test",
      email: "insert-test@example.com"
    });
    expect(result?.row).toMatchObject({ name: "Insert Test", email: "insert-test@example.com" });

    try {
      const page = await adapter.getRows("main", "qyre_demo_users", 0, 10);
      expect(page.rows.some((row) => row.email === "insert-test@example.com")).toBe(true);
    } finally {
      const cleanup = new Database(dbPath);
      cleanup.exec("DELETE FROM qyre_demo_users WHERE email = 'insert-test@example.com'");
      cleanup.close();
    }
  });

  it("rejects an insert against a chmod-read-only file copy (F099)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qyre-sqlite-readonly-insert-"));
    const readOnlyPath = join(dir, "readonly.db");
    copyFileSync(dbPath, readOnlyPath);
    chmodSync(readOnlyPath, 0o444);

    const readOnlyAdapter = new SqliteAdapter({ engine: "sqlite", raw: readOnlyPath });
    try {
      await readOnlyAdapter.connect();
      await expect(
        readOnlyAdapter.mutations.insertRow?.("main", "qyre_demo_users", {
          name: "Should Fail",
          email: "should-fail@example.com"
        })
      ).rejects.toThrow();
    } finally {
      await readOnlyAdapter.disconnect();
      chmodSync(readOnlyPath, 0o644);
    }
  });

  it("createTable/renameTable/truncateTable/dropTable roundtrip (F110)", async () => {
    const table = "qyre_test_ddl";
    const renamed = "qyre_test_ddl_renamed";
    await adapter.ddl?.createTable?.("main", table, [
      { name: "id", dataType: "INTEGER", nullable: false, default: null },
      { name: "count", dataType: "INTEGER", nullable: true, default: 5 }
    ]);
    const created = await adapter.getTable("main", table);
    expect(created.kind).toBe("table");
    expect(created.columns.map((column) => column.name).sort()).toEqual(["count", "id"]);

    await adapter.ddl?.renameTable?.("main", table, renamed);
    await expect(adapter.getTable("main", renamed)).resolves.toMatchObject({ name: renamed });

    const seedForTruncate = new Database(dbPath);
    seedForTruncate.exec(`INSERT INTO ${renamed} (id, count) VALUES (1, 1)`);
    seedForTruncate.close();
    await adapter.ddl?.truncateTable?.("main", renamed);
    const afterTruncate = await adapter.getRows("main", renamed, 0, 10);
    expect(afterTruncate.rows).toHaveLength(0);

    await adapter.ddl?.dropTable?.("main", renamed);
    await expect(adapter.getTable("main", renamed)).rejects.toThrow();
  });

  it("rejects createTable against a chmod-read-only file copy (F110)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qyre-sqlite-readonly-ddl-"));
    const readOnlyPath = join(dir, "readonly.db");
    copyFileSync(dbPath, readOnlyPath);
    chmodSync(readOnlyPath, 0o444);

    const readOnlyAdapter = new SqliteAdapter({ engine: "sqlite", raw: readOnlyPath });
    try {
      await readOnlyAdapter.connect();
      await expect(
        readOnlyAdapter.ddl?.createTable?.("main", "qyre_test_ddl_denied", [
          { name: "id", dataType: "INTEGER", nullable: false, default: null }
        ])
      ).rejects.toThrow();
    } finally {
      await readOnlyAdapter.disconnect();
      chmodSync(readOnlyPath, 0o644);
    }
  });

  it("addColumn/renameColumn/dropColumn roundtrip via native ALTER TABLE (F111)", async () => {
    const table = "qyre_test_ddl_columns";
    await adapter.ddl?.createTable?.("main", table, [
      { name: "id", dataType: "INTEGER", nullable: false, default: null }
    ]);

    await adapter.ddl?.addColumn?.("main", table, {
      name: "extra",
      dataType: "TEXT",
      nullable: true,
      default: null
    });
    let metadata = await adapter.getTable("main", table);
    expect(metadata.columns.map((column) => column.name).sort()).toEqual(["extra", "id"]);

    await adapter.ddl?.renameColumn?.("main", table, "extra", "note");
    metadata = await adapter.getTable("main", table);
    expect(metadata.columns.map((column) => column.name).sort()).toEqual(["id", "note"]);

    await adapter.ddl?.dropColumn?.("main", table, "note");
    metadata = await adapter.getTable("main", table);
    expect(metadata.columns.map((column) => column.name)).toEqual(["id"]);

    await adapter.ddl?.dropTable?.("main", table);
  });

  it("alterColumn's 12-step rebuild preserves data, indexes, and foreign keys (F111)", async () => {
    const parent = "qyre_test_rebuild_parent";
    const child = "qyre_test_rebuild_child";
    const seed = new Database(dbPath);
    seed.exec(`
      CREATE TABLE ${parent} (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        age INTEGER DEFAULT 0
      );
      CREATE UNIQUE INDEX idx_${parent}_email ON ${parent}(email);
      CREATE TABLE ${child} (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES ${parent}(id) ON DELETE CASCADE,
        total REAL NOT NULL
      );
      INSERT INTO ${parent} (name, email, age) VALUES
        ('Ada Lovelace', 'ada@example.com', 30),
        ('Alan Turing', 'alan@example.com', 25);
      INSERT INTO ${child} (parent_id, total) VALUES (1, 9.99);
    `);
    seed.close();

    try {
      // A type change SQLite's own ADD COLUMN-family limits can't express - always the rebuild
      // path, per docs/product-specs/schema-editing.md.
      await adapter.ddl?.alterColumn?.("main", parent, "age", { dataType: "TEXT", nullable: true });

      // Data survived (age coerced by SQLite's own TEXT affinity, not dropped).
      const rows = await adapter.getRows("main", parent, 0, 10);
      expect(rows.rows.map((row) => row.name).sort()).toEqual(["Ada Lovelace", "Alan Turing"]);
      expect(rows.rows.every((row) => typeof row.age === "string")).toBe(true);

      // The unique index survived the rebuild (recreated from sqlite_master's stored SQL).
      const metadata = await adapter.getTable("main", parent);
      expect(metadata.indexes?.some((index) => index.name === `idx_${parent}_email`)).toBe(true);

      // The child table's foreign key to the rebuilt table still holds (no violations), and the
      // child row itself survived untouched.
      const raw = new Database(dbPath);
      expect(raw.pragma("foreign_key_check")).toEqual([]);
      raw.close();
      const childRows = await adapter.getRows("main", child, 0, 10);
      expect(childRows.rows).toHaveLength(1);
      expect(childRows.rows[0]?.total).toBe(9.99);
    } finally {
      const cleanup = new Database(dbPath);
      cleanup.exec(`DROP TABLE IF EXISTS ${child}; DROP TABLE IF EXISTS ${parent};`);
      cleanup.close();
    }
  });

  it("rejects addColumn against a chmod-read-only file copy (F111)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qyre-sqlite-readonly-ddl-columns-"));
    const readOnlyPath = join(dir, "readonly.db");
    copyFileSync(dbPath, readOnlyPath);
    chmodSync(readOnlyPath, 0o444);

    const readOnlyAdapter = new SqliteAdapter({ engine: "sqlite", raw: readOnlyPath });
    try {
      await readOnlyAdapter.connect();
      await expect(
        readOnlyAdapter.ddl?.addColumn?.("main", "qyre_demo_users", {
          name: "denied",
          dataType: "TEXT",
          nullable: true,
          default: null
        })
      ).rejects.toThrow();
    } finally {
      await readOnlyAdapter.disconnect();
      chmodSync(readOnlyPath, 0o644);
    }
  });

  it("createIndex/dropIndex roundtrip, a unique index rejects a duplicate value (F112)", async () => {
    const table = "qyre_test_ddl_index";
    const indexName = "idx_qyre_test_ddl_index_code";
    await adapter.ddl?.createTable?.("main", table, [
      { name: "code", dataType: "INTEGER", nullable: true, default: null }
    ]);
    await adapter.ddl?.createIndex?.("main", table, {
      name: indexName,
      columns: ["code"],
      unique: true
    });

    const withIndex = await adapter.getTable("main", table);
    expect(withIndex.indexes?.find((index) => index.name === indexName)).toMatchObject({
      columns: ["code"],
      unique: true
    });

    const seed = new Database(dbPath);
    seed.exec(`INSERT INTO ${table} (code) VALUES (1)`);
    expect(() => seed.exec(`INSERT INTO ${table} (code) VALUES (1)`)).toThrow();
    seed.close();

    await adapter.ddl?.dropIndex?.("main", table, indexName);
    const withoutIndex = await adapter.getTable("main", table);
    expect(withoutIndex.indexes?.some((index) => index.name === indexName)).toBe(false);

    await adapter.ddl?.dropTable?.("main", table);
  });

  it("rejects createIndex against a chmod-read-only file copy (F112)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qyre-sqlite-readonly-ddl-index-"));
    const readOnlyPath = join(dir, "readonly.db");
    copyFileSync(dbPath, readOnlyPath);
    chmodSync(readOnlyPath, 0o444);

    const readOnlyAdapter = new SqliteAdapter({ engine: "sqlite", raw: readOnlyPath });
    try {
      await readOnlyAdapter.connect();
      await expect(
        readOnlyAdapter.ddl?.createIndex?.("main", "qyre_demo_users", {
          name: "idx_denied",
          columns: ["name"],
          unique: false
        })
      ).rejects.toThrow();
    } finally {
      await readOnlyAdapter.disconnect();
      chmodSync(readOnlyPath, 0o644);
    }
  });

  it("updates a row by primary key and reports matched: 1, even when the value is unchanged (F100)", async () => {
    const seed = new Database(dbPath);
    seed.exec(
      "INSERT INTO qyre_demo_users (name, email) VALUES ('Update Test', 'update-test@example.com')"
    );
    seed.close();
    try {
      const before = await adapter.getRows("main", "qyre_demo_users", 0, 10);
      const row = before.rows.find((candidate) => candidate.email === "update-test@example.com");
      const noop = await adapter.mutations.updateRowByKey?.(
        "main",
        "qyre_demo_users",
        { id: row?.id },
        { name: "Update Test" }
      );
      expect(noop).toEqual({ matched: 1 });

      const result = await adapter.mutations.updateRowByKey?.(
        "main",
        "qyre_demo_users",
        { id: row?.id },
        { name: "Updated" }
      );
      expect(result).toEqual({ matched: 1 });

      const after = await adapter.getRows("main", "qyre_demo_users", 0, 10);
      expect(after.rows.find((candidate) => candidate.id === row?.id)?.name).toBe("Updated");
    } finally {
      const cleanup = new Database(dbPath);
      cleanup.exec("DELETE FROM qyre_demo_users WHERE email = 'update-test@example.com'");
      cleanup.close();
    }
  });

  it("reports matched: 0 for a key that no longer matches any row (F100)", async () => {
    const result = await adapter.mutations.updateRowByKey?.(
      "main",
      "qyre_demo_users",
      { id: -1 },
      { name: "Nobody" }
    );
    expect(result).toEqual({ matched: 0 });
  });

  it("rejects an update against a chmod-read-only file copy (F100)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qyre-sqlite-readonly-update-"));
    const readOnlyPath = join(dir, "readonly.db");
    copyFileSync(dbPath, readOnlyPath);
    chmodSync(readOnlyPath, 0o444);

    const readOnlyAdapter = new SqliteAdapter({ engine: "sqlite", raw: readOnlyPath });
    try {
      await readOnlyAdapter.connect();
      await expect(
        readOnlyAdapter.mutations.updateRowByKey?.(
          "main",
          "qyre_demo_users",
          { id: 1 },
          { name: "Should Fail" }
        )
      ).rejects.toThrow();
    } finally {
      await readOnlyAdapter.disconnect();
      chmodSync(readOnlyPath, 0o644);
    }
  });

  it("deletes rows by primary key and reports deleted: 2 (F101)", async () => {
    const seed = new Database(dbPath);
    seed.exec(
      `INSERT INTO qyre_demo_users (name, email) VALUES
         ('Delete Test 1', 'delete-test-1@example.com'),
         ('Delete Test 2', 'delete-test-2@example.com')`
    );
    seed.close();

    const before = await adapter.getRows("main", "qyre_demo_users", 0, 10);
    const rows = before.rows.filter((row) => String(row.email).startsWith("delete-test-"));
    expect(rows).toHaveLength(2);

    const result = await adapter.mutations.deleteRowsByKey?.(
      "main",
      "qyre_demo_users",
      rows.map((row) => ({ id: row.id }))
    );
    expect(result).toEqual({ deleted: 2 });

    const after = await adapter.getRows("main", "qyre_demo_users", 0, 10);
    expect(after.rows.some((row) => String(row.email).startsWith("delete-test-"))).toBe(false);
  });

  it("reports a lower deleted count when some keys no longer match any row (F101)", async () => {
    const seed = new Database(dbPath);
    seed.exec(
      "INSERT INTO qyre_demo_users (name, email) VALUES ('Delete Test', 'delete-test-partial@example.com')"
    );
    seed.close();

    const before = await adapter.getRows("main", "qyre_demo_users", 0, 10);
    const row = before.rows.find(
      (candidate) => candidate.email === "delete-test-partial@example.com"
    );

    const result = await adapter.mutations.deleteRowsByKey?.("main", "qyre_demo_users", [
      { id: row?.id },
      { id: -1 }
    ]);
    expect(result).toEqual({ deleted: 1 });
  });

  it("rejects a delete against a chmod-read-only file copy (F101)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qyre-sqlite-readonly-delete-"));
    const readOnlyPath = join(dir, "readonly.db");
    copyFileSync(dbPath, readOnlyPath);
    chmodSync(readOnlyPath, 0o444);

    const readOnlyAdapter = new SqliteAdapter({ engine: "sqlite", raw: readOnlyPath });
    try {
      await readOnlyAdapter.connect();
      await expect(
        readOnlyAdapter.mutations.deleteRowsByKey?.("main", "qyre_demo_users", [{ id: 1 }])
      ).rejects.toThrow();
    } finally {
      await readOnlyAdapter.disconnect();
      chmodSync(readOnlyPath, 0o644);
    }
  });

  it("commits a mixed insert/update/delete batch atomically in one transaction (F102)", async () => {
    const seed = new Database(dbPath);
    seed.exec(
      `INSERT INTO qyre_demo_users (name, email) VALUES ('Batch Update', 'batch-update@example.com'), ('Batch Delete', 'batch-delete@example.com')`
    );
    seed.close();
    const before = await adapter.getRows("main", "qyre_demo_users", 0, 10);
    const updateTarget = before.rows.find((row) => row.email === "batch-update@example.com");
    const deleteTarget = before.rows.find((row) => row.email === "batch-delete@example.com");

    try {
      const result = await adapter.mutations.commitBatch?.([
        {
          type: "insert",
          schema: "main",
          table: "qyre_demo_users",
          values: { name: "Batch Insert", email: "batch-insert@example.com" }
        },
        {
          type: "update",
          schema: "main",
          table: "qyre_demo_users",
          key: { id: updateTarget?.id },
          changes: { name: "Batch Updated" }
        },
        {
          type: "delete",
          schema: "main",
          table: "qyre_demo_users",
          keys: [{ id: deleteTarget?.id }]
        }
      ]);
      expect(result?.committed).toBe(true);

      const after = await adapter.getRows("main", "qyre_demo_users", 0, 10);
      expect(after.rows.some((row) => row.email === "batch-insert@example.com")).toBe(true);
      expect(after.rows.find((row) => row.id === updateTarget?.id)?.name).toBe("Batch Updated");
      expect(after.rows.some((row) => row.email === "batch-delete@example.com")).toBe(false);
    } finally {
      const cleanup = new Database(dbPath);
      cleanup.exec(
        `DELETE FROM qyre_demo_users WHERE email IN ('batch-insert@example.com', 'batch-update@example.com', 'batch-delete@example.com')`
      );
      cleanup.close();
    }
  });

  it("rolls back the whole batch on a mid-batch stale update, including the earlier insert (F102)", async () => {
    try {
      const result = await adapter.mutations.commitBatch?.([
        {
          type: "insert",
          schema: "main",
          table: "qyre_demo_users",
          values: { name: "Should Roll Back", email: "batch-rollback@example.com" }
        },
        {
          type: "update",
          schema: "main",
          table: "qyre_demo_users",
          key: { id: -1 },
          changes: { name: "Nobody" }
        }
      ]);
      expect(result).toEqual({ committed: false, failedIndex: 1 });

      const after = await adapter.getRows("main", "qyre_demo_users", 0, 10);
      expect(after.rows.some((row) => row.email === "batch-rollback@example.com")).toBe(false);
    } finally {
      const cleanup = new Database(dbPath);
      cleanup.exec("DELETE FROM qyre_demo_users WHERE email = 'batch-rollback@example.com'");
      cleanup.close();
    }
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

  it("runQuery executes an INSERT and reports rowsAffected via the reader flag (F107)", async () => {
    try {
      const result = await adapter.runQuery?.(
        "INSERT INTO qyre_demo_users (name, email) VALUES ('RunQuery Insert', 'run-query-insert@example.com')"
      );
      expect(result).toEqual({ columns: [], rows: [], rowsAffected: 1 });

      const page = await adapter.getRows("main", "qyre_demo_users", 0, 10);
      expect(page.rows.some((row) => row.email === "run-query-insert@example.com")).toBe(true);
    } finally {
      const cleanup = new Database(dbPath);
      cleanup.exec("DELETE FROM qyre_demo_users WHERE email = 'run-query-insert@example.com'");
      cleanup.close();
    }
  });

  it("runQuery executes a DDL statement (F107)", async () => {
    try {
      const result = await adapter.runQuery?.(
        "CREATE TABLE qyre_test_runquery_ddl (id INTEGER PRIMARY KEY)"
      );
      expect(result?.columns).toEqual([]);
      expect(result?.rows).toEqual([]);

      const overview = await adapter.getOverview();
      expect(overview.schemas[0]?.tables).toContain("qyre_test_runquery_ddl");
    } finally {
      const cleanup = new Database(dbPath);
      cleanup.exec("DROP TABLE IF EXISTS qyre_test_runquery_ddl");
      cleanup.close();
    }
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
        rowExportFormats: ["csv", "json", "sql"],
        jsonExportMode: "json",
        supportsAccessInspection: true,
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
