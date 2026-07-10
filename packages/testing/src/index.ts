/**
 * Internal test utilities and fixtures for Qyre.
 *
 * Private package: never imported by product code, only by tests and E2E specs.
 */
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { MongoClient } from "mongodb";
import mysql from "mysql2/promise";
import { Pool } from "pg";

/** Environment variable that holds the Postgres URL used by integration and end-to-end tests. */
export const TEST_DB_ENV = "QYRE_TEST_DATABASE_URL";

/** Optional override for the restricted Postgres fixture user (F092). */
export const TEST_READONLY_DB_ENV = "QYRE_TEST_READONLY_DATABASE_URL";

/** Environment variable that holds the SQLite fixture file path used by end-to-end tests. */
export const TEST_SQLITE_ENV = "QYRE_TEST_SQLITE_PATH";

/** Environment variable that holds the MySQL URL used by integration and end-to-end tests. */
export const TEST_MYSQL_ENV = "QYRE_TEST_MYSQL_URL";

/** Environment variable that holds the MongoDB URL used by integration tests. */
export const TEST_MONGO_ENV = "QYRE_TEST_MONGO_URL";

/** Whether a test database is configured in the environment. */
export function isTestDatabaseConfigured(): boolean {
  return Boolean(process.env[TEST_DB_ENV]?.trim());
}

/**
 * Return the configured test database URL, or throw an actionable error.
 * We never silently skip required verification - see docs/RELIABILITY.md.
 */
export function requireTestDatabaseUrl(): string {
  const url = process.env[TEST_DB_ENV]?.trim();
  if (!url) {
    throw new Error(
      `${TEST_DB_ENV} is not set. This verification requires a Postgres database.\n` +
        `Set it, for example:\n` +
        `  export ${TEST_DB_ENV}="postgres://postgres:postgres@localhost:5432/qyre_test"\n` +
        `or start one with Docker:\n` +
        `  docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`
    );
  }
  return url;
}

/** Return the restricted fixture user's URL. It defaults to the configured Postgres target so
 * Docker Compose and CI need only configure the normal admin fixture URL. */
export function requireReadOnlyTestDatabaseUrl(primaryConnectionString: string): string {
  const configured = process.env[TEST_READONLY_DB_ENV]?.trim();
  if (configured) return configured;

  const url = new URL(primaryConnectionString);
  url.username = "qyre_readonly";
  url.password = "qyre_readonly";
  return url.toString();
}

/**
 * Return the configured SQLite fixture path, or throw an actionable error.
 * We never silently skip required verification - see docs/RELIABILITY.md.
 */
export function requireTestSqlitePath(): string {
  const path = process.env[TEST_SQLITE_ENV]?.trim();
  if (!path) {
    throw new Error(
      `${TEST_SQLITE_ENV} is not set. This verification requires a SQLite fixture file path.`
    );
  }
  return path;
}

/**
 * Return the configured MySQL test database URL, or throw an actionable error.
 * We never silently skip required verification - see docs/RELIABILITY.md.
 */
export function requireTestMysqlUrl(): string {
  const url = process.env[TEST_MYSQL_ENV]?.trim();
  if (!url) {
    throw new Error(
      `${TEST_MYSQL_ENV} is not set. This verification requires a MySQL database.\n` +
        `Set it, for example:\n` +
        `  export ${TEST_MYSQL_ENV}="mysql://root:root@localhost:3306/qyre_test"\n` +
        `or start one with Docker:\n` +
        `  docker run --rm -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=qyre_test -p 3306:3306 mysql:8`
    );
  }
  return url;
}

/**
 * Return the configured MongoDB test database URL, or throw an actionable error.
 * We never silently skip required verification - see docs/RELIABILITY.md.
 */
export function requireTestMongoUrl(): string {
  const url = process.env[TEST_MONGO_ENV]?.trim();
  if (!url) {
    throw new Error(
      `${TEST_MONGO_ENV} is not set. This verification requires a MongoDB database.\n` +
        `Set it, for example:\n` +
        `  export ${TEST_MONGO_ENV}="mongodb://localhost:27017/qyre_test"\n` +
        `or start one with Docker:\n` +
        `  docker run --rm -p 27017:27017 mongo:7`
    );
  }
  return url;
}

/** The fixture table the connect-and-inspect journey expects to find. */
export const FIXTURE = {
  schema: "public",
  table: "qyre_demo_users",
  rowCount: 3
} as const;

const READONLY_POSTGRES_ROLE = "qyre_readonly";

/** Child fixture table used where relationship introspection needs a stable FK. */
export const MYSQL_RELATIONSHIP_FIXTURE = {
  table: "qyre_demo_orders",
  rowCount: 2
} as const;

/** Arbitrary fixed key for setupFixture's advisory lock - scoped to this one fixture, not shared. */
const FIXTURE_LOCK_KEY = 958312;

