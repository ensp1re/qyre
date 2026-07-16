import type { RowFilter, RowSort } from "@qyre/core";
import type Database from "better-sqlite3";
import type { ResolvedRowSearch } from "@qyre/driver-contract";
import { normalizeRow } from "../runtime/row-values.js";
import { buildFilterClause, quoteIdent } from "./sql.js";

export async function* streamRows(
  db: Database.Database,
  table: string,
  sort?: RowSort,
  filters?: RowFilter[],
  search?: ResolvedRowSearch
): AsyncIterable<Record<string, unknown>> {
  const { clause, params } = buildFilterClause(filters, search);
  const orderBy = sort
    ? ` ORDER BY ${quoteIdent(sort.column)} ${sort.direction === "asc" ? "ASC" : "DESC"}`
    : "";
  const statement = db
    .prepare(`SELECT * FROM ${quoteIdent(table)}${clause}${orderBy}`)
    .safeIntegers(true);

  for (const row of statement.iterate(...params)) {
    yield normalizeRow(row as Record<string, unknown>);
  }
}

function quoteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function formatLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : quoteString(String(value));
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "1" : "0";
  if (Buffer.isBuffer(value)) return `X'${value.toString("hex")}'`;
  if (value instanceof Date) return quoteString(value.toISOString());
  if (typeof value === "object") {
    return quoteString(
      JSON.stringify(value, (_key, nested) =>
        typeof nested === "bigint" ? nested.toString() : nested
      )
    );
  }
  return quoteString(String(value));
}

export function formatSqlInsert(
  table: string,
  columns: readonly string[],
  row: Record<string, unknown>
): string {
  const names = columns.map(quoteIdent).join(", ");
  const values = columns.map((column) => formatLiteral(row[column])).join(", ");
  return `INSERT INTO ${quoteIdent(table)} (${names}) VALUES (${values});`;
}
