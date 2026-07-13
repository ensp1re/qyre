import type { Pool } from "pg";
import { quoteIdent } from "./sql.js";

/**
 * Database/schema-lifecycle operations (F115), per docs/product-specs/schema-editing.md's
 * "Database and schema lifecycle" section. `name` is already validated (conservative identifier
 * pattern) by the caller - see packages/server/src/services/schema-ddl-validation.ts - and is
 * quoted here regardless, same as every ddl.ts statement.
 */
export async function listDatabases(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ datname: string }>(
    "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
  );
  return result.rows.map((row) => row.datname);
}

export async function createDatabase(pool: Pool, name: string): Promise<void> {
  await pool.query(`CREATE DATABASE ${quoteIdent(name)}`);
}

/** Postgres natively rejects dropping the currently connected database ("cannot drop the currently
 * open database") - that error surfaces as-is, no separate guard here. */
export async function dropDatabase(pool: Pool, name: string): Promise<void> {
  await pool.query(`DROP DATABASE ${quoteIdent(name)}`);
}

export async function createSchema(pool: Pool, name: string): Promise<void> {
  await pool.query(`CREATE SCHEMA ${quoteIdent(name)}`);
}

/** No CASCADE - dropping a non-empty schema surfaces Postgres's own "cannot drop schema ... because
 * other objects depend on it" error rather than silently taking every contained table with it, per
 * the spec's "the destructive footprint the user confirmed is the named target, nothing more". */
export async function dropSchema(pool: Pool, name: string): Promise<void> {
  await pool.query(`DROP SCHEMA ${quoteIdent(name)}`);
}
