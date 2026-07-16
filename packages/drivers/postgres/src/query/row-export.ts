import type { RowFilter, RowSort } from "@qyre/core";
import type { Pool } from "pg";
import type { ResolvedRowSearch } from "@qyre/driver-contract";
import QueryStream from "pg-query-stream";
import { buildFilterClause, quoteIdent } from "./sql.js";

export async function* streamRows(
  pool: Pool,
  schema: string,
  table: string,
  sort?: RowSort,
  filters?: RowFilter[],
  search?: ResolvedRowSearch
): AsyncIterable<Record<string, unknown>> {
  const { clause, params } = buildFilterClause(filters, search);
  const orderBy = sort
    ? ` ORDER BY ${quoteIdent(sort.column)} ${sort.direction === "asc" ? "ASC" : "DESC"}`
    : "";
  const client = await pool.connect();
  const query = new QueryStream(
    `SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)}${clause}${orderBy}`,
    params
  );
  const rows = client.query(query);

  try {
    for await (const row of rows) yield row as Record<string, unknown>;
  } finally {
    rows.destroy();
    client.release();
  }
}

function quoteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function jsonText(value: object): string {
  return JSON.stringify(value, (_key, nested) =>
    typeof nested === "bigint" ? nested.toString() : nested
  );
}

function formatLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : quoteString(String(value));
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (Buffer.isBuffer(value)) return `decode('${value.toString("hex")}', 'hex')`;
  if (value instanceof Date) return quoteString(value.toISOString());
  if (typeof value === "object") return quoteString(jsonText(value));
  return quoteString(String(value));
}

export function formatSqlInsert(
  schema: string,
  table: string,
  columns: readonly string[],
  row: Record<string, unknown>
): string {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const names = columns.map(quoteIdent).join(", ");
  const values = columns.map((column) => formatLiteral(row[column])).join(", ");
  return `INSERT INTO ${target} (${names}) VALUES (${values});`;
}
