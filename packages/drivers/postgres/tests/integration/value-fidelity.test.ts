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
});
