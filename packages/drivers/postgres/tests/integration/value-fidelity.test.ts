import { randomUUID } from "node:crypto";
import { requireTestDatabaseUrl } from "@qyre/testing";
import { runStatements } from "@qyre/testing/postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAdapter } from "../../src/index.js";

const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
const eventsTable = `qyre_tstz_${suffix}`;
const arraysTable = `qyre_arrays_${suffix}`;

async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const row of rows) collected.push(row);
  return collected;
}

describe("Postgres value fidelity", () => {
  let adapter: PostgresAdapter;
  let databaseUrl: string;

  beforeAll(async () => {
    databaseUrl = requireTestDatabaseUrl();
    await runStatements(databaseUrl, [
      `CREATE TABLE ${eventsTable} (at timestamptz PRIMARY KEY, label text, seen timestamptz[])`,
      `INSERT INTO ${eventsTable} VALUES
        ('2024-03-01 10:00:00.123456+00', 'first', ARRAY['2024-03-01 10:00:00.654321+00'::timestamptz]),
        ('2024-03-01 10:00:00.123457+00', 'second', NULL)`,
      `CREATE TABLE ${arraysTable} (
        id int PRIMARY KEY, ints int[], texts text[], grid int[][], docs jsonb[], doc jsonb, blobs bytea[]
      )`,
      `INSERT INTO ${arraysTable} VALUES (
        1, '{1,NULL,3}', ARRAY['a"b', 'c\\d', 'it''s', 'NULL', '{x,y}'], '{{1,2},{3,4}}',
        ARRAY['[1,2]'::jsonb, '{"k":"v"}'::jsonb], '[1,2]', ARRAY['\\x00ff'::bytea]
      )`
    ]);
    adapter = new PostgresAdapter({ engine: "postgres", raw: databaseUrl });
    await adapter.connect();
  });

  afterAll(async () => {
    await adapter?.disconnect();
    await runStatements(databaseUrl, [
      `DROP TABLE IF EXISTS ${eventsTable}`,
      `DROP TABLE IF EXISTS ${arraysTable}`
    ]);
  });

  it("returns timestamptz values and arrays as exact Postgres text", async () => {
    const page = await adapter.getRows("public", eventsTable, 0, 10, {
      column: "at",
      direction: "asc"
    });
    // The offset follows the session TimeZone; the fractional seconds must survive intact.
    expect(page.rows[0]?.at).toMatch(/^2024-03-01 \d{2}:00:00\.123456[+-]\d{2}/);
    expect(page.rows[0]?.seen).toEqual([
      expect.stringMatching(/^2024-03-01 \d{2}:00:00\.654321[+-]\d{2}/)
    ]);
  });

  it("updates and deletes a row keyed by a microsecond timestamptz", async () => {
    const page = await adapter.getRows("public", eventsTable, 0, 10, {
      column: "at",
      direction: "asc"
    });
    const [first, second] = page.rows;
    const updated = await adapter.mutations.updateRowByKey!(
      "public",
      eventsTable,
      { at: first?.at },
      { label: "edited" }
    );
    expect(updated.matched).toBe(1);

    const deleted = await adapter.mutations.deleteRowsByKey!("public", eventsTable, [
      { at: second?.at }
    ]);
    expect(deleted.deleted).toBe(1);

    const after = await adapter.getRows("public", eventsTable, 0, 10);
    expect(after.rows).toEqual([expect.objectContaining({ label: "edited" })]);
  });

  it("exports array columns as SQL that Postgres accepts and round-trips", async () => {
    const metadata = await adapter.getTable("public", arraysTable);
    const [row] = await collect(adapter.streamRows("public", arraysTable, metadata.columns));
    const insert = adapter.formatSqlInsert("public", arraysTable, metadata.columns, row!);

    await runStatements(databaseUrl, [`DELETE FROM ${arraysTable}`, insert]);

    const [roundTripped] = await collect(
      adapter.streamRows("public", arraysTable, metadata.columns)
    );
    expect(roundTripped).toEqual(row);
    expect(roundTripped).toMatchObject({
      ints: [1, null, 3],
      texts: ['a"b', "c\\d", "it's", "NULL", "{x,y}"],
      grid: [
        [1, 2],
        [3, 4]
      ],
      docs: [[1, 2], { k: "v" }],
      doc: [1, 2]
    });
  });

  it("returns ISO date/time and postgres-style interval text whatever the role's DateStyle", async () => {
    const role = `qyre_datestyle_${suffix}`;
    await runStatements(databaseUrl, [
      `CREATE ROLE ${role} LOGIN PASSWORD 'datestyle'`,
      `ALTER ROLE ${role} SET DateStyle = 'SQL, DMY'`,
      `ALTER ROLE ${role} SET IntervalStyle = 'sql_standard'`
    ]);
    const url = new URL(databaseUrl);
    url.username = role;
    url.password = "datestyle";
    const roleAdapter = new PostgresAdapter({ engine: "postgres", raw: url.toString() });
    try {
      await roleAdapter.connect();
      const page = await roleAdapter.runReadOnlyQuery(
        `SELECT '2024-01-02 03:04:05.5+00'::timestamptz AS at, '2024-01-02'::date AS day,
          '2024-01-02 03:04:05'::timestamp AS local, interval '1 day 2 hours' AS span,
          current_setting('DateStyle') AS style`
      );
      expect(page.rows[0]).toMatchObject({
        at: expect.stringMatching(/^2024-01-0[12] \d{2}:\d{2}:05\.5[+-]\d{2}/),
        day: "2024-01-02",
        local: "2024-01-02 03:04:05",
        span: "1 day 02:00:00",
        style: "ISO, DMY"
      });
    } finally {
      await roleAdapter.disconnect();
      await runStatements(databaseUrl, [`DROP ROLE IF EXISTS ${role}`]);
    }
  });
});
