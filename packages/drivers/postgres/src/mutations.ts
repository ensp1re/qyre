import type { DeleteRowsResult, InsertRowResult, UpdateRowResult } from "@qyre/core";
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

/**
 * `key`/`changes` are already validated/coerced (full primary-key match enforced, PK columns
 * excluded from `changes`) by the caller - see row-mutation-validation.ts. `matched` comes straight
 * from `rowCount`: a composite key still identifies at most one row, so 0 vs 1 is the whole story.
 */
export async function updateRowByKey(
  pool: Pool,
  schema: string,
  table: string,
  key: Record<string, unknown>,
  changes: Record<string, unknown>
): Promise<UpdateRowResult> {
  const changeColumns = Object.keys(changes);
  const keyColumns = Object.keys(key);
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const setClause = changeColumns
    .map((column, index) => `${quoteIdent(column)} = $${index + 1}`)
    .join(", ");
  const whereClause = keyColumns
    .map((column, index) => `${quoteIdent(column)} = $${changeColumns.length + index + 1}`)
    .join(" AND ");
  const query = `UPDATE ${target} SET ${setClause} WHERE ${whereClause}`;
  const values = [
    ...changeColumns.map((column) => changes[column]),
    ...keyColumns.map((column) => key[column])
  ];
  const result = await pool.query(query, values);
  return { matched: result.rowCount ?? 0 };
}

/**
 * Each key is already validated/coerced (full primary-key match enforced) by the caller - see
 * row-mutation-validation.ts. One parameterized DELETE per key, summed into `deleted`: simpler and
 * just as correct as a single compound-WHERE statement for the small, explicit key lists this spec
 * covers (no filter-based bulk delete), and avoids composite-key IN-clause complexity entirely.
 */
export async function deleteRowsByKey(
  pool: Pool,
  schema: string,
  table: string,
  keys: Array<Record<string, unknown>>
): Promise<DeleteRowsResult> {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  let deleted = 0;
  for (const key of keys) {
    const keyColumns = Object.keys(key);
    const whereClause = keyColumns
      .map((column, index) => `${quoteIdent(column)} = $${index + 1}`)
      .join(" AND ");
    const result = await pool.query(
      `DELETE FROM ${target} WHERE ${whereClause}`,
      keyColumns.map((column) => key[column])
    );
    deleted += result.rowCount ?? 0;
  }
  return { deleted };
}
