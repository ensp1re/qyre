import type { RowSort } from "@qyre/core";
import { buildOrderByClause, resolveRowOrder } from "@qyre/driver-contract";
import type mysql from "mysql2/promise";
import { quoteIdent } from "./sql.js";

/** Primary-key columns in key order; empty for views and keyless tables. */
async function fetchPrimaryKeyColumns(
  connection: mysql.Pool | mysql.PoolConnection,
  schema: string,
  table: string
): Promise<string[]> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT column_name AS column_name
       FROM information_schema.statistics
      WHERE table_schema = ? AND table_name = ? AND index_name = 'PRIMARY'
      ORDER BY seq_in_index`,
    [schema, table]
  );
  return (rows as Array<{ column_name: string }>).map((row) => row.column_name);
}

/** ORDER BY for row paging and export: the user's sort, then the primary key as a tiebreaker. */
export async function buildRowOrderBy(
  connection: mysql.Pool | mysql.PoolConnection,
  schema: string,
  table: string,
  sort: RowSort | undefined
): Promise<string> {
  const keyColumns = await fetchPrimaryKeyColumns(connection, schema, table);
  return buildOrderByClause(resolveRowOrder(sort, keyColumns), quoteIdent);
}
