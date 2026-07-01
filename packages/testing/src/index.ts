/**
 * Internal test utilities and fixtures for Humb.
 *
 * Private package: never imported by product code, only by tests and E2E specs.
 */
import { Pool } from "pg";

/** Environment variable that holds the Postgres URL used by integration and end-to-end tests. */
export const TEST_DB_ENV = "HUMB_TEST_DATABASE_URL";

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
