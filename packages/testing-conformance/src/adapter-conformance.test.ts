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
    "reports a well-formed capabilities object (F091, F092, F093, F094, F095)",
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
      } else if (engine === "sqlite") {
        // The conformance SQLite fixture is a normal writable tempdir file, so F094's real
        // introspection reports full writability too - except supportsDatabaseManagement, which
        // SQLite has no concept of (the file itself is "the database"; unlike Postgres/MySQL's
        // CREATE DATABASE, there's no separate database-creation privilege to check).
        expect(capabilities).toMatchObject({
          supportsRowMutations: true,
          supportsDdl: true,
          supportsIndexManagement: true,
          supportsDatabaseManagement: false,
          supportsTransactions: true,
          readOnlyReason: null
        });
      } else {
        // The conformance MongoDB fixture connects with no authentication - the docker-compose/CI
        // container runs with no authorization enabled at all, so F095's real introspection reports
        // full access too (an unauthenticated connection has no access control applied, matching
        // mongod's own default) - except supportsDatabaseManagement/supportsTransactions, which
        // this slice doesn't model (see packages/drivers/mongodb/src/permissions.ts's top comment).
        expect(capabilities).toMatchObject({
          supportsRowMutations: true,
          supportsDdl: true,
          supportsIndexManagement: true,
          supportsDatabaseManagement: false,
          supportsTransactions: false,
          readOnlyReason: null
        });
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

  // Declared last in the block deliberately: it permanently adds a row to fixture.populatedTable,
  // which every row-count-sensitive assertion above (clamping, sorting, filtering) depends on
  // staying at exactly fixture.populatedRowCount - the fixture is dropped in afterAll right after,
  // so there's nothing to clean up here.
  it.skipIf(!configured)(
    "insertRow inserts a row that becomes visible via getRows (F099)",
    async () => {
      const result = await adapter.mutations?.insertRow?.(fixture.schema, fixture.populatedTable, {
        n: 99,
        label: "inserted"
      });
      expect(result?.row).toMatchObject({ n: 99, label: "inserted" });

      const page = await adapter.getRows(fixture.schema, fixture.populatedTable, 0, 10, undefined, [
        { column: "label", op: "eq", value: "inserted" }
      ]);
      expect(page.rows).toHaveLength(1);
    }
  );

  it.skipIf(!configured || engine === "mongodb")(
    "insertRow rejects a nonexistent column identifier instead of silently dropping it (F099)",
    async () => {
      await expect(
        adapter.mutations?.insertRow?.(fixture.schema, fixture.populatedTable, {
          this_column_does_not_exist: 1
        })
      ).rejects.toThrow();
    }
  );

  // MongoDB has no SQL query runner at all (supportsSql: false) - runQuery is absent there by
  // design, not a gap (F107, docs/product-specs/sql-editor.md's "Write-capable SQL execution").
  it.skipIf(!configured || engine === "mongodb")(
    "runQuery executes an INSERT directly and reports rowsAffected, visible via getRows (F107)",
    async () => {
      const result = await adapter.runQuery?.(
        `INSERT INTO ${fixture.populatedTable} (n, label) VALUES (42, 'conformance-run-query')`
      );
      expect(result).toEqual({ columns: [], rows: [], rowsAffected: 1 });

      const page = await adapter.getRows(fixture.schema, fixture.populatedTable, 0, 10, undefined, [
        { column: "label", op: "eq", value: "conformance-run-query" }
      ]);
      expect(page.rows).toHaveLength(1);
    }
  );

  it.skipIf(!configured)(
    "updateRowByKey updates a row by primary key, visible via getRows (F100)",
    async () => {
      const before = await adapter.getRows(
        fixture.schema,
        fixture.populatedTable,
        0,
        10,
        undefined,
        [{ column: "label", op: "eq", value: "apple" }]
      );
      const row = before.rows[0];
      const key = engine === "mongodb" ? { _id: String(row?._id) } : { id: row?.id };

      const result = await adapter.mutations?.updateRowByKey?.(
        fixture.schema,
        fixture.populatedTable,
        key,
        engine === "mongodb" ? { n: 1, label: "apricot" } : { label: "apricot" }
      );
      expect(result).toEqual({ matched: 1 });

      const after = await adapter.getRows(
        fixture.schema,
        fixture.populatedTable,
        0,
        10,
        undefined,
        [{ column: "label", op: "eq", value: "apricot" }]
      );
      expect(after.rows).toHaveLength(1);
    }
  );

  it.skipIf(!configured)(
    "updateRowByKey reports matched: 0 for a key that doesn't match any row (F100)",
    async () => {
      const key = engine === "mongodb" ? { _id: "507f1f77bcf86cd799439011" } : { id: -1 };
      const result = await adapter.mutations?.updateRowByKey?.(
        fixture.schema,
        fixture.populatedTable,
        key,
        engine === "mongodb" ? { n: 1, label: "nobody" } : { label: "nobody" }
      );
      expect(result).toEqual({ matched: 0 });
    }
  );

  it.skipIf(!configured)(
    "deleteRowsByKey deletes a row by primary key, no longer visible via getRows (F101)",
    async () => {
      const before = await adapter.getRows(
        fixture.schema,
        fixture.populatedTable,
        0,
        10,
        undefined,
        [{ column: "label", op: "eq", value: "banana" }]
      );
      const row = before.rows[0];
      const key = engine === "mongodb" ? { _id: String(row?._id) } : { id: row?.id };

      const result = await adapter.mutations?.deleteRowsByKey?.(
        fixture.schema,
        fixture.populatedTable,
        [key]
      );
      expect(result).toEqual({ deleted: 1 });

      const after = await adapter.getRows(
        fixture.schema,
        fixture.populatedTable,
        0,
        10,
        undefined,
        [{ column: "label", op: "eq", value: "banana" }]
      );
      expect(after.rows).toHaveLength(0);
    }
  );

  it.skipIf(!configured)(
    "deleteRowsByKey reports a lower deleted count when a key doesn't match any row (F101)",
    async () => {
      const key = engine === "mongodb" ? { _id: "507f1f77bcf86cd799439011" } : { id: -1 };
      const result = await adapter.mutations?.deleteRowsByKey?.(
        fixture.schema,
        fixture.populatedTable,
        [key]
      );
      expect(result).toEqual({ deleted: 0 });
    }
  );

  it.skipIf(!configured || engine === "mongodb")(
    "commitBatch commits a mixed insert/update/delete batch atomically (F102)",
    async () => {
      const inserted = await adapter.getRows(
        fixture.schema,
        fixture.populatedTable,
        0,
        10,
        undefined,
        [{ column: "label", op: "eq", value: "inserted" }]
      );
      const updateTarget = inserted.rows[0];
      const nullLabel = await adapter.getRows(
        fixture.schema,
        fixture.populatedTable,
        0,
        10,
        undefined,
        [{ column: "label", op: "isNull" }]
      );
      const deleteTarget = nullLabel.rows[0];

      const result = await adapter.mutations?.commitBatch?.([
        {
          type: "insert",
          schema: fixture.schema,
          table: fixture.populatedTable,
          values: { n: 100, label: "batch-inserted" }
        },
        {
          type: "update",
          schema: fixture.schema,
          table: fixture.populatedTable,
          key: { id: updateTarget?.id },
          changes: { label: "batch-updated" }
        },
        {
          type: "delete",
          schema: fixture.schema,
          table: fixture.populatedTable,
          keys: [{ id: deleteTarget?.id }]
        }
      ]);
      expect(result?.committed).toBe(true);

      const afterInsert = await adapter.getRows(
        fixture.schema,
        fixture.populatedTable,
        0,
        10,
        undefined,
        [{ column: "label", op: "eq", value: "batch-inserted" }]
      );
      expect(afterInsert.rows).toHaveLength(1);

      const afterUpdate = await adapter.getRows(
        fixture.schema,
        fixture.populatedTable,
        0,
        10,
        undefined,
        [{ column: "label", op: "eq", value: "batch-updated" }]
      );
      expect(afterUpdate.rows).toHaveLength(1);

      const afterDelete = await adapter.getRows(
        fixture.schema,
        fixture.populatedTable,
        0,
        10,
        undefined,
        [{ column: "label", op: "isNull" }]
      );
      expect(afterDelete.rows).toHaveLength(0);
    }
  );

  it.skipIf(!configured || engine === "mongodb")(
    "commitBatch rolls back the whole batch on a mid-batch failure, including earlier ops (F102)",
    async () => {
      const result = await adapter.mutations?.commitBatch?.([
        {
          type: "insert",
          schema: fixture.schema,
          table: fixture.populatedTable,
          values: { n: 101, label: "should-roll-back" }
        },
        {
          type: "update",
          schema: fixture.schema,
          table: fixture.populatedTable,
          key: { id: -1 },
          changes: { label: "nobody" }
        }
      ]);
      expect(result).toEqual({ committed: false, failedIndex: 1 });

      const after = await adapter.getRows(
        fixture.schema,
        fixture.populatedTable,
        0,
        10,
        undefined,
        [{ column: "label", op: "eq", value: "should-roll-back" }]
      );
      expect(after.rows).toHaveLength(0);
    }
  );

  it.skipIf(!configured || engine !== "mongodb")(
    "commitBatch is not offered on MongoDB - batch commit doesn't apply there (F102)",
    () => {
      expect(adapter.mutations?.commitBatch).toBeUndefined();
    }
  );
});
