import type { ColumnDefinition } from "@qyre/core";
import type Database from "better-sqlite3";
import { quoteIdent } from "./sql.js";

/**
 * `column.dataType`/`column.name` are already validated by the caller (identifier shape for new
 * names, `dataType` against SQLite's curated type-affinity catalog) - see
 * packages/server/src/services/schema-ddl-validation.ts. A default literal can't be parameter-bound
 * (it sits inside DDL, not a value position a prepared statement can target), so it's formatted
 * here the same way `quoteIdent` formats identifiers - doubling the delimiter, the standard SQL
 * escape for a string literal. SQLite has no native boolean type - `TRUE`/`FALSE` map to the
 * integer affinity `1`/`0`, matching how every boolean value is already stored elsewhere in this
 * adapter.
 */
function formatDefaultLiteral(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "1" : "0";
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

export function createTable(
  db: Database.Database,
  table: string,
  columns: ColumnDefinition[]
): void {
  db.exec(`CREATE TABLE ${quoteIdent(table)} (${columns.map(columnDefinitionSql).join(", ")})`);
}

export function renameTable(db: Database.Database, table: string, newName: string): void {
  db.exec(`ALTER TABLE ${quoteIdent(table)} RENAME TO ${quoteIdent(newName)}`);
}

/** No native `TRUNCATE` - a plain `DELETE FROM` matches TRUNCATE's own row-removal effect, per
 * docs/product-specs/schema-editing.md. `VACUUM` is deliberately not run automatically (a
 * full-database operation, out of scope for a single-table action). */
export function truncateTable(db: Database.Database, table: string): void {
  db.exec(`DELETE FROM ${quoteIdent(table)}`);
}

export function dropTable(db: Database.Database, table: string): void {
  db.exec(`DROP TABLE ${quoteIdent(table)}`);
}
