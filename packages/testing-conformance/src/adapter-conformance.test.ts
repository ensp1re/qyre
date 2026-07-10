/**
 * Shared parametrized adapter-conformance suite (F054): the same pagination-clamping and
 * empty-collection assertions run against every engine that has its `QYRE_TEST_*` env var set, so
 * a future engine can't silently diverge in behavior from the others - the class of bug F019
 * already fixed once for column-type fidelity, but for pagination/empty-handling specifically.
 *
 * Each engine's *setup* (creating a fixture table/collection) is necessarily engine-specific - the
 * DDL/API differs - but the *assertions* are written once and shared. Read-only rejection and
 * bigint/date fidelity are deliberately not duplicated here: every SQL adapter's `runReadOnlyQuery`
 * already shares the exact same `assertReadOnly` call (conformant by construction, see
 * `@qyre/driver-contract`), and each engine's own integration test file already covers bigint/date
 * fidelity against fixtures too engine-specific to usefully generalize (F019's
 * `column-type-fidelity.md`).
 *
 * Each engine skips gracefully (not silently - see the console.warn) when its env var is unset,
 * distinct from that engine's own integration test file, which fails loudly - this file's purpose
 * is cross-engine consistency, not gating whether that one engine's own suite ran.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseEngine } from "@qyre/core";
import type { AdapterFactory, DatabaseAdapter } from "@qyre/driver-contract";
import { mongodbAdapterFactory } from "@qyre/mongodb";
import { mysqlAdapterFactory } from "@qyre/mysql";
import { postgresAdapterFactory } from "@qyre/postgres";
import { sqliteAdapterFactory } from "@qyre/sqlite";
import Database from "better-sqlite3";
import { MongoClient } from "mongodb";
import mysql from "mysql2/promise";
import { Pool } from "pg";
import { TEST_DB_ENV, TEST_MONGO_ENV, TEST_MYSQL_ENV } from "@qyre/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface ConformanceFixture {
  /** The `schema`/`database` argument getTable/getRows expect for this engine. */
  schema: string;
  /** A table/collection with exactly this many rows. */
  populatedTable: string;
  populatedRowCount: number;
  /** A table/collection with zero rows. */
  emptyTable: string;
  /** A read-only view (a MongoDB view for that engine) over `populatedTable` (F124). */
  viewTable: string;
}

interface EngineCase {
  name: string;
  envVar: string;
  factory: AdapterFactory;
  engine: DatabaseEngine;
  /** Creates the populated/empty fixtures and returns their identifiers, or undefined to skip. */
  setup: () => Promise<
    { raw: string; fixture: ConformanceFixture; teardown: () => Promise<void> } | undefined
  >;
}

const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
const populatedTable = `qyre_conformance_${suffix}`;
const emptyTable = `qyre_conformance_empty_${suffix}`;
const viewTable = `qyre_conformance_view_${suffix}`;

