/**
 * Integration tests for {@link MysqlAdapter} against a real MySQL database.
 *
 * Requires QYRE_TEST_MYSQL_URL (see docs/RELIABILITY.md). We never silently skip required
 * verification: a missing env var fails these tests with an actionable message instead of passing
 * trivially.
 */
import {
  FIXTURE,
  MYSQL_RELATIONSHIP_FIXTURE,
  requireReadOnlyTestMysqlUrl,
  requireRoleWriterTestMysqlUrl,
  requireTestMysqlUrl,
  setupMysqlFixture
} from "@qyre/testing";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MysqlAdapter } from "../../src/index.js";

describe("MysqlAdapter integration", () => {
  let adapter: MysqlAdapter;
  let databaseUrl: string;
  let databaseName: string;

  beforeAll(async () => {
    databaseUrl = requireTestMysqlUrl();
    databaseName = new URL(databaseUrl).pathname.slice(1);
    await setupMysqlFixture(databaseUrl);
    adapter = new MysqlAdapter({ engine: "mysql", raw: databaseUrl });
    await adapter.connect();
  });

  afterAll(async () => {
    await adapter?.disconnect();
  });

  it("pings successfully", async () => {
    expect(await adapter.ping()).toBe(true);
  });

  it("lists the fixture database and table in the overview", async () => {
    const overview = await adapter.getOverview();
    const schema = overview.schemas.find((candidate) => candidate.name === databaseName);
    expect(schema?.tables).toContain(FIXTURE.table);
    expect(schema?.tables).toContain(MYSQL_RELATIONSHIP_FIXTURE.table);
  });

  it("reports writable-session capabilities and table permissions for the fixture owner (F093)", async () => {
    await expect(adapter.getCapabilities()).resolves.toEqual({
      supportsSql: true,
      rowExportFormats: ["csv", "json", "sql"],
      jsonExportMode: "json",
      supportsAccessInspection: true,
      supportsRowMutations: true,
      supportsDdl: true,
      supportsIndexManagement: true,
      supportsDatabaseManagement: true,
      supportsTransactions: true,
      readOnlyReason: null
    });

    await expect(adapter.getTable(databaseName, FIXTURE.table)).resolves.toMatchObject({
      permissions: { select: true, insert: true, update: true, delete: true }
    });
  });

  it("reports a SELECT-only fixture user as read-only (F093)", async () => {
    const readOnlyAdapter = new MysqlAdapter({
      engine: "mysql",
      raw: requireReadOnlyTestMysqlUrl(databaseUrl)
    });
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
        readOnlyReason: "grants"
      });
      await expect(readOnlyAdapter.getTable(databaseName, FIXTURE.table)).resolves.toMatchObject({
        permissions: { select: true, insert: false, update: false, delete: false }
      });

      const tables = await readOnlyAdapter.getAllTables();
      expect(tables.find((table) => table.name === FIXTURE.table)?.permissions).toEqual({
        select: true,
        insert: false,
        update: false,
        delete: false
      });
    } finally {
      await readOnlyAdapter.disconnect();
    }
  });

  it("reports write permissions granted only through an active default role (F093 regression)", async () => {
    // qyre_role_writer has SELECT granted directly, but INSERT/UPDATE/DELETE only through an
    // active default role (packages/testing's setupMysqlFixture) - plain
    // information_schema.TABLE_PRIVILEGES/SCHEMA_PRIVILEGES (and even ROLE_TABLE_GRANTS, which
    // only sees exact-table role grants) would report this user as read-only. This is the bug
    // F093 exists to fix.
    const roleWriterAdapter = new MysqlAdapter({
      engine: "mysql",
      raw: requireRoleWriterTestMysqlUrl(databaseUrl)
    });
    try {
      await roleWriterAdapter.connect();
      await expect(roleWriterAdapter.getCapabilities()).resolves.toMatchObject({
        supportsRowMutations: true,
        readOnlyReason: null
      });
      await expect(roleWriterAdapter.getTable(databaseName, FIXTURE.table)).resolves.toMatchObject({
        permissions: { select: true, insert: true, update: true, delete: true }
      });
    } finally {
      await roleWriterAdapter.disconnect();
    }
  });

  it("introspects columns, the primary key, indexes, and an exact row count", async () => {
    const table = await adapter.getTable(databaseName, FIXTURE.table);

    expect(table.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["id", "name", "email"])
    );
    const idColumn = table.columns.find((column) => column.name === "id");
    expect(idColumn?.isPrimaryKey).toBe(true);
    expect(idColumn?.isForeignKey).toBe(false);

    const primaryIndex = table.indexes?.find((index) => index.primary);
    expect(primaryIndex).toBeDefined();
    expect(primaryIndex?.columns).toEqual(["id"]);
    expect(primaryIndex?.unique).toBe(true);

    expect(table.rowCount).toBe(FIXTURE.rowCount);
  });

  it("reports ENUM and SET choices for typed editors", async () => {
    const pool = mysql.createPool(databaseUrl);
    try {
      await pool.query("DROP TABLE IF EXISTS qyre_test_choices");
      await pool.query(
        "CREATE TABLE qyre_test_choices (id INT PRIMARY KEY, status ENUM('draft','ready'), flags SET('one','two'))"
      );
      const table = await adapter.getTable(databaseName, "qyre_test_choices");
      expect(table.columns.find((column) => column.name === "status")).toMatchObject({
        dataType: "enum('draft','ready')",
        allowedValues: ["draft", "ready"]
      });
      expect(table.columns.find((column) => column.name === "flags")).toMatchObject({
        dataType: "set('one','two')",
        allowedValues: ["one", "two"]
      });
    } finally {
      await pool.query("DROP TABLE IF EXISTS qyre_test_choices");
      await pool.end();
    }
  });

  it("reports the connected engine's name and version", async () => {
    expect(await adapter.getVersion()).toMatch(/^MySQL \d/);
  });

  it("flags a column referencing another table as a foreign key", async () => {
    const table = await adapter.getTable(databaseName, MYSQL_RELATIONSHIP_FIXTURE.table);
    const userIdColumn = table.columns.find((column) => column.name === "user_id");
    expect(userIdColumn?.isForeignKey).toBe(true);
    // F061/F084: resolves what the FK references so graph consumers can draw a real edge.
    expect(userIdColumn?.references).toEqual({
      schema: databaseName,
      table: FIXTURE.table,
      column: "id"
    });
    expect(table.columns.find((column) => column.name === "total")?.isForeignKey).toBe(false);
  });

  it("returns a page of rows", async () => {
    const page = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
    expect(page.rows).toHaveLength(FIXTURE.rowCount);
    expect(page.columns).toEqual(expect.arrayContaining(["id", "name", "email"]));
  });

  it("inserts a row, reports it back via the auto-increment column, and it's visible via getRows (F099)", async () => {
    const result = await adapter.mutations.insertRow?.(databaseName, FIXTURE.table, {
      name: "Insert Test",
      email: "insert-test@example.com"
    });
    expect(result?.row).toMatchObject({ name: "Insert Test", email: "insert-test@example.com" });

    try {
      const page = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
      expect(page.rows.some((row) => row.email === "insert-test@example.com")).toBe(true);
    } finally {
      const pool = mysql.createPool(databaseUrl);
      await pool.query(`DELETE FROM ${FIXTURE.table} WHERE email = 'insert-test@example.com'`);
      await pool.end();
    }
  });

  it("rejects an insert as a SELECT-only fixture user (F099)", async () => {
    const readOnlyAdapter = new MysqlAdapter({
      engine: "mysql",
      raw: requireReadOnlyTestMysqlUrl(databaseUrl)
    });
    try {
      await readOnlyAdapter.connect();
      await expect(
        readOnlyAdapter.mutations.insertRow?.(databaseName, FIXTURE.table, {
          name: "Should Fail",
          email: "should-fail@example.com"
        })
      ).rejects.toThrow();
    } finally {
      await readOnlyAdapter.disconnect();
    }
  });

  it("addColumn/renameColumn/alterColumn/dropColumn roundtrip (F111)", async () => {
    const table = "qyre_test_ddl_columns";
    const pool = mysql.createPool(databaseUrl);
    try {
      await adapter.ddl?.createTable?.(databaseName, table, [
        { name: "id", dataType: "INT", nullable: false, default: null }
      ]);

      await adapter.ddl?.addColumn?.(databaseName, table, {
        name: "extra",
        dataType: "INT",
        nullable: true,
        default: null
      });
      let metadata = await adapter.getTable(databaseName, table);
      expect(metadata.columns.map((column) => column.name).sort()).toEqual(["extra", "id"]);

      await adapter.ddl?.renameColumn?.(databaseName, table, "extra", "value");
      metadata = await adapter.getTable(databaseName, table);
      expect(metadata.columns.map((column) => column.name).sort()).toEqual(["id", "value"]);

      await adapter.ddl?.alterColumn?.(databaseName, table, "value", {
        nullable: false,
        default: 0
      });
      metadata = await adapter.getTable(databaseName, table);
      expect(metadata.columns.find((column) => column.name === "value")?.nullable).toBe(false);
      await pool.query(`INSERT INTO ${table} (id) VALUES (1)`);
      const [rows] = await pool.query(`SELECT value FROM ${table} WHERE id = 1`);
      expect((rows as Array<{ value: number }>)[0]?.value).toBe(0);

      await adapter.ddl?.alterColumn?.(databaseName, table, "value", { nullable: true });
      await adapter.ddl?.dropColumn?.(databaseName, table, "value");
      metadata = await adapter.getTable(databaseName, table);
      expect(metadata.columns.map((column) => column.name)).toEqual(["id"]);
    } finally {
      await pool.query(`DROP TABLE IF EXISTS ${table}`);
      await pool.end();
    }
  });

  it("renameAndAlterColumn applies both in one call (F134)", async () => {
    const table = "qyre_test_ddl_rename_alter";
    const pool = mysql.createPool(databaseUrl);
    try {
      await adapter.ddl?.createTable?.(databaseName, table, [
        { name: "id", dataType: "INT", nullable: false, default: null },
        { name: "note", dataType: "VARCHAR(255)", nullable: true, default: null }
      ]);

      const result = await adapter.ddl?.renameAndAlterColumn?.(databaseName, table, "note", {
        newName: "remark",
        changes: { nullable: false, default: "n/a" }
      });
      expect(result).toEqual({ column: "remark", renamed: true, altered: true });

      const metadata = await adapter.getTable(databaseName, table);
      const remark = metadata.columns.find((column) => column.name === "remark");
      expect(remark?.nullable).toBe(false);
      expect(metadata.columns.some((column) => column.name === "note")).toBe(false);
    } finally {
      await pool.query(`DROP TABLE IF EXISTS ${table}`);
      await pool.end();
    }
  });

  it("renameAndAlterColumn reports a partial success instead of throwing when the rename commits but the alter fails (F134)", async () => {
    const table = "qyre_test_ddl_rename_alter_partial";
    const pool = mysql.createPool(databaseUrl);
    try {
      await adapter.ddl?.createTable?.(databaseName, table, [
        { name: "id", dataType: "INT", nullable: false, default: null },
        { name: "note", dataType: "VARCHAR(255)", nullable: true, default: null }
      ]);
      await pool.query(`INSERT INTO ${table} (id, note) VALUES (1, 'not-a-number')`);

      // MySQL's DDL auto-commits per statement - RENAME COLUMN below has already committed by the
      // time MODIFY COLUMN's strict-mode cast failure happens, so this can never roll back the
      // way Postgres/SQLite's single-transaction version does. renameAndAlterColumn must report
      // that partial outcome instead of throwing and hiding the already-committed rename.
      const result = await adapter.ddl?.renameAndAlterColumn?.(databaseName, table, "note", {
        newName: "remark",
        changes: { dataType: "INT" }
      });
      expect(result?.renamed).toBe(true);
      expect(result?.altered).toBe(false);
      expect(result?.alterError).toBeTruthy();

      const metadata = await adapter.getTable(databaseName, table);
      expect(metadata.columns.some((column) => column.name === "remark")).toBe(true);
      expect(metadata.columns.some((column) => column.name === "note")).toBe(false);
      const remark = metadata.columns.find((column) => column.name === "remark");
      expect(remark?.dataType.toLowerCase()).toContain("varchar");
    } finally {
      await pool.query(`DROP TABLE IF EXISTS ${table}`);
      await pool.end();
    }
  });

  it("rejects addColumn as a SELECT-only fixture user (F111)", async () => {
    const readOnlyAdapter = new MysqlAdapter({
      engine: "mysql",
      raw: requireReadOnlyTestMysqlUrl(databaseUrl)
    });
    try {
      await readOnlyAdapter.connect();
      await expect(
        readOnlyAdapter.ddl?.addColumn?.(databaseName, FIXTURE.table, {
          name: "denied",
          dataType: "INT",
          nullable: true,
          default: null
        })
      ).rejects.toThrow();
    } finally {
      await readOnlyAdapter.disconnect();
    }
  });

  it("createIndex/dropIndex roundtrip, a unique index rejects a duplicate value (F112)", async () => {
    const table = "qyre_test_ddl_index";
    const indexName = "idx_qyre_test_ddl_index_code";
    const pool = mysql.createPool(databaseUrl);
    try {
      await adapter.ddl?.createTable?.(databaseName, table, [
        { name: "code", dataType: "INT", nullable: true, default: null }
      ]);
      await adapter.ddl?.createIndex?.(databaseName, table, {
        name: indexName,
        columns: ["code"],
        unique: true
      });

      const withIndex = await adapter.getTable(databaseName, table);
      expect(withIndex.indexes?.find((index) => index.name === indexName)).toMatchObject({
        columns: ["code"],
        unique: true
      });

      await pool.query(`INSERT INTO ${table} (code) VALUES (1)`);
      await expect(pool.query(`INSERT INTO ${table} (code) VALUES (1)`)).rejects.toThrow();

      await adapter.ddl?.dropIndex?.(databaseName, table, indexName);
      const withoutIndex = await adapter.getTable(databaseName, table);
      expect(withoutIndex.indexes?.some((index) => index.name === indexName)).toBe(false);
    } finally {
      await pool.query(`DROP TABLE IF EXISTS ${table}`);
      await pool.end();
    }
  });

  it("rejects createIndex as a SELECT-only fixture user (F112)", async () => {
    const readOnlyAdapter = new MysqlAdapter({
      engine: "mysql",
      raw: requireReadOnlyTestMysqlUrl(databaseUrl)
    });
    try {
      await readOnlyAdapter.connect();
      await expect(
        readOnlyAdapter.ddl?.createIndex?.(databaseName, FIXTURE.table, {
          name: "idx_denied",
          columns: ["name"],
          unique: false
        })
      ).rejects.toThrow();
    } finally {
      await readOnlyAdapter.disconnect();
    }
  });

  it("rejects createDatabase as a SELECT-only fixture user, which also reports supportsDatabaseManagement false (F115)", async () => {
    const readOnlyAdapter = new MysqlAdapter({
      engine: "mysql",
      raw: requireReadOnlyTestMysqlUrl(databaseUrl)
    });
    try {
      await readOnlyAdapter.connect();
      const capabilities = await readOnlyAdapter.getCapabilities();
      expect(capabilities.supportsDatabaseManagement).toBe(false);
      await expect(readOnlyAdapter.admin.createDatabase?.("qyre_denied_db")).rejects.toThrow();
    } finally {
      await readOnlyAdapter.disconnect();
    }
  });

  it("createTable/renameTable/truncateTable/dropTable roundtrip (F110)", async () => {
    const table = "qyre_test_ddl";
    const renamed = "qyre_test_ddl_renamed";
    const pool = mysql.createPool(databaseUrl);
    try {
      await adapter.ddl?.createTable?.(databaseName, table, [
        { name: "id", dataType: "INT", nullable: false, default: null },
        { name: "count", dataType: "INT", nullable: true, default: 5 }
      ]);
      const created = await adapter.getTable(databaseName, table);
      expect(created.kind).toBe("table");
      expect(created.columns.map((column) => column.name).sort()).toEqual(["count", "id"]);

      await adapter.ddl?.renameTable?.(databaseName, table, renamed);
      await expect(adapter.getTable(databaseName, renamed)).resolves.toMatchObject({
        name: renamed
      });

      await pool.query(`INSERT INTO ${renamed} (id, count) VALUES (1, 1)`);
      await adapter.ddl?.truncateTable?.(databaseName, renamed);
      const afterTruncate = await adapter.getRows(databaseName, renamed, 0, 10);
      expect(afterTruncate.rows).toHaveLength(0);

      await adapter.ddl?.dropTable?.(databaseName, renamed);
      await expect(adapter.getTable(databaseName, renamed)).rejects.toThrow();
    } finally {
      await pool.query(`DROP TABLE IF EXISTS ${table}`);
      await pool.query(`DROP TABLE IF EXISTS ${renamed}`);
      await pool.end();
    }
  });

  it("rejects createTable as a SELECT-only fixture user (F110)", async () => {
    const readOnlyAdapter = new MysqlAdapter({
      engine: "mysql",
      raw: requireReadOnlyTestMysqlUrl(databaseUrl)
    });
    try {
      await readOnlyAdapter.connect();
      await expect(
        readOnlyAdapter.ddl?.createTable?.(databaseName, "qyre_test_ddl_denied", [
          { name: "id", dataType: "INT", nullable: false, default: null }
        ])
      ).rejects.toThrow();
    } finally {
      await readOnlyAdapter.disconnect();
    }
  });

  it("updates a row by primary key and reports matched: 1, even when the value is unchanged (F100)", async () => {
    const seedPool = mysql.createPool(databaseUrl);
    await seedPool.query(
      `INSERT INTO ${FIXTURE.table} (name, email) VALUES ('Update Test', 'update-test@example.com')`
    );
    try {
      const before = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
      const row = before.rows.find((candidate) => candidate.email === "update-test@example.com");
      const noop = await adapter.mutations.updateRowByKey?.(
        databaseName,
        FIXTURE.table,
        { id: row?.id },
        { name: "Update Test" }
      );
      expect(noop).toEqual({ matched: 1 });

      const result = await adapter.mutations.updateRowByKey?.(
        databaseName,
        FIXTURE.table,
        { id: row?.id },
        { name: "Updated" }
      );
      expect(result).toEqual({ matched: 1 });

      const after = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
      expect(after.rows.find((candidate) => candidate.id === row?.id)?.name).toBe("Updated");
    } finally {
      await seedPool.query(`DELETE FROM ${FIXTURE.table} WHERE email = 'update-test@example.com'`);
      await seedPool.end();
    }
  });

  it("reports matched: 0 for a key that no longer matches any row (F100)", async () => {
    const result = await adapter.mutations.updateRowByKey?.(
      databaseName,
      FIXTURE.table,
      { id: -1 },
      { name: "Nobody" }
    );
    expect(result).toEqual({ matched: 0 });
  });

  it("rejects an update as a SELECT-only fixture user (F100)", async () => {
    const readOnlyAdapter = new MysqlAdapter({
      engine: "mysql",
      raw: requireReadOnlyTestMysqlUrl(databaseUrl)
    });
    try {
      await readOnlyAdapter.connect();
      await expect(
        readOnlyAdapter.mutations.updateRowByKey?.(
          databaseName,
          FIXTURE.table,
          { id: 1 },
          { name: "Should Fail" }
        )
      ).rejects.toThrow();
    } finally {
      await readOnlyAdapter.disconnect();
    }
  });

  it("deletes rows by primary key and reports deleted: 2 (F101)", async () => {
    const seedPool = mysql.createPool(databaseUrl);
    await seedPool.query(
      `INSERT INTO ${FIXTURE.table} (name, email) VALUES
         ('Delete Test 1', 'delete-test-1@example.com'),
         ('Delete Test 2', 'delete-test-2@example.com')`
    );
    await seedPool.end();

    const before = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
    const rows = before.rows.filter((row) => String(row.email).startsWith("delete-test-"));
    expect(rows).toHaveLength(2);

    const result = await adapter.mutations.deleteRowsByKey?.(
      databaseName,
      FIXTURE.table,
      rows.map((row) => ({ id: row.id }))
    );
    expect(result).toEqual({ deleted: 2 });

    const after = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
    expect(after.rows.some((row) => String(row.email).startsWith("delete-test-"))).toBe(false);
  });

  it("reports a lower deleted count when some keys no longer match any row (F101)", async () => {
    const seedPool = mysql.createPool(databaseUrl);
    await seedPool.query(
      `INSERT INTO ${FIXTURE.table} (name, email) VALUES ('Delete Test', 'delete-test-partial@example.com')`
    );
    await seedPool.end();

    const before = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
    const row = before.rows.find(
      (candidate) => candidate.email === "delete-test-partial@example.com"
    );

    const result = await adapter.mutations.deleteRowsByKey?.(databaseName, FIXTURE.table, [
      { id: row?.id },
      { id: -1 }
    ]);
    expect(result).toEqual({ deleted: 1 });
  });

  it("rejects a delete as a SELECT-only fixture user (F101)", async () => {
    const readOnlyAdapter = new MysqlAdapter({
      engine: "mysql",
      raw: requireReadOnlyTestMysqlUrl(databaseUrl)
    });
    try {
      await readOnlyAdapter.connect();
      await expect(
        readOnlyAdapter.mutations.deleteRowsByKey?.(databaseName, FIXTURE.table, [{ id: 1 }])
      ).rejects.toThrow();
    } finally {
      await readOnlyAdapter.disconnect();
    }
  });

  it("commits a mixed insert/update/delete batch atomically in one transaction (F102)", async () => {
    const seedPool = mysql.createPool(databaseUrl);
    await seedPool.query(
      `INSERT INTO ${FIXTURE.table} (name, email) VALUES ('Batch Update', 'batch-update@example.com'), ('Batch Delete', 'batch-delete@example.com')`
    );
    const before = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
    const updateTarget = before.rows.find((row) => row.email === "batch-update@example.com");
    const deleteTarget = before.rows.find((row) => row.email === "batch-delete@example.com");

    try {
      const result = await adapter.mutations.commitBatch?.([
        {
          type: "insert",
          schema: databaseName,
          table: FIXTURE.table,
          values: { name: "Batch Insert", email: "batch-insert@example.com" }
        },
        {
          type: "update",
          schema: databaseName,
          table: FIXTURE.table,
          key: { id: updateTarget?.id },
          changes: { name: "Batch Updated" }
        },
        {
          type: "delete",
          schema: databaseName,
          table: FIXTURE.table,
          keys: [{ id: deleteTarget?.id }]
        }
      ]);
      expect(result?.committed).toBe(true);

      const after = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
      expect(after.rows.some((row) => row.email === "batch-insert@example.com")).toBe(true);
      expect(after.rows.find((row) => row.id === updateTarget?.id)?.name).toBe("Batch Updated");
      expect(after.rows.some((row) => row.email === "batch-delete@example.com")).toBe(false);
    } finally {
      await seedPool.query(
        `DELETE FROM ${FIXTURE.table} WHERE email IN ('batch-insert@example.com', 'batch-update@example.com', 'batch-delete@example.com')`
      );
      await seedPool.end();
    }
  });

  it("rolls back the whole batch on a mid-batch stale update, including the earlier insert (F102)", async () => {
    const seedPool = mysql.createPool(databaseUrl);
    try {
      const result = await adapter.mutations.commitBatch?.([
        {
          type: "insert",
          schema: databaseName,
          table: FIXTURE.table,
          values: { name: "Should Roll Back", email: "batch-rollback@example.com" }
        },
        {
          type: "update",
          schema: databaseName,
          table: FIXTURE.table,
          key: { id: -1 },
          changes: { name: "Nobody" }
        }
      ]);
      expect(result).toEqual({ committed: false, failedIndex: 1 });

      const after = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
      expect(after.rows.some((row) => row.email === "batch-rollback@example.com")).toBe(false);
    } finally {
      await seedPool.query(
        `DELETE FROM ${FIXTURE.table} WHERE email = 'batch-rollback@example.com'`
      );
      await seedPool.end();
    }
  });

  it("runs a read-only query", async () => {
    const result = await adapter.runReadOnlyQuery(`SELECT * FROM ${FIXTURE.table}`);
    expect(result.rows).toHaveLength(FIXTURE.rowCount);
  });

  it("rejects a mutating query", async () => {
    await expect(adapter.runReadOnlyQuery(`DELETE FROM ${FIXTURE.table}`)).rejects.toThrow();
  });

  it("runQuery executes an INSERT and reports rowsAffected (F107)", async () => {
    try {
      const result = await adapter.runQuery?.(
        `INSERT INTO ${FIXTURE.table} (name, email) VALUES ('RunQuery Insert', 'run-query-insert@example.com')`
      );
      expect(result).toEqual({ columns: [], rows: [], rowsAffected: 1 });

      const page = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
      expect(page.rows.some((row) => row.email === "run-query-insert@example.com")).toBe(true);
    } finally {
      const pool = mysql.createPool(databaseUrl);
      await pool.query(`DELETE FROM ${FIXTURE.table} WHERE email = 'run-query-insert@example.com'`);
      await pool.end();
    }
  });

  it("runQuery executes a DDL statement (F107)", async () => {
    const pool = mysql.createPool(databaseUrl);
    try {
      await pool.query("DROP TABLE IF EXISTS qyre_test_runquery_ddl");
      const result = await adapter.runQuery?.(
        "CREATE TABLE qyre_test_runquery_ddl (id int AUTO_INCREMENT PRIMARY KEY)"
      );
      expect(result?.columns).toEqual([]);
      expect(result?.rows).toEqual([]);

      const overview = await adapter.getOverview();
      const schema = overview.schemas.find((candidate) => candidate.name === databaseName);
      expect(schema?.tables).toContain("qyre_test_runquery_ddl");
    } finally {
      await pool.query("DROP TABLE IF EXISTS qyre_test_runquery_ddl");
      await pool.end();
    }
  });

  it("MySQL's own READ ONLY transaction refuses a write, independent of assertReadOnly", async () => {
    // Proves the actual backstop mechanism (not just that assertReadOnly's string scan catches an
    // obvious DELETE, which the "rejects a mutating query" test above already covers): open the
    // same START TRANSACTION READ ONLY runReadOnlyQuery relies on directly, bypassing the adapter
    // (and therefore assertReadOnly) entirely, and confirm MySQL itself still refuses the write.
    const pool = mysql.createPool(databaseUrl);
    const connection = await pool.getConnection();
    try {
      await connection.query("START TRANSACTION READ ONLY");
      await expect(connection.query(`DELETE FROM ${FIXTURE.table}`)).rejects.toThrow();
    } finally {
      await connection.query("ROLLBACK").catch(() => {});
      connection.release();
      await pool.end();
    }
  });

  it("survives an idle pooled connection being dropped by the database", async () => {
    await adapter.ping(); // ensure a client is checked into the pool

    const admin = mysql.createPool(databaseUrl);
    try {
      const [rows] = await admin.query<mysql.RowDataPacket[]>(
        `SELECT id FROM information_schema.processlist
          WHERE command = 'Sleep' AND id <> CONNECTION_ID()
          ORDER BY id DESC LIMIT 1`
      );
      const id = (rows[0] as { id: number } | undefined)?.id;
      expect(id).toBeDefined();
      await admin.query(`KILL ?`, [id]);
    } finally {
      await admin.end();
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await adapter.ping()).toBe(true);
  });

  it("aborts a runaway query once it exceeds the configured statement timeout (F032)", async () => {
    // A dedicated adapter/pool with a tiny timeout (via QYRE_STATEMENT_TIMEOUT_MS, read at
    // connect() time) proves the mechanism fires without waiting out the real 30s default.
    process.env.QYRE_STATEMENT_TIMEOUT_MS = "200";
    const shortTimeoutAdapter = new MysqlAdapter({ engine: "mysql", raw: databaseUrl });
    try {
      await shortTimeoutAdapter.connect();
      await expect(shortTimeoutAdapter.runReadOnlyQuery("SELECT SLEEP(2)")).rejects.toThrow(
        /timeout/i
      );
    } finally {
      delete process.env.QYRE_STATEMENT_TIMEOUT_MS;
      await shortTimeoutAdapter.disconnect();
    }
  });

  it("cancels a running read-only query via the operation registry, and the connection remains usable afterward (F126)", async () => {
    const callbacks = new Map<string, () => Promise<void>>();
    adapter.operationRegistry = {
      register: (id, cancel) => callbacks.set(id, cancel),
      unregister: (id) => callbacks.delete(id)
    };
    try {
      const operationId = "f126-cancel-test";
      const slowQuery = adapter.runReadOnlyQuery("SELECT SLEEP(5)", operationId);
      await expect.poll(() => callbacks.has(operationId), { timeout: 2000 }).toBe(true);

      await callbacks.get(operationId)?.();
      await expect(slowQuery).rejects.toMatchObject({ name: "OperationCancelledError" });

      expect(await adapter.ping()).toBe(true);
    } finally {
      adapter.operationRegistry = undefined;
    }
  });
});
