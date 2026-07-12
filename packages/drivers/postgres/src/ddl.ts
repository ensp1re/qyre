import type { ColumnDefinition } from "@qyre/core";
import type { Pool } from "pg";
import { quoteIdent } from "./sql.js";

/**
 * `column.dataType`/`column.name` are already validated by the caller (identifier shape for new
 * names, `dataType` against Postgres's curated type catalog) - see
 * packages/server/src/services/schema-ddl-validation.ts. A default literal can't be parameter-bound
 * (it sits inside DDL, not a value position a prepared statement can target), so it's formatted
 * here the same way `quoteIdent` formats identifiers - doubling the delimiter, the standard SQL
 * escape for a string literal.
 */
function formatDefaultLiteral(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Default value must be a finite number.");
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function columnDefinitionSql(column: ColumnDefinition): string {
  const parts = [quoteIdent(column.name), column.dataType];
  if (!column.nullable) parts.push("NOT NULL");
  if (column.default !== null) parts.push(`DEFAULT ${formatDefaultLiteral(column.default)}`);
  return parts.join(" ");
}

export async function createTable(
  pool: Pool,
  schema: string,
  table: string,
  columns: ColumnDefinition[]
): Promise<void> {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  await pool.query(`CREATE TABLE ${target} (${columns.map(columnDefinitionSql).join(", ")})`);
}

export async function renameTable(
  pool: Pool,
  schema: string,
  table: string,
  newName: string
): Promise<void> {
  await pool.query(
    `ALTER TABLE ${quoteIdent(schema)}.${quoteIdent(table)} RENAME TO ${quoteIdent(newName)}`
  );
}

/** No automatic `VACUUM` - a full-database operation out of scope for a single-table action, per
 * docs/product-specs/schema-editing.md. */
export async function truncateTable(pool: Pool, schema: string, table: string): Promise<void> {
  await pool.query(`TRUNCATE ${quoteIdent(schema)}.${quoteIdent(table)}`);
}

export async function dropTable(pool: Pool, schema: string, table: string): Promise<void> {
  await pool.query(`DROP TABLE ${quoteIdent(schema)}.${quoteIdent(table)}`);
}
