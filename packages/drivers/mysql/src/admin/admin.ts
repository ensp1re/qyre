import type mysql from "mysql2/promise";
import { SYSTEM_SCHEMAS } from "../schema/catalog.js";
import { quoteIdent } from "../query/sql.js";

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