const cases: EngineCase[] = [
  {
    name: "postgres",
    envVar: TEST_DB_ENV,
    factory: postgresAdapterFactory,
    engine: "postgres",
    setup: async () => {
      const raw = process.env[TEST_DB_ENV]?.trim();
      if (!raw) return undefined;
      const pool = new Pool({ connectionString: raw });
      // label is nullable text (F072 fixture: one NULL row, "apple"/"banana" so contains/isNull/
      // isNotNull have something real to filter on, not just the numeric n column).
      await pool.query(`CREATE TABLE ${populatedTable} (id serial PRIMARY KEY, n int, label text)`);
      await pool.query(
        `INSERT INTO ${populatedTable} (n, label) VALUES (1, 'apple'), (2, 'banana'), (3, NULL)`
      );
      await pool.query(`CREATE TABLE ${emptyTable} (id serial PRIMARY KEY, n int, label text)`);
      await pool.query(`CREATE VIEW ${viewTable} AS SELECT * FROM ${populatedTable}`);
      return {
        raw,
        fixture: { schema: "public", populatedTable, populatedRowCount: 3, emptyTable, viewTable },
        teardown: async () => {
          await pool.query(`DROP VIEW IF EXISTS ${viewTable}`);
          await pool.query(`DROP TABLE IF EXISTS ${populatedTable}`);
          await pool.query(`DROP TABLE IF EXISTS ${emptyTable}`);
          await pool.end();
        }
      };
    }
  },
  {
    name: "mysql",
    envVar: TEST_MYSQL_ENV,
    factory: mysqlAdapterFactory,
    engine: "mysql",
    setup: async () => {
      const raw = process.env[TEST_MYSQL_ENV]?.trim();
      if (!raw) return undefined;
      const databaseName = new URL(raw).pathname.slice(1);
      const pool = mysql.createPool(raw);
      await pool.query(
        `CREATE TABLE ${populatedTable} (id INT AUTO_INCREMENT PRIMARY KEY, n INT, label VARCHAR(50))`
      );
      await pool.query(
        `INSERT INTO ${populatedTable} (n, label) VALUES (1, 'apple'), (2, 'banana'), (3, NULL)`
      );
      await pool.query(
        `CREATE TABLE ${emptyTable} (id INT AUTO_INCREMENT PRIMARY KEY, n INT, label VARCHAR(50))`
      );
      await pool.query(`CREATE VIEW ${viewTable} AS SELECT * FROM ${populatedTable}`);
      return {
        raw,
        fixture: {
          schema: databaseName,
          populatedTable,
          populatedRowCount: 3,
          emptyTable,
          viewTable
        },
        teardown: async () => {
          await pool.query(`DROP VIEW IF EXISTS ${viewTable}`);
          await pool.query(`DROP TABLE IF EXISTS ${populatedTable}`);
          await pool.query(`DROP TABLE IF EXISTS ${emptyTable}`);
          await pool.end();
        }
      };
    }
  },
  {
    name: "sqlite",
    envVar: "", // self-contained, no env var needed
    factory: sqliteAdapterFactory,
    engine: "sqlite",
    setup: async () => {
      const dir = mkdtempSync(join(tmpdir(), "qyre-conformance-"));
      const dbPath = join(dir, "fixture.db");
      const db = new Database(dbPath);
      db.exec(`CREATE TABLE ${populatedTable} (id INTEGER PRIMARY KEY, n INTEGER, label TEXT)`);
      db.exec(
        `INSERT INTO ${populatedTable} (n, label) VALUES (1, 'apple'), (2, 'banana'), (3, NULL)`
      );
      db.exec(`CREATE TABLE ${emptyTable} (id INTEGER PRIMARY KEY, n INTEGER, label TEXT)`);
      db.exec(`CREATE VIEW ${viewTable} AS SELECT * FROM ${populatedTable}`);
      db.close();
      return {
        raw: dbPath,
        fixture: { schema: "main", populatedTable, populatedRowCount: 3, emptyTable, viewTable },
        teardown: async () => {}
      };
    }
  },
  {
    name: "mongodb",
    envVar: TEST_MONGO_ENV,
    factory: mongodbAdapterFactory,
    engine: "mongodb",
    setup: async () => {
      const raw = process.env[TEST_MONGO_ENV]?.trim();
      if (!raw) return undefined;
      const databaseName = new URL(raw).pathname.slice(1) || "qyre_test";
      const client = new MongoClient(raw);
      await client.connect();
      const db = client.db(databaseName);
      await db.collection(populatedTable).insertMany([
        { n: 1, label: "apple" },
        { n: 2, label: "banana" },
        { n: 3, label: null }
      ]);
      await db.createCollection(emptyTable);
      await db.createCollection(viewTable, { viewOn: populatedTable, pipeline: [] });
      return {
        raw,
        fixture: {
          schema: databaseName,
          populatedTable,
          populatedRowCount: 3,
          emptyTable,
          viewTable
        },
        teardown: async () => {
          await db.collection(viewTable).drop();
          await db.collection(populatedTable).drop();
          await db.collection(emptyTable).drop();
          await client.close();
        }
      };
    }
  }
];

