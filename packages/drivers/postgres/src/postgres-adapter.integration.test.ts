/**
 * Integration tests for {@link PostgresAdapter} against a real Postgres database.
 *
 * Requires HUMB_TEST_DATABASE_URL (see docs/RELIABILITY.md). We never silently skip required
 * verification: a missing env var fails these tests with an actionable message instead of passing
 * trivially.
 */
import { FIXTURE, requireTestDatabaseUrl, runStatements, setupFixture } from "@humb/testing";
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
    expect(table.columns.find((column) => column.name === "id")?.isPrimaryKey).toBe(true);

    const primaryIndex = table.indexes?.find((index) => index.primary);
    expect(primaryIndex).toBeDefined();
    expect(primaryIndex?.columns).toEqual(["id"]);
    expect(primaryIndex?.unique).toBe(true);

    expect(table.rowCount).toBeGreaterThanOrEqual(0);
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
});
