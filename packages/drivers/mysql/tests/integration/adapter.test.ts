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

  it("runs a read-only query", async () => {
    const result = await adapter.runReadOnlyQuery(`SELECT * FROM ${FIXTURE.table}`);
    expect(result.rows).toHaveLength(FIXTURE.rowCount);
  });

  it("rejects a mutating query", async () => {
    await expect(adapter.runReadOnlyQuery(`DELETE FROM ${FIXTURE.table}`)).rejects.toThrow();
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
});