describe.each(cases)("adapter conformance: $name", ({ name, envVar, factory, engine, setup }) => {
  // Known synchronously (before any test runs) so it.skipIf can mark unconfigured engines as
  // properly SKIPPED in the report, rather than a bare early-return making them look like a
  // passing test that asserted nothing.
  const configured = envVar === "" || Boolean(process.env[envVar]?.trim());
  if (!configured) {
    console.warn(`Skipping adapter-conformance suite for ${name}: ${envVar} is not set.`);
  }

  let adapter: DatabaseAdapter;
  let fixture: ConformanceFixture;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    if (!configured) return;
    const result = await setup();
    if (!result) throw new Error(`${name}: setup() unexpectedly returned undefined`);
    fixture = result.fixture;
    teardown = result.teardown;
    adapter = factory.create({ engine, raw: result.raw });
    await adapter.connect();
  });

  afterAll(async () => {
    await adapter?.disconnect();
    await teardown?.();
  });

  it.skipIf(!configured)(
    "reports a well-formed capabilities object (F091, F092, F093)",
    async () => {
      const capabilities = await adapter.getCapabilities();
      expect(capabilities.supportsSql).toBe(engine !== "mongodb");
      if (engine === "postgres" || engine === "mysql") {
        // The conformance Postgres/MySQL fixtures connect as the Docker/CI superuser/root. F092/F093
        // replace their F091 stubs with real session facts, so every capability is available here.
        expect(capabilities).toMatchObject({
          supportsRowMutations: true,
          supportsDdl: true,
          supportsIndexManagement: true,
          supportsDatabaseManagement: true,
          supportsTransactions: true,
          readOnlyReason: null
        });
      } else {
        // F094/F095 have not replaced their conservative F091 stubs yet.
        expect(capabilities.supportsRowMutations).toBe(false);
        expect(capabilities.supportsDdl).toBe(false);
        expect(capabilities.supportsIndexManagement).toBe(false);
        expect(capabilities.supportsDatabaseManagement).toBe(false);
        expect(capabilities.supportsTransactions).toBe(false);
        expect(capabilities.readOnlyReason).toBe("grants");
      }
    }
  );

  it.skipIf(!configured)(
    "getAllTables() returns the same shape as N x getTable() (F123)",
    async () => {
      const batched = await adapter.getAllTables();
      const populated = batched.find(
        (table) => table.schema === fixture.schema && table.name === fixture.populatedTable
      );
      const empty = batched.find(
        (table) => table.schema === fixture.schema && table.name === fixture.emptyTable
      );
      expect(populated).toEqual(await adapter.getTable(fixture.schema, fixture.populatedTable));
      expect(empty).toEqual(await adapter.getTable(fixture.schema, fixture.emptyTable));
    }
  );

  it.skipIf(!configured)(
    "reports kind correctly for a table/collection vs. a view (F124)",
    async () => {
      const baseKind = engine === "mongodb" ? "collection" : "table";
      const populated = await adapter.getTable(fixture.schema, fixture.populatedTable);
      expect(populated.kind).toBe(baseKind);

      const view = await adapter.getTable(fixture.schema, fixture.viewTable);
      expect(view.kind).toBe("view");

      // Same via the batched path (F123 parity holds for kind too).
      const batched = await adapter.getAllTables();
      const batchedView = batched.find(
        (table) => table.schema === fixture.schema && table.name === fixture.viewTable
      );
      expect(batchedView?.kind).toBe("view");
    }
  );

  it.skipIf(!configured)(
    "clamps an oversized pageSize but only returns the rows that actually exist",
    async () => {
      const page = await adapter.getRows(fixture.schema, fixture.populatedTable, 0, 10_000);
      expect(page.pageSize).toBe(200); // MAX_PAGE_SIZE
      expect(page.rows).toHaveLength(fixture.populatedRowCount);
    }
  );

  it.skipIf(!configured)("clamps a zero/negative pageSize up to at least 1", async () => {
    const page = await adapter.getRows(fixture.schema, fixture.populatedTable, 0, 0);
    expect(page.pageSize).toBe(1);
    expect(page.rows).toHaveLength(1);
  });

  it.skipIf(!configured)("clamps a negative page to 0", async () => {
    const page = await adapter.getRows(fixture.schema, fixture.populatedTable, -5, 10);
    expect(page.page).toBe(0);
    expect(page.rows).toHaveLength(fixture.populatedRowCount);
  });

  it.skipIf(!configured)(
    "returns an empty rows array (not an error) for an empty table/collection",
    async () => {
      const page = await adapter.getRows(fixture.schema, fixture.emptyTable, 0, 10);
      expect(page.rows).toEqual([]);
    }
  );

  it.skipIf(!configured)(
    "getTable on an empty table/collection succeeds with a zero row count",
    async () => {
      const table = await adapter.getTable(fixture.schema, fixture.emptyTable);
      expect(table.rowCount).toBe(0);
    }
  );

  it.skipIf(!configured)(
    "sorts rows by a given column and direction identically (F065)",
    async () => {
      const ascending = await adapter.getRows(fixture.schema, fixture.populatedTable, 0, 10, {
        column: "n",
        direction: "asc"
      });
      expect(ascending.rows.map((row) => Number(row.n))).toEqual([1, 2, 3]);

      const descending = await adapter.getRows(fixture.schema, fixture.populatedTable, 0, 10, {
        column: "n",
        direction: "desc"
      });
      expect(descending.rows.map((row) => Number(row.n))).toEqual([3, 2, 1]);
    }
  );

  it.skipIf(!configured)("filters rows with eq/neq identically (F072)", async () => {
    const eq = await adapter.getRows(fixture.schema, fixture.populatedTable, 0, 10, undefined, [
      { column: "n", op: "eq", value: "2" }
    ]);
    expect(eq.rows.map((row) => Number(row.n))).toEqual([2]);

    const neq = await adapter.getRows(fixture.schema, fixture.populatedTable, 0, 10, undefined, [
      { column: "n", op: "neq", value: "2" }
    ]);
    expect(neq.rows.map((row) => Number(row.n)).sort()).toEqual([1, 3]);
  });

  it.skipIf(!configured)(
    "combines two filters on the same column with AND, not last-write-wins (F072)",
    async () => {
      const page = await adapter.getRows(fixture.schema, fixture.populatedTable, 0, 10, undefined, [
        { column: "n", op: "gt", value: "1" },
        { column: "n", op: "lte", value: "2" }
      ]);
      expect(page.rows.map((row) => Number(row.n))).toEqual([2]);
    }
  );

  it.skipIf(!configured)("filters rows with contains, case-insensitively (F072)", async () => {
    const page = await adapter.getRows(fixture.schema, fixture.populatedTable, 0, 10, undefined, [
      { column: "label", op: "contains", value: "AN" }
    ]);
    expect(page.rows.map((row) => row.label)).toEqual(["banana"]);
  });

  it.skipIf(!configured)("filters rows with isNull/isNotNull identically (F072)", async () => {
    const nullPage = await adapter.getRows(
      fixture.schema,
      fixture.populatedTable,
      0,
      10,
      undefined,
      [{ column: "label", op: "isNull" }]
    );
    expect(nullPage.rows).toHaveLength(1);

    const notNullPage = await adapter.getRows(
      fixture.schema,
      fixture.populatedTable,
      0,
      10,
      undefined,
      [{ column: "label", op: "isNotNull" }]
    );
    expect(notNullPage.rows).toHaveLength(2);
  });
});
