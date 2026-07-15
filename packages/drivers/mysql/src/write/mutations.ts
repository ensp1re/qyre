import type {
  CommitMutationsResult,
  DeleteRowsResult,
  InsertRowResult,
  MutationOp,
  UpdateRowResult
} from "@qyre/core";
import type mysql from "mysql2/promise";
import { classifyMysqlPermissionDenied } from "../access/permission-errors.js";
import { quoteIdent } from "../query/sql.js";

/** Either the pool (single-op routes) or a transaction-scoped connection (F102's batch commit) -
 * both expose the same `.query()` signature mysql2 needs here. */
type Queryable = mysql.Pool | mysql.PoolConnection;

/** The auto-increment column, if any - live-verified: MySQL exposes it via
 * `information_schema.COLUMNS.EXTRA`, and re-fetching by it is the only generic way to recover the
 * inserted row without a `RETURNING`-equivalent clause. */
async function fetchAutoIncrementColumn(
  pool: Queryable,
  schema: string,
  table: string
): Promise<string | undefined> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND EXTRA LIKE '%auto_increment%'
      LIMIT 1`,
    [schema, table]
  );
  return (rows[0] as { COLUMN_NAME: string } | undefined)?.COLUMN_NAME;
}

/**
 * `values` is already validated/coerced against the table's real columns by the caller
 * (packages/server/src/services/rows/row-mutation-validation.ts) - this only builds the parameterized
 * statement. MySQL has no `RETURNING` clause, so the inserted row is only recoverable by
 * re-fetching via `insertId` (live-verified: `INSERT INTO t () VALUES ()` is valid MySQL syntax for
 * an all-default insert, unlike Postgres's dedicated `DEFAULT VALUES` keyword) - a table with no
 * auto-increment column (a manually-supplied or composite primary key) has no generic way to
 * correlate the new row back, per docs/product-specs/row-editing.md's "absent only if the engine
 * truly cannot" allowance.
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
        .map(() => "?")
        .join(", ")})`
    : `INSERT INTO ${target} () VALUES ()`;
  const [result] = await pool.query<mysql.ResultSetHeader>(
    query,
    columns.map((column) => values[column])
  );

  const autoIncrementColumn = result.insertId
    ? await fetchAutoIncrementColumn(pool, schema, table)
    : undefined;
  if (!autoIncrementColumn) return { row: undefined };

  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT * FROM ${target} WHERE ${quoteIdent(autoIncrementColumn)} = ?`,
    [result.insertId]
  );
  return { row: rows[0] as Record<string, unknown> | undefined };
}

/**
 * `key`/`changes` are already validated/coerced (full primary-key match enforced, PK columns
 * excluded from `changes`) by the caller - see row-mutation-validation.ts. `matched` comes from
 * `affectedRows` - live-verified that mysql2's pool defaults to the `CLIENT_FOUND_ROWS` capability
 * flag (unlike the raw `mysql` CLI client, which reports "rows changed" unless asked otherwise), so
 * `affectedRows` already reports "rows matched by WHERE", not "rows whose values actually changed" -
 * setting a column to its current value still reports `matched: 1`, not a false stale/conflict.
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
  const setClause = changeColumns.map((column) => `${quoteIdent(column)} = ?`).join(", ");
  const whereClause = keyColumns.map((column) => `${quoteIdent(column)} = ?`).join(" AND ");
  const query = `UPDATE ${target} SET ${setClause} WHERE ${whereClause}`;
  const values = [
    ...changeColumns.map((column) => changes[column]),
    ...keyColumns.map((column) => key[column])
  ];
  const [result] = await pool.query<mysql.ResultSetHeader>(query, values);
  return { matched: result.affectedRows };
}

/**
 * Each key is already validated/coerced (full primary-key match enforced) by the caller - see
 * row-mutation-validation.ts. One parameterized DELETE per key, summed into `deleted` - same
 * reasoning as Postgres's version: simpler and just as correct as a compound-WHERE statement for
 * the small, explicit key lists this spec covers.
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
    const whereClause = keyColumns.map((column) => `${quoteIdent(column)} = ?`).join(" AND ");
    const [result] = await pool.query<mysql.ResultSetHeader>(
      `DELETE FROM ${target} WHERE ${whereClause}`,
      keyColumns.map((column) => key[column])
    );
    deleted += result.affectedRows;
  }
  return { deleted };
}

/**
 * Runs every staged op in one native transaction (F102), all-or-nothing, on a single checked-out
 * connection (a real transaction needs one session, unlike the pool's per-call connection reuse).
 * A stale update (`matched: 0`) or delete (`deleted < keys.length`) rolls back and reports that
 * op's index, same treatment a native constraint-violation error gets in the `catch` below.
 */
export async function commitBatch(
  pool: mysql.Pool,
  ops: MutationOp[]
): Promise<CommitMutationsResult> {
  const connection = await pool.getConnection();
  const results: Array<InsertRowResult | UpdateRowResult | DeleteRowsResult> = [];
  try {
    await connection.beginTransaction();
    for (const [index, op] of ops.entries()) {
      if (op.type === "insert") {
        results.push(await insertRow(connection, op.schema, op.table, op.values));
        continue;
      }
      if (op.type === "update") {
        const result = await updateRowByKey(connection, op.schema, op.table, op.key, op.changes);
        if (result.matched === 0) {
          await connection.rollback();
          return { committed: false, failedIndex: index };
        }
        results.push(result);
        continue;
      }
      const result = await deleteRowsByKey(connection, op.schema, op.table, op.keys);
      if (result.deleted < op.keys.length) {
        await connection.rollback();
        return { committed: false, failedIndex: index };
      }
      results.push(result);
    }
    await connection.commit();
    return { committed: true, results };
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (classifyMysqlPermissionDenied(error)) throw error;
    return { committed: false, failedIndex: results.length };
  } finally {
    connection.release();
  }
}
