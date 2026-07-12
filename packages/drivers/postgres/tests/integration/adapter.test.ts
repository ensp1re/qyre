/**
 * Integration tests for {@link PostgresAdapter} against a real Postgres database.
 *
 * Requires QYRE_TEST_DATABASE_URL (see docs/RELIABILITY.md). We never silently skip required
 * verification: a missing env var fails these tests with an actionable message instead of passing
 * trivially.
 */
import {
  FIXTURE,
  requireReadOnlyTestDatabaseUrl,
  requireTestDatabaseUrl,
  runStatements,
  setupFixture
} from "@qyre/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAdapter } from "../../src/index.js";

describe("PostgresAdapter integration", () => {
  let adapter: PostgresAdapter;
  let databaseUrl: string;

  beforeAll(async () => {
    databaseUrl = requireTestDatabaseUrl();
    await setupFixture(databaseUrl);
    adapter = new PostgresAdapter({ engine: "postgres", raw: databaseUrl });
    await adapter.connect();
  });

  afterAll(async () => {
    await adapter?.disconnect();
  });

  it("pings successfully", async () => {
    expect(await adapter.ping()).toBe(true);
  });

  it("lists the fixture schema and table in the overview", async () => {
    const overview = await adapter.getOverview();
    const schema = overview.schemas.find((candidate) => candidate.name === FIXTURE.schema);
    expect(schema?.tables).toContain(FIXTURE.table);
  });

  it("reports writable-session capabilities and table permissions for the fixture owner (F092)", async () => {
    await expect(adapter.getCapabilities()).resolves.toEqual({
      supportsSql: true,
      supportsRowMutations: true,
      supportsDdl: true,
      supportsIndexManagement: true,
      supportsDatabaseManagement: true,
      supportsTransactions: true,
      readOnlyReason: null
    });

    await expect(adapter.getTable(FIXTURE.schema, FIXTURE.table)).resolves.toMatchObject({
      permissions: { select: true, insert: true, update: true, delete: true }
    });
  });

  it("reports a SELECT-only fixture role as read-only (F092)", async () => {
    const readOnlyAdapter = new PostgresAdapter({
      engine: "postgres",
      raw: requireReadOnlyTestDatabaseUrl(databaseUrl)
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
      await expect(readOnlyAdapter.getTable(FIXTURE.schema, FIXTURE.table)).resolves.toMatchObject({
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

  it("introspects columns, the primary key, indexes, and an approximate row count", async () => {
    const table = await adapter.getTable(FIXTURE.schema, FIXTURE.table);

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

    expect(table.rowCount).toBeGreaterThanOrEqual(0);
  });

  it("reports the connected engine's name and version", async () => {
    expect(await adapter.getVersion()).toMatch(/^PostgreSQL \d/);
  });

  it("flags a column referencing another table as a foreign key", async () => {
    await runStatements(databaseUrl, [
      "DROP TABLE IF EXISTS qyre_test_orders",
      `CREATE TABLE qyre_test_orders (
         id serial PRIMARY KEY,
         user_id integer NOT NULL REFERENCES ${FIXTURE.table}(id),
         total numeric(10,2) NOT NULL
       )`
    ]);

    try {
      const table = await adapter.getTable(FIXTURE.schema, "qyre_test_orders");
      const userIdColumn = table.columns.find((column) => column.name === "user_id");
      expect(userIdColumn?.isForeignKey).toBe(true);
      // F061: also resolves what the FK actually references, not just that it is one.
      expect(userIdColumn?.references).toEqual({
        schema: FIXTURE.schema,
        table: FIXTURE.table,
        column: "id"
      });
      expect(table.columns.find((column) => column.name === "total")?.isForeignKey).toBe(false);
    } finally {
      await runStatements(databaseUrl, ["DROP TABLE IF EXISTS qyre_test_orders"]);
    }
  });

  it("reports an enum column's actual type name instead of Postgres's generic USER-DEFINED", async () => {
    await runStatements(databaseUrl, [
      "DROP TABLE IF EXISTS qyre_test_moods",
      "DROP TYPE IF EXISTS mood",
      "CREATE TYPE mood AS ENUM ('happy', 'sad')",
      "CREATE TABLE qyre_test_moods (id serial PRIMARY KEY, current_mood mood NOT NULL)"
    ]);

    try {
      const table = await adapter.getTable(FIXTURE.schema, "qyre_test_moods");
      const moodColumn = table.columns.find((column) => column.name === "current_mood");
      expect(moodColumn?.dataType).toBe("mood");
    } finally {
      await runStatements(databaseUrl, [
        "DROP TABLE IF EXISTS qyre_test_moods",
        "DROP TYPE IF EXISTS mood"
      ]);
    }
  });

  it("returns a page of rows", async () => {
    const page = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);
    expect(page.rows).toHaveLength(FIXTURE.rowCount);
    expect(page.columns).toEqual(expect.arrayContaining(["id", "name", "email"]));
  });

  it("inserts a row and returns it, then the row is visible via getRows (F099)", async () => {
    const result = await adapter.mutations.insertRow?.(FIXTURE.schema, FIXTURE.table, {
      name: "Insert Test",
      email: "insert-test@example.com"
    });
    expect(result?.row).toMatchObject({ name: "Insert Test", email: "insert-test@example.com" });

    try {
      const page = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);
      expect(page.rows.some((row) => row.email === "insert-test@example.com")).toBe(true);
    } finally {
      await runStatements(databaseUrl, [
        `DELETE FROM ${FIXTURE.table} WHERE email = 'insert-test@example.com'`
      ]);
    }
  });

  it("rejects an insert as a SELECT-only fixture role (F099)", async () => {
    const readOnlyAdapter = new PostgresAdapter({
      engine: "postgres",
      raw: requireReadOnlyTestDatabaseUrl(databaseUrl)
    });
    try {
      await readOnlyAdapter.connect();
      await expect(
        readOnlyAdapter.mutations.insertRow?.(FIXTURE.schema, FIXTURE.table, {
          name: "Should Fail",
          email: "should-fail@example.com"
        })
      ).rejects.toThrow();
    } finally {
      await readOnlyAdapter.disconnect();
    }
  });

  it("updates a row by primary key and reports matched: 1 (F100)", async () => {
    await runStatements(databaseUrl, [
      `INSERT INTO ${FIXTURE.table} (name, email) VALUES ('Update Test', 'update-test@example.com')`
    ]);
    try {
      const before = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);
      const row = before.rows.find((candidate) => candidate.email === "update-test@example.com");
      const result = await adapter.mutations.updateRowByKey?.(
        FIXTURE.schema,
        FIXTURE.table,
        { id: row?.id },
        { name: "Updated" }
      );
      expect(result).toEqual({ matched: 1 });

      const after = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);
      expect(after.rows.find((candidate) => candidate.id === row?.id)?.name).toBe("Updated");
    } finally {
      await runStatements(databaseUrl, [
        `DELETE FROM ${FIXTURE.table} WHERE email = 'update-test@example.com'`
      ]);
    }
  });

  it("reports matched: 0 for a key that no longer matches any row (F100)", async () => {
    const result = await adapter.mutations.updateRowByKey?.(
      FIXTURE.schema,
      FIXTURE.table,
      { id: -1 },
      { name: "Nobody" }
    );
    expect(result).toEqual({ matched: 0 });
  });

  it("rejects an update as a SELECT-only fixture role (F100)", async () => {
    const readOnlyAdapter = new PostgresAdapter({
      engine: "postgres",
      raw: requireReadOnlyTestDatabaseUrl(databaseUrl)
    });
    try {
      await readOnlyAdapter.connect();
      await expect(
        readOnlyAdapter.mutations.updateRowByKey?.(
          FIXTURE.schema,
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
    await runStatements(databaseUrl, [
      `INSERT INTO ${FIXTURE.table} (name, email) VALUES
         ('Delete Test 1', 'delete-test-1@example.com'),
         ('Delete Test 2', 'delete-test-2@example.com')`
    ]);
    const before = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);
    const rows = before.rows.filter((row) => String(row.email).startsWith("delete-test-"));
    expect(rows).toHaveLength(2);

    const result = await adapter.mutations.deleteRowsByKey?.(
      FIXTURE.schema,
      FIXTURE.table,
      rows.map((row) => ({ id: row.id }))
    );
    expect(result).toEqual({ deleted: 2 });

    const after = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);
    expect(after.rows.some((row) => String(row.email).startsWith("delete-test-"))).toBe(false);
  });

  it("reports a lower deleted count when some keys no longer match any row (F101)", async () => {
    await runStatements(databaseUrl, [
      `INSERT INTO ${FIXTURE.table} (name, email) VALUES ('Delete Test', 'delete-test-partial@example.com')`
    ]);
    const before = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);
    const row = before.rows.find(
      (candidate) => candidate.email === "delete-test-partial@example.com"
    );

    const result = await adapter.mutations.deleteRowsByKey?.(FIXTURE.schema, FIXTURE.table, [
      { id: row?.id },
      { id: -1 }
    ]);
    expect(result).toEqual({ deleted: 1 });
  });

  it("rejects a delete as a SELECT-only fixture role (F101)", async () => {
    const readOnlyAdapter = new PostgresAdapter({
      engine: "postgres",
      raw: requireReadOnlyTestDatabaseUrl(databaseUrl)
    });
    try {
      await readOnlyAdapter.connect();
      await expect(
        readOnlyAdapter.mutations.deleteRowsByKey?.(FIXTURE.schema, FIXTURE.table, [{ id: 1 }])
      ).rejects.toThrow();
    } finally {
      await readOnlyAdapter.disconnect();
    }
  });

  it("commits a mixed insert/update/delete batch atomically in one transaction (F102)", async () => {
    await runStatements(databaseUrl, [
      `INSERT INTO ${FIXTURE.table} (name, email) VALUES ('Batch Update', 'batch-update@example.com'), ('Batch Delete', 'batch-delete@example.com')`
    ]);
    const before = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);
    const updateTarget = before.rows.find((row) => row.email === "batch-update@example.com");
    const deleteTarget = before.rows.find((row) => row.email === "batch-delete@example.com");

    try {
      const result = await adapter.mutations.commitBatch?.([
        {
          type: "insert",
          schema: FIXTURE.schema,
          table: FIXTURE.table,
          values: { name: "Batch Insert", email: "batch-insert@example.com" }
        },
        {
          type: "update",
          schema: FIXTURE.schema,
          table: FIXTURE.table,
          key: { id: updateTarget?.id },
          changes: { name: "Batch Updated" }
        },
        {
          type: "delete",
          schema: FIXTURE.schema,
          table: FIXTURE.table,
          keys: [{ id: deleteTarget?.id }]
        }
      ]);
      expect(result?.committed).toBe(true);

      const after = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);
      expect(after.rows.some((row) => row.email === "batch-insert@example.com")).toBe(true);
      expect(after.rows.find((row) => row.id === updateTarget?.id)?.name).toBe("Batch Updated");
      expect(after.rows.some((row) => row.email === "batch-delete@example.com")).toBe(false);
    } finally {
      await runStatements(databaseUrl, [
        `DELETE FROM ${FIXTURE.table} WHERE email IN ('batch-insert@example.com', 'batch-update@example.com', 'batch-delete@example.com')`
      ]);
    }
  });

  it("rolls back the whole batch on a mid-batch stale update, including the earlier insert (F102)", async () => {
    try {
      const result = await adapter.mutations.commitBatch?.([
        {
          type: "insert",
          schema: FIXTURE.schema,
          table: FIXTURE.table,
          values: { name: "Should Roll Back", email: "batch-rollback@example.com" }
        },
        {
          type: "update",
          schema: FIXTURE.schema,
          table: FIXTURE.table,
          key: { id: -1 },
          changes: { name: "Nobody" }
        }
      ]);
      expect(result).toEqual({ committed: false, failedIndex: 1 });

      const after = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);
      expect(after.rows.some((row) => row.email === "batch-rollback@example.com")).toBe(false);
    } finally {
      await runStatements(databaseUrl, [
        `DELETE FROM ${FIXTURE.table} WHERE email = 'batch-rollback@example.com'`
      ]);
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

      const page = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);
      expect(page.rows.some((row) => row.email === "run-query-insert@example.com")).toBe(true);
    } finally {
      await runStatements(databaseUrl, [
        `DELETE FROM ${FIXTURE.table} WHERE email = 'run-query-insert@example.com'`
      ]);
    }
  });

  it("runQuery executes a DDL statement (F107)", async () => {
    await runStatements(databaseUrl, ["DROP TABLE IF EXISTS qyre_test_runquery_ddl"]);
    try {
      const result = await adapter.runQuery?.(
        "CREATE TABLE qyre_test_runquery_ddl (id serial PRIMARY KEY)"
      );
      expect(result?.columns).toEqual([]);
      expect(result?.rows).toEqual([]);

      const overview = await adapter.getOverview();
      const schema = overview.schemas.find((candidate) => candidate.name === FIXTURE.schema);
      expect(schema?.tables).toContain("qyre_test_runquery_ddl");
    } finally {
      await runStatements(databaseUrl, ["DROP TABLE IF EXISTS qyre_test_runquery_ddl"]);
    }
  });

  it("CRITICAL: runQuery does NOT rewrite an unknown double-quoted token, unlike runReadOnlyQuery's coercion (F107 regression)", async () => {
    // The exact same text that runReadOnlyQuery's coercion would silently rewrite into a string
    // literal (see "treats a double-quoted value..." above) must be sent to Postgres verbatim on
    // the write path - a mutation's SQL is never DWIM-coerced, only read statements get that
    // treatment (docs/product-specs/sql-editor.md). `WHERE id = -1` matches no real row, but
    // Postgres still validates the SET clause's column reference at plan time regardless, so this
    // never touches fixture data even though it throws.
    await expect(
      adapter.runQuery?.(`UPDATE ${FIXTURE.table} SET name="Alan Turing" WHERE id = -1`)
    ).rejects.toThrow(/column "Alan Turing" does not exist/);
  });

  it("runs a read-only query whose string literal contains a semicolon (F021 regression)", async () => {
    // Previously: assertReadOnly checked for `;` against raw SQL, so filtering by any value
    // containing a semicolon (a URL, encoded blob, free text) was wrongly rejected as
    // "multiple statements".
    const result = await adapter.runReadOnlyQuery(
      `SELECT * FROM ${FIXTURE.table} WHERE name = 'a;b'`
    );
    expect(result.rows).toHaveLength(0);
  });

  it("treats a double-quoted value most people write out of habit as a string literal", async () => {
    // Reproduces the real bug report: Postgres reserves "" for identifiers, so this used to fail
    // with `column "Alan Turing" does not exist` instead of matching the row.
    const result = await adapter.runReadOnlyQuery(
      `SELECT * FROM ${FIXTURE.table} WHERE name="Alan Turing"`
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.name).toBe("Alan Turing");
  });

  it("still treats a double-quoted real column name as an identifier, not a string", async () => {
    const result = await adapter.runReadOnlyQuery(`SELECT "name" FROM ${FIXTURE.table}`);
    expect(result.columns).toEqual(["name"]);
    expect(result.rows).toHaveLength(FIXTURE.rowCount);
  });

  it("does not corrupt a quote character inside a string literal (F020 regression)", async () => {
    // Previously: the regex-based coercion rewrote the "hi" inside the string literal too,
    // producing invalid SQL that failed at the database instead of matching by name.
    await runStatements(databaseUrl, [
      `INSERT INTO ${FIXTURE.table} (name, email) VALUES ('he said "hi" loudly', 'quote-test@example.com')`
    ]);
    try {
      const result = await adapter.runReadOnlyQuery(
        `SELECT * FROM ${FIXTURE.table} WHERE name = 'he said "hi" loudly'`
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await runStatements(databaseUrl, [
        `DELETE FROM ${FIXTURE.table} WHERE email = 'quote-test@example.com'`
      ]);
    }
  });

  it("resolves a schema-qualified, double-quoted table reference (F020 regression)", async () => {
    // Previously: "public" wasn't in knownIdentifiers (only table/column names were collected),
    // so the schema name itself got coerced into a string literal, breaking the query.
    const result = await adapter.runReadOnlyQuery(
      `SELECT * FROM "${FIXTURE.schema}"."${FIXTURE.table}"`
    );
    expect(result.rows).toHaveLength(FIXTURE.rowCount);
  });

  it("resolves a double-quoted reference to a query-local column alias (F020 regression)", async () => {
    // Previously: "total" isn't a real column anywhere, so it got coerced to a string literal,
    // breaking a query that legitimately refers back to its own subquery alias.
    const result = await adapter.runReadOnlyQuery(
      `SELECT "total" FROM (SELECT COUNT(*) AS total FROM ${FIXTURE.table}) counts`
    );
    expect(result.columns).toEqual(["total"]);
    expect(Number(result.rows[0]?.total)).toBe(FIXTURE.rowCount);
  });

  it("rejects a writable CTE end to end and does not actually delete anything", async () => {
    const before = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);

    await expect(
      adapter.runReadOnlyQuery(
        `WITH deleted AS (DELETE FROM ${FIXTURE.table} RETURNING *) SELECT * FROM deleted`
      )
    ).rejects.toThrow();

    const after = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);
    expect(after.rows).toHaveLength(before.rows.length);
  });

  it("blocks a write hidden inside a function call, which no string check can detect", async () => {
    // assertReadOnly's keyword scan cannot catch this: the SQL text is a plain SELECT with a
    // function name that doesn't contain any forbidden keyword as a whole word. Only the
    // READ ONLY transaction (Postgres's own enforcement) can stop it - this test exists
    // specifically to prove that backstop independently of the string-check layer.
    await runStatements(databaseUrl, [
      `CREATE OR REPLACE FUNCTION qyre_test_wipe() RETURNS void AS $$
         BEGIN
           DELETE FROM ${FIXTURE.table};
         END;
       $$ LANGUAGE plpgsql`
    ]);

    try {
      await expect(adapter.runReadOnlyQuery("SELECT qyre_test_wipe()")).rejects.toThrow();

      const after = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);
      expect(after.rows.length).toBeGreaterThan(0);
    } finally {
      await runStatements(databaseUrl, ["DROP FUNCTION IF EXISTS qyre_test_wipe()"]);
    }
  });

  it("survives an idle pooled connection being dropped by the database", async () => {
    // Reproduces a real crash: node-postgres's Pool emits an unhandled "error" event when an
    // idle client's connection is severed server-side (restart, network blip, admin kill) -
    // exactly what happens when the database becomes unreachable while Qyre is running. Without
    // a pool.on("error", ...) listener, that event crashes the whole Node process instead of
    // /api/health ever getting a chance to report "disconnected".
    await adapter.ping(); // ensure a client is checked into the pool

    const admin = new Pool({ connectionString: databaseUrl });
    try {
      const { rows } = await admin.query<{ pid: number }>(
        `SELECT pid FROM pg_stat_activity
         WHERE datname = current_database() AND state = 'idle' AND pid <> pg_backend_pid()
         ORDER BY pid DESC LIMIT 1`
      );
      const pid = rows[0]?.pid;
      expect(pid).toBeDefined();
      await admin.query("SELECT pg_terminate_backend($1)", [pid]);
    } finally {
      await admin.end();
    }

    // Give the pool's "error" event a tick to fire. If it's unhandled, the test process crashes
    // here rather than this assertion ever running.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await adapter.ping()).toBe(true);
  });

  it("routes a pool error through onConnectionEvent when set, instead of only console.error (F028)", async () => {
    const events: Array<{ level: string; message: string }> = [];
    adapter.onConnectionEvent = (level, message) => events.push({ level, message });

    try {
      await adapter.ping();

      const admin = new Pool({ connectionString: databaseUrl });
      try {
        const { rows } = await admin.query<{ pid: number }>(
          `SELECT pid FROM pg_stat_activity
           WHERE datname = current_database() AND state = 'idle' AND pid <> pg_backend_pid()
           ORDER BY pid DESC LIMIT 1`
        );
        const pid = rows[0]?.pid;
        expect(pid).toBeDefined();
        await admin.query("SELECT pg_terminate_backend($1)", [pid]);
      } finally {
        await admin.end();
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(events).toEqual([
        { level: "error", message: expect.stringContaining("Postgres pool error") }
      ]);
    } finally {
      adapter.onConnectionEvent = undefined;
    }
  });

  it("aborts a runaway query once it exceeds the configured statement timeout (F032)", async () => {
    // A dedicated adapter/pool with a tiny timeout (via QYRE_STATEMENT_TIMEOUT_MS, read at
    // connect() time) proves the mechanism fires without waiting out the real 30s default.
    process.env.QYRE_STATEMENT_TIMEOUT_MS = "200";
    const shortTimeoutAdapter = new PostgresAdapter({ engine: "postgres", raw: databaseUrl });
    try {
      await shortTimeoutAdapter.connect();
      await expect(shortTimeoutAdapter.runReadOnlyQuery("SELECT pg_sleep(2)")).rejects.toThrow(
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
      const slowQuery = adapter.runReadOnlyQuery("SELECT pg_sleep(5)", operationId);
      // Give the query time to register its cancel callback and actually start on the server -
      // registration happens synchronously before the slow query itself runs, but this still
      // guards against a flaky race on a loaded CI runner.
      await expect.poll(() => callbacks.has(operationId), { timeout: 2000 }).toBe(true);

      await callbacks.get(operationId)?.();
      await expect(slowQuery).rejects.toMatchObject({ name: "OperationCancelledError" });

      // The pool itself is untouched - a fresh query on the same adapter still works.
      expect(await adapter.ping()).toBe(true);
    } finally {
      adapter.operationRegistry = undefined;
    }
  });

  it("does not report a plain statement-timeout expiry as a user cancellation (F126 regression, F032)", async () => {
    // The exact same 57014 SQLSTATE Postgres uses for pg_cancel_backend() is also what
    // statement_timeout reports on its own - only wasCancelledByUser() (set solely when this
    // adapter's own registry callback runs) may distinguish them. Reproduces F032's timeout path
    // with a registry attached (unlike the plain F032 test above) to prove it still throws the
    // *timeout* error, not OperationCancelledError, when nothing actually called cancel().
    process.env.QYRE_STATEMENT_TIMEOUT_MS = "200";
    const shortTimeoutAdapter = new PostgresAdapter({ engine: "postgres", raw: databaseUrl });
    shortTimeoutAdapter.operationRegistry = { register: () => {}, unregister: () => {} };
    try {
      await shortTimeoutAdapter.connect();
      await expect(
        shortTimeoutAdapter.runReadOnlyQuery("SELECT pg_sleep(2)", "f126-timeout-test")
      ).rejects.not.toMatchObject({ name: "OperationCancelledError" });
    } finally {
      delete process.env.QYRE_STATEMENT_TIMEOUT_MS;
      await shortTimeoutAdapter.disconnect();
    }
  });
});
