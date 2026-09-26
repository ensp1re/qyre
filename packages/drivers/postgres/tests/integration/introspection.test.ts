import { randomUUID } from "node:crypto";
import { requireTestDatabaseUrl } from "@qyre/testing";
import { runStatements } from "@qyre/testing/postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAdapter } from "../../src/index.js";

const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
const schemaA = `qyre_intro_a_${suffix}`;
const schemaB = `qyre_intro_b_${suffix}`;

describe("PostgresAdapter introspection", () => {
  let adapter: PostgresAdapter;
  let databaseUrl: string;

  beforeAll(async () => {
    databaseUrl = requireTestDatabaseUrl();
    await runStatements(databaseUrl, [`CREATE SCHEMA ${schemaA}`, `CREATE SCHEMA ${schemaB}`]);
    adapter = new PostgresAdapter({ engine: "postgres", raw: databaseUrl });
    await adapter.connect();
  });

  afterAll(async () => {
    await adapter?.disconnect();
    await runStatements(databaseUrl, [
      `DROP SCHEMA IF EXISTS ${schemaA} CASCADE`,
      `DROP SCHEMA IF EXISTS ${schemaB} CASCADE`
    ]);
  });

  it("pairs composite foreign-key columns with their referenced columns by position", async () => {
    await runStatements(databaseUrl, [
      `CREATE TABLE ${schemaA}.parent (x integer, y integer, PRIMARY KEY (x, y))`,
      `CREATE TABLE ${schemaA}.child (
         id integer PRIMARY KEY,
         a integer,
         b integer,
         CONSTRAINT child_parent_fk FOREIGN KEY (a, b) REFERENCES ${schemaA}.parent (x, y)
       )`
    ]);
    const expected = {
      a: { schema: schemaA, table: "parent", column: "x" },
      b: { schema: schemaA, table: "parent", column: "y" }
    };

    const single = await adapter.getTable(schemaA, "child");
    const batched = (await adapter.getAllTables()).find(
      (table) => table.schema === schemaA && table.name === "child"
    );
    for (const table of [single, batched]) {
      expect(table?.columns.find((column) => column.name === "a")?.references).toEqual(expected.a);
      expect(table?.columns.find((column) => column.name === "b")?.references).toEqual(expected.b);
    }
    expect(
      (await adapter.getTable(schemaA, "parent")).columns.filter((column) => column.isPrimaryKey)
    ).toHaveLength(2);
  });

  it("keeps foreign keys that share a constraint name on different tables apart", async () => {
    await runStatements(databaseUrl, [
      `CREATE TABLE ${schemaA}.users (id integer PRIMARY KEY)`,
      `CREATE TABLE ${schemaB}.accounts (id integer PRIMARY KEY)`,
      `CREATE TABLE ${schemaA}.posts (
         id integer PRIMARY KEY,
         owner_id integer CONSTRAINT fk_user REFERENCES ${schemaA}.users (id)
       )`,
      `CREATE TABLE ${schemaB}.posts (
         id integer PRIMARY KEY,
         owner_id integer CONSTRAINT fk_user REFERENCES ${schemaB}.accounts (id)
       )`,
      `CREATE TABLE ${schemaA}.comments (
         id integer PRIMARY KEY,
         owner_id integer CONSTRAINT fk_owner REFERENCES ${schemaB}.accounts (id)
       )`,
      `CREATE TABLE ${schemaA}.likes (
         id integer PRIMARY KEY,
         owner_id integer CONSTRAINT fk_owner REFERENCES ${schemaA}.users (id)
       )`
    ]);
    const expectations = [
      [schemaA, "posts", { schema: schemaA, table: "users", column: "id" }],
      [schemaB, "posts", { schema: schemaB, table: "accounts", column: "id" }],
      [schemaA, "comments", { schema: schemaB, table: "accounts", column: "id" }],
      [schemaA, "likes", { schema: schemaA, table: "users", column: "id" }]
    ] as const;

    const all = await adapter.getAllTables();
    for (const [schema, name, reference] of expectations) {
      const single = await adapter.getTable(schema, name);
      const batched = all.find((table) => table.schema === schema && table.name === name);
      for (const table of [single, batched]) {
        const ownerId = table?.columns.find((column) => column.name === "owner_id");
        expect(ownerId?.isForeignKey).toBe(true);
        expect(ownerId?.references).toEqual(reference);
      }
    }
  });

  describe("row counts the connected user cannot read", () => {
    const role = `qyre_insert_only_${suffix}`;
    const password = randomUUID();
    let restricted: PostgresAdapter;

    beforeAll(async () => {
      const database = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
      await runStatements(databaseUrl, [
        `CREATE TABLE ${schemaA}.readable (id integer PRIMARY KEY)`,
        `CREATE TABLE ${schemaA}.write_only (id integer PRIMARY KEY, note text)`,
        `CREATE MATERIALIZED VIEW ${schemaA}.unpopulated AS SELECT 1 AS id WITH NO DATA`,
        `CREATE ROLE ${role} LOGIN PASSWORD '${password}'`,
        `GRANT CONNECT ON DATABASE "${database.replace(/"/g, '""')}" TO ${role}`,
        `GRANT USAGE ON SCHEMA ${schemaA} TO ${role}`,
        `GRANT SELECT ON ${schemaA}.readable TO ${role}`,
        `GRANT INSERT ON ${schemaA}.write_only TO ${role}`
      ]);
      const url = new URL(databaseUrl);
      url.username = role;
      url.password = password;
      restricted = new PostgresAdapter({ engine: "postgres", raw: url.toString() });
      await restricted.connect();
    });

    afterAll(async () => {
      await restricted?.disconnect();
      await runStatements(databaseUrl, [`DROP OWNED BY ${role}`, `DROP ROLE IF EXISTS ${role}`]);
    });

    it("reports an unknown count instead of failing getAllTables and getTable", async () => {
      const tables = await restricted.getAllTables();
      const byName = (name: string) =>
        tables.find((table) => table.schema === schemaA && table.name === name);
      expect(byName("readable")?.rowCount).toBe(0);
      expect(byName("write_only")).toBeDefined();
      expect(byName("write_only")?.rowCount).toBeUndefined();

      const writeOnly = await restricted.getTable(schemaA, "write_only");
      expect(writeOnly.rowCount).toBeUndefined();
      expect(writeOnly.permissions).toMatchObject({ select: false, insert: true });
    });

    it("reports an unknown count for an unpopulated materialized view", async () => {
      const unpopulated = (await adapter.getAllTables()).find(
        (table) => table.schema === schemaA && table.name === "unpopulated"
      );
      expect(unpopulated?.kind).toBe("materialized-view");
      expect(unpopulated?.rowCount).toBeUndefined();
      await expect(adapter.getTable(schemaA, "unpopulated")).resolves.toMatchObject({
        kind: "materialized-view",
        rowCount: undefined
      });
    });
  });

  it("offers only safe filters on enums whose names look like text or set types", async () => {
    await runStatements(databaseUrl, [
      `CREATE TYPE ${schemaA}.status_enum AS ENUM ('draft', 'published')`,
      `CREATE TYPE ${schemaA}.charset AS ENUM ('utf8', 'latin1')`,
      `CREATE TABLE ${schemaA}.documents (
         id integer PRIMARY KEY,
         status ${schemaA}.status_enum NOT NULL,
         encoding ${schemaA}.charset NOT NULL
       )`,
      `INSERT INTO ${schemaA}.documents VALUES (1, 'draft', 'utf8'), (2, 'published', 'latin1')`
    ]);
    const table = await adapter.getTable(schemaA, "documents");
    const status = table.columns.find((column) => column.name === "status");
    const encoding = table.columns.find((column) => column.name === "encoding");
    expect(status?.allowedValues).toEqual(["draft", "published"]);
    expect(encoding?.allowedValues).toEqual(["utf8", "latin1"]);

    const page = await adapter.getRows(schemaA, "documents", 0, 10, undefined, [
      { column: "status", op: "contains", value: "PUB", columnDataType: status?.dataType },
      { column: "encoding", op: "contains", value: "lat", columnDataType: encoding?.dataType }
    ]);
    expect(page.rows.map((row) => row.id)).toEqual([2]);
  });
});
