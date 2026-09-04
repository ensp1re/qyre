import { randomUUID } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseEngine } from "@qyre/core";
import type { AdapterFactory } from "@qyre/driver-contract";
import { mongodbAdapterFactory } from "@qyre/mongodb";
import { mysqlAdapterFactory } from "@qyre/mysql";
import { postgresAdapterFactory } from "@qyre/postgres";
import { sqliteAdapterFactory } from "@qyre/sqlite";
import Database from "better-sqlite3";
import { MongoClient } from "mongodb";
import mysql from "mysql2/promise";
import { Pool } from "pg";
import { TEST_DB_ENV, TEST_MONGO_ENV, TEST_MYSQL_ENV } from "@qyre/testing";

export interface ConformanceFixture {
  /** The `schema`/`database` argument getTable/getRows expect for this engine. */
  schema: string;
  populatedTable: string;
  populatedRowCount: number;
  emptyTable: string;
  /** A read-only view over `populatedTable`. */
  viewTable: string;
}

export interface PermissionDenialFixture {
  raw: string;
  revoke?: () => Promise<void>;
  expectedKind: "permission" | "read-only";
}

export interface EngineCase {
  name: string;
  envVar: string;
  factory: AdapterFactory;
  engine: DatabaseEngine;
  /** Set up the fixture or return undefined when its engine is unavailable. */
  setup: () => Promise<
    | {
        raw: string;
        fixture: ConformanceFixture;
        permissionDenial?: PermissionDenialFixture;
        teardown: () => Promise<void>;
      }
    | undefined
  >;
}

export const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
export const populatedTable = `qyre_conformance_${suffix}`;
export const emptyTable = `qyre_conformance_empty_${suffix}`;
export const viewTable = `qyre_conformance_view_${suffix}`;

