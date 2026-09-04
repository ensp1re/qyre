import { Pool } from "pg";
import { FIXTURE } from "./definitions.js";

const READONLY_POSTGRES_ROLE = "qyre_readonly";
const FIXTURE_LOCK_KEY = 958312;

export async function setupFixture(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [FIXTURE_LOCK_KEY]);
    try {
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
      await client.query(`CREATE TABLE IF NOT EXISTS ${FIXTURE.table} (
         id serial PRIMARY KEY,
         name text NOT NULL,
         email text NOT NULL,
         profile jsonb
       )`);
      await client.query("BEGIN");
      try {
        await client.query(`TRUNCATE TABLE ${FIXTURE.table} RESTART IDENTITY`);
        await client.query(`INSERT INTO ${FIXTURE.table} (name, email, profile) VALUES
           ('Ada Lovelace', 'ada@example.com', '{"account":{"tags":["admin","beta"]}}'),
           ('Alan Turing', 'alan@example.com', NULL),
           ('Grace Hopper', 'grace@example.com', NULL)`);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
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

export async function runStatements(connectionString: string, statements: string[]): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    for (const statement of statements) await pool.query(statement);
  } finally {
    await pool.end();
  }
}
