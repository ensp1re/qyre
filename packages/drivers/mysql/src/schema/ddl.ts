import type {
  ColumnDefinition,
  ColumnUpdateRequest,
  ColumnUpdateResult,
  IndexDefinition
} from "@qyre/core";
import type mysql from "mysql2/promise";
import { quoteIdent } from "../query/sql.js";
import { buildModifiedColumnSql } from "./column-definition.js";

/** Format a MySQL DDL default with mysql2's engine-specific escaping. */
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

export async function addColumn(
  pool: mysql.Pool,
  schema: string,
  table: string,
  column: ColumnDefinition
): Promise<void> {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  await pool.query(`ALTER TABLE ${target} ADD COLUMN ${columnDefinitionSql(pool, column)}`);
}

/** Rename a column using MySQL 8+'s native operation. */
export async function renameColumn(
  pool: mysql.Pool,
  schema: string,
  table: string,
  column: string,
  newName: string
): Promise<void> {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  await pool.query(
    `ALTER TABLE ${target} RENAME COLUMN ${quoteIdent(column)} TO ${quoteIdent(newName)}`
  );
}

/** MySQL's MODIFY COLUMN takes the full resulting definition, so the current one is merged first. */
export async function alterColumn(
  pool: mysql.Pool,
  schema: string,
  table: string,
  column: string,
  changes: Partial<Pick<ColumnDefinition, "dataType" | "nullable" | "default">>
): Promise<void> {
  const definition = await buildModifiedColumnSql(pool, schema, table, column, changes);
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  await pool.query(`ALTER TABLE ${target} MODIFY COLUMN ${definition}`);
}

/** Apply MySQL rename and alter sequentially; DDL auto-commits between statements. */
export async function renameAndAlterColumn(
  pool: mysql.Pool,
  schema: string,
  table: string,
  column: string,
  update: ColumnUpdateRequest
): Promise<ColumnUpdateResult> {
  let currentName = column;
  if (update.newName !== undefined) {
    await renameColumn(pool, schema, table, column, update.newName);
    currentName = update.newName;
  }
  if (update.changes === undefined) {
    return { column: currentName, renamed: update.newName !== undefined, altered: false };
  }
  try {
    await alterColumn(pool, schema, table, currentName, update.changes);
  } catch (error) {
    if (update.newName === undefined) throw error;
    return {
      column: currentName,
      renamed: true,
      altered: false,
      alterError: error instanceof Error ? error.message : String(error)
    };
  }
  return { column: currentName, renamed: update.newName !== undefined, altered: true };
}

export async function dropColumn(
  pool: mysql.Pool,
  schema: string,
  table: string,
  column: string
): Promise<void> {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  await pool.query(`ALTER TABLE ${target} DROP COLUMN ${quoteIdent(column)}`);
}

export async function createIndex(
  pool: mysql.Pool,
  schema: string,
  table: string,
  definition: IndexDefinition
): Promise<void> {
  const unique = definition.unique ? "UNIQUE " : "";
  const columns = definition.columns.map(quoteIdent).join(", ");
  await pool.query(
    `CREATE ${unique}INDEX ${quoteIdent(definition.name)} ON ${quoteIdent(schema)}.${quoteIdent(table)} (${columns})`
  );
}

/** MySQL's `DROP INDEX` requires the table (index names are unique per table, not per schema, and
 * the grammar itself takes an `ON table` clause). */
export async function dropIndex(
  pool: mysql.Pool,
  schema: string,
  table: string,
  indexName: string
): Promise<void> {
  await pool.query(
    `DROP INDEX ${quoteIdent(indexName)} ON ${quoteIdent(schema)}.${quoteIdent(table)}`
  );
}
