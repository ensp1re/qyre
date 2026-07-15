import type {
  CommitMutationsResult,
  DeleteRowsResult,
  InsertRowResult,
  MutationOp,
  UpdateRowResult
} from "@qyre/core";
import type { Pool, PoolClient } from "pg";
import { classifyPostgresPermissionDenied } from "../access/permission-errors.js";
import { quoteIdent } from "../query/sql.js";

/** Either the pool (single-op routes) or a transaction-scoped client (F102's batch commit) - both
 * expose the same `.query()` signature `pg` needs here. */
type Queryable = Pool | PoolClient;

/**
 * `values` is already validated/coerced against the table's real columns by the caller
 * (packages/server/src/services/rows/row-mutation-validation.ts) - this only builds the parameterized
 * statement. `RETURNING *` reports the inserted row (including any engine-assigned default/serial
 * values) without a second round trip, per docs/product-specs/row-editing.md.
 */
export async function insertRow(
  pool: Queryable,
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
  pool: Queryable,
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
  pool: Queryable,
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

/**
 * Runs every staged op in one native transaction (F102), all-or-nothing, on a single checked-out
 * client (a real `BEGIN`/`COMMIT`/`ROLLBACK` needs one session, unlike `pool.query`'s per-call
 * pooling). A stale update (`matched: 0`) or delete (`deleted < keys.length`) rolls back and reports
 * that op's index, same treatment a native constraint-violation error gets in the `catch` below.
 */
export async function commitBatch(pool: Pool, ops: MutationOp[]): Promise<CommitMutationsResult> {
  const client = await pool.connect();
  const results: Array<InsertRowResult | UpdateRowResult | DeleteRowsResult> = [];
  try {
    await client.query("BEGIN");
    for (const [index, op] of ops.entries()) {
      if (op.type === "insert") {
        results.push(await insertRow(client, op.schema, op.table, op.values));
        continue;
      }
      if (op.type === "update") {
        const result = await updateRowByKey(client, op.schema, op.table, op.key, op.changes);
        if (result.matched === 0) {
          await client.query("ROLLBACK");
          return { committed: false, failedIndex: index };
        }
        results.push(result);
        continue;
      }
      const result = await deleteRowsByKey(client, op.schema, op.table, op.keys);
      if (result.deleted < op.keys.length) {
        await client.query("ROLLBACK");
        return { committed: false, failedIndex: index };
      }
      results.push(result);
    }
    await client.query("COMMIT");
    return { committed: true, results };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (classifyPostgresPermissionDenied(error)) throw error;
    return { committed: false, failedIndex: results.length };
  } finally {
    client.release();
  }
}
