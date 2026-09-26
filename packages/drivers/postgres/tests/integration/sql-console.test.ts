import { randomUUID } from "node:crypto";
import { requireTestDatabaseUrl } from "@qyre/testing";
import { runStatements } from "@qyre/testing/postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAdapter } from "../../src/index.js";
import { querySingleStatement } from "../../src/runtime/single-statement.js";

const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
const table = `qyre_console_${suffix}`;
const view = `qyre_console_mv_${suffix}`;

describe("Postgres SQL console", () => {
  let adapter: PostgresAdapter;
  let databaseUrl: string;

  beforeAll(async () => {
    databaseUrl = requireTestDatabaseUrl();
    await runStatements(databaseUrl, [
      `CREATE TABLE ${table} (id int PRIMARY KEY, name text)`,
      `INSERT INTO ${table} VALUES (1, 'Ada'), (2, 'Grace')`,
      `CREATE MATERIALIZED VIEW ${view} AS SELECT id, name AS "Display Name" FROM ${table}`
    ]);
    adapter = new PostgresAdapter({ engine: "postgres", raw: databaseUrl });
    await adapter.connect();
  });

  afterAll(async () => {
    await adapter?.disconnect();
    await runStatements(databaseUrl, [
      `DROP MATERIALIZED VIEW IF EXISTS ${view}`,
      `DROP TABLE IF EXISTS ${table}`
    ]);
  });

  it("refuses a multi-statement string on the read path even without the classifier", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const client = await pool.connect();
    try {
      await expect(querySingleStatement(client, `SELECT 1; DELETE FROM ${table}`)).rejects.toThrow(
        /multiple commands/i
      );
    } finally {
      client.release();
      await pool.end();
    }
    const rows = await adapter.getRows("public", table, 0, 10);
    expect(rows.rows).toHaveLength(2);
  });

  it("keeps double-quoted aliases, bare aliases, and catalog identifiers as identifiers", async () => {
    const aliased = await adapter.runReadOnlyQuery(
      `SELECT "u".name AS "Full Name" FROM ${table} "u" WHERE "u".id = 1`
    );
    expect(aliased.columns).toEqual(["Full Name"]);
    expect(aliased.rows).toEqual([{ "Full Name": "Ada" }]);

    const catalog = await adapter.runReadOnlyQuery(
      `SELECT relname FROM pg_catalog."pg_class" WHERE relname = '${table}'`
    );
    expect(catalog.rows).toEqual([{ relname: table }]);
  });

  it("queries a double-quoted materialized view and its quoted columns", async () => {
    const page = await adapter.runReadOnlyQuery(
      `SELECT "Display Name" FROM "${view}" WHERE "Display Name" = "Grace"`
    );
    expect(page.rows).toEqual([{ "Display Name": "Grace" }]);
  });

  it("still coerces a double-quoted value in a comparison", async () => {
    const page = await adapter.runReadOnlyQuery(
      `SELECT id FROM ${table} WHERE name IN ("Ada", "Nobody") OR name = "Grace" ORDER BY id`
    );
    expect(page.rows).toEqual([{ id: 1 }, { id: 2 }]);
  });
});