export const cases: EngineCase[] = [
  {
    name: "postgres",
    envVar: TEST_DB_ENV,
    factory: postgresAdapterFactory,
    engine: "postgres",
    setup: async () => {
      const raw = process.env[TEST_DB_ENV]?.trim();
      if (!raw) return undefined;
      const pool = new Pool({ connectionString: raw });
      // Include a nullable label and searchable values for filter coverage.
      await pool.query(
        `CREATE TABLE ${populatedTable} (id serial PRIMARY KEY, n int, label text, payload jsonb)`
      );
      await pool.query(
        `INSERT INTO ${populatedTable} (n, label, payload) VALUES
          (1, 'apple', '{"needleKey":"needleValue","tags":["alpha","beta"]}'),
          (2, 'banana', '{"other":"plain"}'),
          (3, NULL, NULL)`
      );
      await pool.query(
        `CREATE TABLE ${emptyTable} (id serial PRIMARY KEY, n int, label text, payload jsonb)`
      );
      await pool.query(`CREATE VIEW ${viewTable} AS SELECT * FROM ${populatedTable}`);
      const deniedUser = `qyre_f120_${suffix}`;
      const deniedPassword = randomUUID();
      const database = decodeURIComponent(new URL(raw).pathname.slice(1));
      await pool.query(`CREATE ROLE ${deniedUser} LOGIN PASSWORD '${deniedPassword}'`);
      await pool.query(
        `GRANT CONNECT ON DATABASE "${database.replace(/"/g, '""')}" TO ${deniedUser}`
      );
      await pool.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${deniedUser}`);
      await pool.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${populatedTable} TO ${deniedUser}`
      );
      await pool.query(`GRANT USAGE, SELECT ON SEQUENCE ${populatedTable}_id_seq TO ${deniedUser}`);
      const deniedUrl = new URL(raw);
      deniedUrl.username = deniedUser;
      deniedUrl.password = deniedPassword;
      return {
        raw,
        fixture: { schema: "public", populatedTable, populatedRowCount: 3, emptyTable, viewTable },
        permissionDenial: {
          raw: deniedUrl.toString(),
          expectedKind: "permission",
          revoke: async () => {
            await pool.query(
              `REVOKE INSERT, UPDATE, DELETE ON TABLE ${populatedTable} FROM ${deniedUser}`
            );
            await pool.query(`REVOKE CREATE ON SCHEMA public FROM ${deniedUser}`);
          }
        },
        teardown: async () => {
          await pool.query(`DROP VIEW IF EXISTS ${viewTable}`);
          await pool.query(`DROP TABLE IF EXISTS ${populatedTable}`);
          await pool.query(`DROP TABLE IF EXISTS ${emptyTable}`);
          await pool.query(`DROP OWNED BY ${deniedUser}`);
          await pool.query(`DROP ROLE IF EXISTS ${deniedUser}`);
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
        `CREATE TABLE ${populatedTable} (id INT AUTO_INCREMENT PRIMARY KEY, n INT, label VARCHAR(50), payload JSON)`
      );
      await pool.query(
        `INSERT INTO ${populatedTable} (n, label, payload) VALUES
          (1, 'apple', '{"needleKey":"needleValue","tags":["alpha","beta"]}'),
          (2, 'banana', '{"other":"plain"}'),
          (3, NULL, NULL)`
      );
      await pool.query(
        `CREATE TABLE ${emptyTable} (id INT AUTO_INCREMENT PRIMARY KEY, n INT, label VARCHAR(50), payload JSON)`
      );
      await pool.query(`CREATE VIEW ${viewTable} AS SELECT * FROM ${populatedTable}`);
      const deniedUser = `qyre_f120_${suffix}`;
      const deniedPassword = randomUUID();
      const databaseIdent = `\`${databaseName.replace(/`/g, "``")}\``;
      await pool.query(`CREATE USER '${deniedUser}'@'%' IDENTIFIED BY '${deniedPassword}'`);
      await pool.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ${databaseIdent}.\`${populatedTable}\` TO '${deniedUser}'@'%'`
      );
      await pool.query(`GRANT CREATE ON ${databaseIdent}.* TO '${deniedUser}'@'%'`);
      const deniedUrl = new URL(raw);
      deniedUrl.username = deniedUser;
      deniedUrl.password = deniedPassword;
      return {
        raw,
        fixture: {
          schema: databaseName,
          populatedTable,
          populatedRowCount: 3,
          emptyTable,
          viewTable
        },
        permissionDenial: {
          raw: deniedUrl.toString(),
          expectedKind: "permission",
          revoke: async () => {
            await pool.query(
              `REVOKE INSERT, UPDATE, DELETE ON ${databaseIdent}.\`${populatedTable}\` FROM '${deniedUser}'@'%'`
            );
            await pool.query(`REVOKE CREATE ON ${databaseIdent}.* FROM '${deniedUser}'@'%'`);
          }
        },
        teardown: async () => {
          await pool.query(`DROP VIEW IF EXISTS ${viewTable}`);
          await pool.query(`DROP TABLE IF EXISTS ${populatedTable}`);
          await pool.query(`DROP TABLE IF EXISTS ${emptyTable}`);
          await pool.query(`DROP USER IF EXISTS '${deniedUser}'@'%'`);
          await pool.end();
        }
      };
    }
  },
  {
    name: "sqlite",
    envVar: "", // SQLite uses a temporary local fixture.
    factory: sqliteAdapterFactory,
    engine: "sqlite",
    setup: async () => {
      const dir = mkdtempSync(join(tmpdir(), "qyre-conformance-"));
      const dbPath = join(dir, "fixture.db");
      const db = new Database(dbPath);
      db.exec(
        `CREATE TABLE ${populatedTable} (id INTEGER PRIMARY KEY, n INTEGER, label TEXT, payload JSON)`
      );
      db.exec(
        `INSERT INTO ${populatedTable} (n, label, payload) VALUES
          (1, 'apple', '{"needleKey":"needleValue","tags":["alpha","beta"]}'),
          (2, 'banana', '{"other":"plain"}'),
          (3, NULL, NULL)`
      );
      db.exec(
        `CREATE TABLE ${emptyTable} (id INTEGER PRIMARY KEY, n INTEGER, label TEXT, payload JSON)`
      );
      db.exec(`CREATE VIEW ${viewTable} AS SELECT * FROM ${populatedTable}`);
      db.close();
      const deniedDir = mkdtempSync(join(tmpdir(), "qyre-conformance-readonly-"));
      const deniedPath = join(deniedDir, "fixture.db");
      const deniedDb = new Database(deniedPath);
      deniedDb.exec(
        `CREATE TABLE ${populatedTable} (id INTEGER PRIMARY KEY, n INTEGER, label TEXT)`
      );
      deniedDb.exec(`INSERT INTO ${populatedTable} (id, n, label) VALUES (1, 1, 'apple')`);
      deniedDb.close();
      chmodSync(deniedPath, 0o444);
      chmodSync(deniedDir, 0o555);
      return {
        raw: dbPath,
        fixture: { schema: "main", populatedTable, populatedRowCount: 3, emptyTable, viewTable },
        permissionDenial: { raw: deniedPath, expectedKind: "read-only" },
        teardown: async () => {
          chmodSync(deniedDir, 0o755);
          chmodSync(deniedPath, 0o644);
          rmSync(dir, { recursive: true, force: true });
          rmSync(deniedDir, { recursive: true, force: true });
        }
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
        { n: 1, label: "apple", payload: { needleKey: "needleValue", tags: ["alpha", "beta"] } },
        { n: 2, label: "banana", payload: { other: "plain" } },
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
