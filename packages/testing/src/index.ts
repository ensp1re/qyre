/**
 * Internal test utilities and fixtures for Humb.
 *
 * Private package: never imported by product code, only by tests and E2E specs.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import mysql from "mysql2/promise";
import { Pool } from "pg";

/** Environment variable that holds the Postgres URL used by integration and end-to-end tests. */
export const TEST_DB_ENV = "HUMB_TEST_DATABASE_URL";

/** Environment variable that holds the SQLite fixture file path used by end-to-end tests. */
export const TEST_SQLITE_ENV = "HUMB_TEST_SQLITE_PATH";

/** Environment variable that holds the MySQL URL used by integration and end-to-end tests. */
export const TEST_MYSQL_ENV = "HUMB_TEST_MYSQL_URL";

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
        `  export ${TEST_DB_ENV}="postgres://postgres:postgres@localhost:5432/humb_test"\n` +
        `or start one with Docker:\n` +
        `  docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`
    );
  }
  return url;
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
        `  export ${TEST_MYSQL_ENV}="mysql://root:root@localhost:3306/humb_test"\n` +
        `or start one with Docker:\n` +
        `  docker run --rm -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=humb_test -p 3306:3306 mysql:8`
    );
  }
  return url;
}

/** The fixture table the connect-and-inspect journey expects to find. */
export const FIXTURE = {
  schema: "public",
  table: "humb_demo_users",
  rowCount: 3
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
  new Database(path).close();
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
const MYSQL_FIXTURE_LOCK_NAME = "humb_fixture_lock";

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
      await connection.query(`DROP TABLE IF EXISTS ${FIXTURE.table}`);
      await connection.query(`CREATE TABLE ${FIXTURE.table} (
         id INT AUTO_INCREMENT PRIMARY KEY,
         name VARCHAR(255) NOT NULL,
         email VARCHAR(255) NOT NULL
       )`);
      await connection.query(`INSERT INTO ${FIXTURE.table} (name, email) VALUES
         ('Ada Lovelace', 'ada@example.com'),
         ('Alan Turing', 'alan@example.com'),
         ('Grace Hopper', 'grace@example.com')`);
    } finally {
      await connection.query("SELECT RELEASE_LOCK(?)", [MYSQL_FIXTURE_LOCK_NAME]);
    }
  } finally {
    connection.release();
    await pool.end();
  }
}
