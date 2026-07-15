import type mysql from "mysql2/promise";
import { SYSTEM_SCHEMAS } from "../schema/catalog.js";
import { quoteIdent } from "../query/sql.js";

/**
 * Database-lifecycle operations (F115), per docs/product-specs/schema-editing.md's "Database and
 * schema lifecycle" section. MySQL has no schema pair - a MySQL "schema" IS its database
 * (`CREATE SCHEMA` is a literal synonym of `CREATE DATABASE`), so modeling both would offer the
 * same operation twice. `name` is already validated (conservative identifier pattern) by the
 * caller - see packages/server/src/services/schema/schema-ddl-validation.ts - and is quoted here
 * regardless, same as every ddl.ts statement.
 */
export async function listDatabases(pool: mysql.Pool): Promise<string[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME NOT IN (?) ORDER BY SCHEMA_NAME",
    [SYSTEM_SCHEMAS]
  );
  return rows.map((row) => row.name as string);
}

export async function createDatabase(pool: mysql.Pool, name: string): Promise<void> {
  await pool.query(`CREATE DATABASE ${quoteIdent(name)}`);
}

/** Unlike Postgres, MySQL allows dropping the currently connected database - the route's typed
 * confirmation is the deliberate-action gate, per the spec; no extra guard here. */
export async function dropDatabase(pool: mysql.Pool, name: string): Promise<void> {
  await pool.query(`DROP DATABASE ${quoteIdent(name)}`);
}