/**
 * Create a small, deterministic fixture table in the target database.
 * Idempotent: safe to run repeatedly - including concurrently, from multiple Playwright workers
 * running different @full specs against the same live database at once. The DROP+CREATE isn't
 * naturally race-safe (two concurrent CREATE TABLEs can violate pg_class's uniqueness constraint
 * before either commits), so the whole operation runs on one session under a Postgres advisory
 * lock (pg_advisory_lock must run on the same connection as its matching unlock, hence checking out
 * a single Client via pool.connect() rather than pool.query(), which may hand different calls to
 * different pooled connections) - concurrent callers simply queue up instead of racing.
 */
export async function setupFixture(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [FIXTURE_LOCK_KEY]);
    try {
      // The role is part of Docker Compose's init fixture too, but creating it here keeps the
      // same restricted-user contract available in CI service containers and custom local stacks.
      await client.query(`DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${READONLY_POSTGRES_ROLE}') THEN
            CREATE ROLE ${READONLY_POSTGRES_ROLE} LOGIN PASSWORD '${READONLY_POSTGRES_ROLE}';
          END IF;
        END
      $$`);
      await client.query(
        `GRANT CONNECT ON DATABASE ${quoteDatabaseIdentifier(connectionString)} TO ${READONLY_POSTGRES_ROLE}`
      );
      await client.query(`GRANT USAGE ON SCHEMA public TO ${READONLY_POSTGRES_ROLE}`);
      await client.query(
        `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${READONLY_POSTGRES_ROLE}`
      );
      await client.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${READONLY_POSTGRES_ROLE}`
      );
      await client.query(`DROP TABLE IF EXISTS ${FIXTURE.table}`);
      // `profile` is jsonb, nullable, only populated for one row - exercises F016's expandable
      // cell viewer (nested three levels deep: object -> object -> array) without needing a
      // second table, which would make the Schema tab show 2 table-detail cards and break
      // connect-and-inspect.spec.ts's singular assertion under concurrent @full specs.
      await client.query(`CREATE TABLE ${FIXTURE.table} (
         id serial PRIMARY KEY,
         name text NOT NULL,
         email text NOT NULL,
         profile jsonb
       )`);
      await client.query(`INSERT INTO ${FIXTURE.table} (name, email, profile) VALUES
         ('Ada Lovelace', 'ada@example.com', '{"account":{"tags":["admin","beta"]}}'),
         ('Alan Turing', 'alan@example.com', NULL),
         ('Grace Hopper', 'grace@example.com', NULL)`);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [FIXTURE_LOCK_KEY]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

function quoteDatabaseIdentifier(connectionString: string): string {
  const database = new URL(connectionString).pathname.slice(1);
  if (!database) throw new Error("Postgres fixture URL must include a database name.");
  return `"${decodeURIComponent(database).replace(/"/g, '""')}"`;
}

/**
 * Run a sequence of raw SQL statements against a target database, sequentially in one pool.
 * A generic low-level helper for ad hoc/manual fixture and seed scripts.
 */
export async function runStatements(connectionString: string, statements: string[]): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    for (const statement of statements) {
      await pool.query(statement);
    }
  } finally {
    await pool.end();
  }
}

/**
 * Ensure a valid (possibly empty) SQLite file exists at `path`, creating it if missing.
 * Needed before an e2e server opens its own read-only connection (`fileMustExist: true`, see
 * packages/drivers/sqlite/src/index.ts), which cannot create a new file itself.
 */
export function ensureSqliteFile(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  try {
    const database = new Database(path);
    try {
      const result = database.pragma("quick_check", { simple: true });
      if (result !== "ok")
        throw new Error(`generated SQLite fixture failed quick_check: ${result}`);
    } finally {
      database.close();
    }
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/not a database|unsupported file format|generated SQLite fixture failed/i.test(error.message)
    ) {
      throw error;
    }

    // E2E fixtures are generated artifacts, never user databases. Recreate a stale/corrupt file
    // instead of letting every SQLite project fail before the browser journey begins.
    rmSync(path, { force: true });
    new Database(path).close();
  }
}

/**
 * Create the same fixture table/rows as {@link setupFixture}'s Postgres version, in a SQLite file.
 * Idempotent: safe to run repeatedly - including concurrently, from multiple Playwright workers
 * running different @full specs against the same fixture file at once. Without this, DROP+CREATE
 * isn't race-safe across separate processes (each statement auto-commits on its own, so another
 * process's DROP+CREATE can interleave between this one's DROP and CREATE) - the exact same class
 * of bug setupFixture's Postgres advisory lock already fixes, reproduced here once a third @full
 * engine project pushed total worker parallelism higher (F014). Fixed the same way: the whole
 * DROP+CREATE+INSERT sequence runs in one transaction (SQLite's own file lock is then held for the
 * whole sequence, not per-statement), with a busy_timeout so a concurrent writer waits for the lock
 * instead of immediately failing with SQLITE_BUSY. Opens its own read-write connection and closes
 * it when done - the long-lived e2e server holds a separate read-only connection to the same file
 * (see docs/product-specs/connect-and-inspect-sqlite.md's read-only enforcement).
 */
