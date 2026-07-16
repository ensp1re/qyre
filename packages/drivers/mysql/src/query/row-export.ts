import type { RowFilter, RowSort } from "@qyre/core";
import type { PoolConnection } from "mysql2";
import type mysql from "mysql2/promise";
import type { ResolvedRowSearch } from "@qyre/driver-contract";
import { buildFilterClause, quoteIdent } from "./sql.js";

export async function* streamRows(
  pool: mysql.Pool,
  schema: string,
  table: string,
  statementTimeoutMs: number,
  sort?: RowSort,
  filters?: RowFilter[],
  search?: ResolvedRowSearch
): AsyncIterable<Record<string, unknown>> {
  const { clause, params } = buildFilterClause(filters, search);
  const orderBy = sort
    ? ` ORDER BY ${quoteIdent(sort.column)} ${sort.direction === "asc" ? "ASC" : "DESC"}`
    : "";
  const connection = await pool.getConnection();
  // mysql2's promise wrapper types its `.connection` property as another promise connection, but
  // at runtime it deliberately exposes the underlying core PoolConnection (the only API that owns
  // the native query stream). Keep the cast isolated to this boundary.
  const coreConnection = connection.connection as unknown as PoolConnection;
  const query = coreConnection.query(
    {
      sql: `SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)}${clause}${orderBy}`,
      timeout: statementTimeoutMs
    },
    params
  );
  const rows = query.stream({ highWaterMark: 100 });

  try {
    for await (const row of rows) yield row as Record<string, unknown>;
  } finally {
    rows.destroy();
    connection.release();
  }
}

function exportValue(value: unknown): unknown {
  if (value && typeof value === "object" && !Buffer.isBuffer(value) && !(value instanceof Date)) {
    return JSON.stringify(value, (_key, nested) =>
      typeof nested === "bigint" ? nested.toString() : nested
    );
  }
  return value;
}

export function formatSqlInsert(
  pool: mysql.Pool,
  schema: string,
  table: string,
  columns: readonly string[],
  row: Record<string, unknown>
): string {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const names = columns.map(quoteIdent).join(", ");
  const values = columns.map((column) => pool.escape(exportValue(row[column]))).join(", ");
  return `INSERT INTO ${target} (${names}) VALUES (${values});`;
}
