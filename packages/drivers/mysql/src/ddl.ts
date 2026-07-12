import type { ColumnDefinition } from "@qyre/core";
import type mysql from "mysql2/promise";
import { quoteIdent } from "./sql.js";

/**
 * `column.dataType`/`column.name` are already validated by the caller (identifier shape for new
 * names, `dataType` against MySQL's curated type catalog) - see
 * packages/server/src/services/schema-ddl-validation.ts. `pool.escape()` formats the default
 * literal (a value position DDL can't parameter-bind) using mysql2's own escaping rules, which
 * correctly handle the backslash-escape MySQL applies inside string literals by default (unlike a
 * hand-rolled "double the quote" escape, which alone isn't safe here the way it is for Postgres/
 * SQLite string literals).
 */
function columnDefinitionSql(pool: mysql.Pool, column: ColumnDefinition): string {
  const parts = [quoteIdent(column.name), column.dataType];
  if (!column.nullable) parts.push("NOT NULL");
  if (column.default !== null) parts.push(`DEFAULT ${pool.escape(column.default)}`);
  return parts.join(" ");
}

export async function createTable(
  pool: mysql.Pool,
  schema: string,
  table: string,
  columns: ColumnDefinition[]
): Promise<void> {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const columnsSql = columns.map((column) => columnDefinitionSql(pool, column)).join(", ");
  await pool.query(`CREATE TABLE ${target} (${columnsSql})`);
}

export async function renameTable(
  pool: mysql.Pool,
  schema: string,
  table: string,
  newName: string
): Promise<void> {
  await pool.query(
    `RENAME TABLE ${quoteIdent(schema)}.${quoteIdent(table)} TO ${quoteIdent(schema)}.${quoteIdent(newName)}`
  );
}

export async function truncateTable(
  pool: mysql.Pool,
  schema: string,
  table: string
): Promise<void> {
  await pool.query(`TRUNCATE TABLE ${quoteIdent(schema)}.${quoteIdent(table)}`);
}

export async function dropTable(pool: mysql.Pool, schema: string, table: string): Promise<void> {
  await pool.query(`DROP TABLE ${quoteIdent(schema)}.${quoteIdent(table)}`);
}