export function setupSqliteFixture(path: string): void {
  ensureSqliteFile(path);
  const db = new Database(path);
  try {
    db.pragma("busy_timeout = 5000");
    db.transaction(() => {
      db.exec(`DROP TABLE IF EXISTS ${FIXTURE.table}`);
      db.exec(
        `CREATE TABLE ${FIXTURE.table} (
           id INTEGER PRIMARY KEY,
           name TEXT NOT NULL,
           email TEXT NOT NULL
         )`
      );
      const insertRow = db.prepare(`INSERT INTO ${FIXTURE.table} (name, email) VALUES (?, ?)`);
      insertRow.run("Ada Lovelace", "ada@example.com");
      insertRow.run("Alan Turing", "alan@example.com");
      insertRow.run("Grace Hopper", "grace@example.com");
    })();
  } finally {
    db.close();
  }
}

/** Arbitrary fixed name for setupMysqlFixture's named lock - scoped to this one fixture, not shared. */
const MYSQL_FIXTURE_LOCK_NAME = "qyre_fixture_lock";

/**
 * Create the same fixture table/rows as {@link setupFixture}'s Postgres version, in MySQL.
 * Idempotent and safe under concurrent Playwright workers, matching setupFixture's Postgres
 * advisory-lock precedent - MySQL's equivalent is a named lock (`GET_LOCK`/`RELEASE_LOCK`), which
 * likewise must run on one held connection (`pool.getConnection()`, not `pool.query()`).
 */
export async function setupMysqlFixture(connectionString: string): Promise<void> {
  const pool = mysql.createPool(connectionString);
  const connection = await pool.getConnection();
  try {
    await connection.query("SELECT GET_LOCK(?, 10)", [MYSQL_FIXTURE_LOCK_NAME]);
    try {
      await connection.query(`DROP TABLE IF EXISTS ${MYSQL_RELATIONSHIP_FIXTURE.table}`);
      await connection.query(`DROP TABLE IF EXISTS ${FIXTURE.table}`);
      await connection.query(`CREATE TABLE ${FIXTURE.table} (
         id INT AUTO_INCREMENT PRIMARY KEY,
         name VARCHAR(255) NOT NULL,
         email VARCHAR(255) NOT NULL
       )`);
      await connection.query(`CREATE TABLE ${MYSQL_RELATIONSHIP_FIXTURE.table} (
         id INT AUTO_INCREMENT PRIMARY KEY,
         user_id INT NOT NULL,
         total DECIMAL(10,2) NOT NULL,
         FOREIGN KEY (user_id) REFERENCES ${FIXTURE.table}(id)
       )`);
      await connection.query(`INSERT INTO ${FIXTURE.table} (name, email) VALUES
         ('Ada Lovelace', 'ada@example.com'),
         ('Alan Turing', 'alan@example.com'),
         ('Grace Hopper', 'grace@example.com')`);
      await connection.query(`INSERT INTO ${MYSQL_RELATIONSHIP_FIXTURE.table} (user_id, total) VALUES
         (1, 42.50),
         (2, 13.99)`);
    } finally {
      await connection.query("SELECT RELEASE_LOCK(?)", [MYSQL_FIXTURE_LOCK_NAME]);
    }
  } finally {
    connection.release();
    await pool.end();
  }
}

/**
 * Create the same fixture collection/documents as {@link setupFixture}'s Postgres version, in
 * MongoDB - plus a nested `profile` field on one document (matching F016's structured-cell-value
 * e2e fixture), since a Mongo document's nested fields are the common case this engine exists to
 * browse (see docs/product-specs/connect-and-inspect-mongodb.md). Unlike setupFixture/
 * setupMysqlFixture/setupSqliteFixture, this isn't guarded by a lock: the Mongo Playwright project
 * runs one browse journey that writes this fixture, while SQL-only journeys skip Mongo explicitly.
 * The adapter integration suite also calls it, but package tests finish before E2E begins.
 */
export async function setupMongoFixture(connectionString: string): Promise<void> {
  const databaseName = new URL(connectionString).pathname.slice(1) || "qyre_test";
  const client = new MongoClient(connectionString);
  try {
    await client.connect();
    const db = client.db(databaseName);
    await db
      .collection(FIXTURE.table)
      .drop()
      .catch(() => {});
    await db.collection(FIXTURE.table).insertMany([
      {
        name: "Ada Lovelace",
        email: "ada@example.com",
        profile: { account: { tags: ["admin", "beta"] } }
      },
      { name: "Alan Turing", email: "alan@example.com" },
      { name: "Grace Hopper", email: "grace@example.com" }
    ]);
  } finally {
    await client.close();
  }
}
