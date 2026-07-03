/**
 * Internal test utilities and fixtures for Humb.
 *
 * Private package: never imported by product code, only by tests and E2E specs.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { Pool } from "pg";

/** Environment variable that holds the Postgres URL used by integration and end-to-end tests. */
export const TEST_DB_ENV = "HUMB_TEST_DATABASE_URL";

/** Environment variable that holds the SQLite fixture file path used by end-to-end tests. */
export const TEST_SQLITE_ENV = "HUMB_TEST_SQLITE_PATH";

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

/** The fixture table the connect-and-inspect journey expects to find. */
export const FIXTURE = {
  schema: "public",
  table: "humb_demo_users",
  rowCount: 3
} as const;

/**
 * Create a small, deterministic fixture table in the target database.
 * Idempotent: safe to run repeatedly.
 */
export async function setupFixture(connectionString: string): Promise<void> {
  await runStatements(connectionString, [
    `DROP TABLE IF EXISTS ${FIXTURE.table}`,
    `CREATE TABLE ${FIXTURE.table} (
       id serial PRIMARY KEY,
       name text NOT NULL,
       email text NOT NULL
     )`,
    `INSERT INTO ${FIXTURE.table} (name, email) VALUES
       ('Ada Lovelace', 'ada@example.com'),
       ('Alan Turing', 'alan@example.com'),
       ('Grace Hopper', 'grace@example.com')`
  ]);
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
 * Idempotent: safe to run repeatedly. Opens its own read-write connection and closes it when done -
 * the long-lived e2e server holds a separate read-only connection to the same file (see
 * docs/product-specs/connect-and-inspect-sqlite.md's read-only enforcement).
 */
export function setupSqliteFixture(path: string): void {
  ensureSqliteFile(path);
  const db = new Database(path);
  try {
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
  } finally {
    db.close();
  }
}
