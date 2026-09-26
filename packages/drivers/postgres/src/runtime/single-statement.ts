import { keyRowsByColumn } from "@qyre/driver-contract";
import type { PoolClient, QueryArrayConfig } from "pg";

/**
 * Run exactly one statement over the extended protocol, which refuses multi-statement strings, and
 * key positional rows so repeated column names keep every value.
 */
export async function querySingleStatement(
  client: PoolClient,
  sql: string
): Promise<{ columns: string[]; rows: Array<Record<string, unknown>> }> {
  const config: QueryArrayConfig & { queryMode: "extended" } = {
    text: sql,
    rowMode: "array",
    queryMode: "extended"
  };
  const result = await client.query(config);
  return keyRowsByColumn(
    result.fields.map((field) => field.name),
    result.rows
  );
}
