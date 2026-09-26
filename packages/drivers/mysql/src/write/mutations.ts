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

/** Queryable pool or transaction connection. */
type Queryable = mysql.Pool | mysql.PoolConnection;

/** Find the auto-increment column used to re-fetch an inserted row. */
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

const ER_WARNING_NOT_COMPLETE_ROLLBACK = 1196;

/** Rolls back and reports whether non-transactional tables (e.g. MyISAM) kept their changes. */
async function rollbackKeptChanges(connection: mysql.PoolConnection): Promise<boolean> {
  const [result] = await connection.query<mysql.ResultSetHeader>("ROLLBACK");
  if (!result.warningStatus) return false;
  const [warnings] = await connection.query<mysql.RowDataPacket[]>("SHOW WARNINGS");
  return warnings.some((warning) => Number(warning.Code) === ER_WARNING_NOT_COMPLETE_ROLLBACK);
}

/**
 * Run staged operations atomically on one checked-out connection. When non-transactional tables
 * keep changes after a failure, `appliedCount` reports the operations that were not undone.
 */
export async function commitBatch(
  pool: mysql.Pool,
  ops: MutationOp[]
): Promise<CommitMutationsResult> {
  const connection = await pool.getConnection();
  const results: Array<InsertRowResult | UpdateRowResult | DeleteRowsResult> = [];
  const rolledBack = async (failedIndex: number): Promise<CommitMutationsResult> =>
    (await rollbackKeptChanges(connection))
      ? { committed: false, failedIndex, appliedCount: results.length }
      : { committed: false, failedIndex };
  try {
    await connection.beginTransaction();
    for (const [index, op] of ops.entries()) {
      if (op.type === "insert") {
        results.push(await insertRow(connection, op.schema, op.table, op.values));
        continue;
      }
      if (op.type === "update") {
        const result = await updateRowByKey(connection, op.schema, op.table, op.key, op.changes);
        if (result.matched === 0) return await rolledBack(index);
        results.push(result);
        continue;
      }
      const result = await deleteRowsByKey(connection, op.schema, op.table, op.keys);
      if (result.deleted < op.keys.length) return await rolledBack(index);
      results.push(result);
    }
    await connection.commit();
    return { committed: true, results };
  } catch (error) {
    if (classifyMysqlPermissionDenied(error)) {
      await connection.rollback().catch(() => {});
      throw error;
    }
    return await rolledBack(results.length).catch(() => ({
      committed: false as const,
      failedIndex: results.length
    }));
  } finally {
    connection.release();
  }
}
