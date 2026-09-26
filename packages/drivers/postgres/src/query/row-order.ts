import type { RowSort } from "@qyre/core";
import { buildOrderByClause, resolveRowOrder } from "@qyre/driver-contract";
import type { Pool, PoolClient } from "pg";
import { quoteIdent } from "./sql.js";

/** Primary-key columns in key order; empty for views and keyless tables. ctid is deliberately not
 * used as a fallback because it changes whenever a row is updated. */
async function fetchPrimaryKeyColumns(
  client: Pool | PoolClient,
  schema: string,
  table: string
): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `SELECT a.attname AS column_name
       FROM pg_index ix
       JOIN pg_class c ON c.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
      WHERE ix.indisprimary AND n.nspname = $1 AND c.relname = $2
      ORDER BY array_position(ix.indkey, a.attnum)`,
    [schema, table]
  );
  return result.rows.map((row) => row.column_name);
}

/** ORDER BY for row paging and export: the user's sort, then the primary key as a tiebreaker. */
export async function buildRowOrderBy(
  client: Pool | PoolClient,
  schema: string,
  table: string,
  sort: RowSort | undefined
): Promise<string> {
  const keyColumns = await fetchPrimaryKeyColumns(client, schema, table);
  return buildOrderByClause(resolveRowOrder(sort, keyColumns), quoteIdent);
}
