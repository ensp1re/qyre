import type { ColumnMetadata, RowFilter, RowSort } from "@qyre/core";
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

function isArrayColumn(column: ColumnMetadata): boolean {
  return (
    column.dataType === "ARRAY" || column.dataType.endsWith("[]") || Boolean(column.elementDataType)
  );
}

function arrayText(values: readonly unknown[], jsonElements: boolean): string {
  return `{${values.map((element) => arrayElementText(element, jsonElements)).join(",")}}`;
}

function arrayElementText(value: unknown, jsonElements: boolean): string {
  if (value === null || value === undefined) return "NULL";
  // A nested JS array is another dimension, except inside json[]/jsonb[] where it is a value.
  if (Array.isArray(value) && !jsonElements) return arrayText(value, jsonElements);
  let text: string;
  if (Buffer.isBuffer(value)) {
    text = `\\x${value.toString("hex")}`;
  } else if (
    typeof value === "object" &&
    typeof (value as { toPostgres?: unknown }).toPostgres === "function"
  ) {
    text = String((value as { toPostgres: () => unknown }).toPostgres());
  } else if (typeof value === "object") {
    text = jsonText(value);
  } else {
    text = String(value);
  }
  return `"${text.replace(/[\\"]/g, "\\$&")}"`;
}

/** Postgres array input syntax (`'{"a","b"}'`), typed by the INSERT target column. */
function formatArrayLiteral(value: unknown[], column: ColumnMetadata): string {
  const jsonElements = /^jsonb?$/i.test(column.elementDataType ?? "");
  return quoteString(arrayText(value, jsonElements));
}

function formatLiteral(value: unknown, column: ColumnMetadata): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : quoteString(String(value));
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (Buffer.isBuffer(value)) return `decode('${value.toString("hex")}', 'hex')`;
  if (value instanceof Date) return quoteString(value.toISOString());
  if (Array.isArray(value) && isArrayColumn(column)) return formatArrayLiteral(value, column);
  if (typeof value === "object") return quoteString(jsonText(value));
  return quoteString(String(value));
}

export function formatSqlInsert(
  schema: string,
  table: string,
  columns: readonly ColumnMetadata[],
  row: Record<string, unknown>
): string {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const names = columns.map((column) => quoteIdent(column.name)).join(", ");
  const values = columns.map((column) => formatLiteral(row[column.name], column)).join(", ");
  return `INSERT INTO ${target} (${names}) VALUES (${values});`;
}
