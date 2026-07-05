/**
 * Shared parametrized adapter-conformance suite (F054): the same pagination-clamping and
 * empty-collection assertions run against every engine that has its `HUMB_TEST_*` env var set, so
 * a future engine can't silently diverge in behavior from the others - the class of bug F019
 * already fixed once for column-type fidelity, but for pagination/empty-handling specifically.
 *
 * Each engine's *setup* (creating a fixture table/collection) is necessarily engine-specific - the
 * DDL/API differs - but the *assertions* are written once and shared. Read-only rejection and
 * bigint/date fidelity are deliberately not duplicated here: every SQL adapter's `runReadOnlyQuery`
 * already shares the exact same `assertReadOnly` call (conformant by construction, see
 * `@humbdb/driver-contract`), and each engine's own integration test file already covers bigint/date
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
import type { DatabaseEngine } from "@humbdb/core";
import type { AdapterFactory, DatabaseAdapter } from "@humbdb/driver-contract";
import { mongodbAdapterFactory } from "@humbdb/mongodb";
import { mysqlAdapterFactory } from "@humbdb/mysql";
import { postgresAdapterFactory } from "@humbdb/postgres";
import { sqliteAdapterFactory } from "@humbdb/sqlite";
import Database from "better-sqlite3";
import { MongoClient } from "mongodb";
import mysql from "mysql2/promise";
import { Pool } from "pg";
import { TEST_DB_ENV, TEST_MONGO_ENV, TEST_MYSQL_ENV } from "@humbdb/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface ConformanceFixture {
  /** The `schema`/`database` argument getTable/getRows expect for this engine. */
  schema: string;
  /** A table/collection with exactly this many rows. */
  populatedTable: string;
  populatedRowCount: number;
  /** A table/collection with zero rows. */
  emptyTable: string;
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
const populatedTable = `humb_conformance_${suffix}`;
const emptyTable = `humb_conformance_empty_${suffix}`;

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
      await pool.query(`CREATE TABLE ${populatedTable} (id serial PRIMARY KEY, n int)`);
      await pool.query(
        `INSERT INTO ${populatedTable} (n) SELECT generate_series(1, 3)` // 3 rows
      );
      await pool.query(`CREATE TABLE ${emptyTable} (id serial PRIMARY KEY, n int)`);
      return {
        raw,
        fixture: { schema: "public", populatedTable, populatedRowCount: 3, emptyTable },
        teardown: async () => {
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
      await pool.query(`CREATE TABLE ${populatedTable} (id INT AUTO_INCREMENT PRIMARY KEY, n INT)`);
      await pool.query(`INSERT INTO ${populatedTable} (n) VALUES (1), (2), (3)`);
      await pool.query(`CREATE TABLE ${emptyTable} (id INT AUTO_INCREMENT PRIMARY KEY, n INT)`);
      return {
        raw,
        fixture: { schema: databaseName, populatedTable, populatedRowCount: 3, emptyTable },
        teardown: async () => {
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
      const dir = mkdtempSync(join(tmpdir(), "humb-conformance-"));
      const dbPath = join(dir, "fixture.db");
      const db = new Database(dbPath);
      db.exec(`CREATE TABLE ${populatedTable} (id INTEGER PRIMARY KEY, n INTEGER)`);
      db.exec(`INSERT INTO ${populatedTable} (n) VALUES (1), (2), (3)`);
      db.exec(`CREATE TABLE ${emptyTable} (id INTEGER PRIMARY KEY, n INTEGER)`);
      db.close();
      return {
        raw: dbPath,
        fixture: { schema: "main", populatedTable, populatedRowCount: 3, emptyTable },
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
      const databaseName = new URL(raw).pathname.slice(1) || "humb_test";
      const client = new MongoClient(raw);
      await client.connect();
      const db = client.db(databaseName);
      await db.collection(populatedTable).insertMany([{ n: 1 }, { n: 2 }, { n: 3 }]);
      await db.createCollection(emptyTable);
      return {
        raw,
        fixture: { schema: databaseName, populatedTable, populatedRowCount: 3, emptyTable },
        teardown: async () => {
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
});
