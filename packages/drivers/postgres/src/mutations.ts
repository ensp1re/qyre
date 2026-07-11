import type { InsertRowResult } from "@qyre/core";
import type { Pool } from "pg";
import { quoteIdent } from "./sql.js";

/**
 * `values` is already validated/coerced against the table's real columns by the caller
 * (packages/server/src/services/row-mutation-validation.ts) - this only builds the parameterized
 * statement. `RETURNING *` reports the inserted row (including any engine-assigned default/serial
 * values) without a second round trip, per docs/product-specs/row-editing.md.
 */
export async function insertRow(
  pool: Pool,
  schema: string,
  table: string,
  values: Record<string, unknown>
): Promise<InsertRowResult> {
  const columns = Object.keys(values);
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const query = columns.length
    ? `INSERT INTO ${target} (${columns.map(quoteIdent).join(", ")}) VALUES (${columns
        .map((_, index) => `$${index + 1}`)
        .join(", ")}) RETURNING *`
    : `INSERT INTO ${target} DEFAULT VALUES RETURNING *`;
  const result = await pool.query(
    query,
    columns.map((column) => values[column])
  );
  return { row: result.rows[0] as Record<string, unknown> | undefined };
}
