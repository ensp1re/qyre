/**
 * Integration tests for {@link PostgresAdapter} against a real Postgres database.
 *
 * Requires HUMB_TEST_DATABASE_URL (see docs/RELIABILITY.md). We never silently skip required
 * verification: a missing env var fails these tests with an actionable message instead of passing
 * trivially.
 */
import { FIXTURE, requireTestDatabaseUrl, runStatements, setupFixture } from "@humb/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAdapter } from "./index.js";

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
      "DROP TABLE IF EXISTS humb_test_orders",
      `CREATE TABLE humb_test_orders (
         id serial PRIMARY KEY,
         user_id integer NOT NULL REFERENCES ${FIXTURE.table}(id),
         total numeric(10,2) NOT NULL
       )`
    ]);

    try {
      const table = await adapter.getTable(FIXTURE.schema, "humb_test_orders");
      expect(table.columns.find((column) => column.name === "user_id")?.isForeignKey).toBe(true);
      expect(table.columns.find((column) => column.name === "total")?.isForeignKey).toBe(false);
    } finally {
      await runStatements(databaseUrl, ["DROP TABLE IF EXISTS humb_test_orders"]);
    }
  });

  it("returns a page of rows", async () => {
    const page = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);
    expect(page.rows).toHaveLength(FIXTURE.rowCount);
    expect(page.columns).toEqual(expect.arrayContaining(["id", "name", "email"]));
  });

  it("runs a read-only query", async () => {
    const result = await adapter.runReadOnlyQuery(`SELECT * FROM ${FIXTURE.table}`);
    expect(result.rows).toHaveLength(FIXTURE.rowCount);
  });

  it("rejects a mutating query", async () => {
    await expect(adapter.runReadOnlyQuery(`DELETE FROM ${FIXTURE.table}`)).rejects.toThrow();
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
      `CREATE OR REPLACE FUNCTION humb_test_wipe() RETURNS void AS $$
         BEGIN
           DELETE FROM ${FIXTURE.table};
         END;
       $$ LANGUAGE plpgsql`
    ]);

    try {
      await expect(adapter.runReadOnlyQuery("SELECT humb_test_wipe()")).rejects.toThrow();

      const after = await adapter.getRows(FIXTURE.schema, FIXTURE.table, 0, 10);
      expect(after.rows.length).toBeGreaterThan(0);
    } finally {
      await runStatements(databaseUrl, ["DROP FUNCTION IF EXISTS humb_test_wipe()"]);
    }
  });

  it("survives an idle pooled connection being dropped by the database", async () => {
    // Reproduces a real crash: node-postgres's Pool emits an unhandled "error" event when an
    // idle client's connection is severed server-side (restart, network blip, admin kill) -
    // exactly what happens when the database becomes unreachable while Humb is running. Without
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
});
