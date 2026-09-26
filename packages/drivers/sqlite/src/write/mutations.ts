import type {
  CommitMutationsResult,
  DeleteRowsResult,
  InsertRowResult,
  MutationOp,
  UpdateRowResult
} from "@qyre/core";
import type Database from "better-sqlite3";
import { classifySqlitePermissionDenied } from "../access/permission-errors.js";
import { normalizeRow } from "../runtime/row-values.js";
import { quoteIdent } from "../query/sql.js";

/** The primary-key columns of a WITHOUT ROWID table, or `undefined` for a rowid table. */
function withoutRowidKey(db: Database.Database, table: string): string[] | undefined {
  const withoutRowid = db
    .prepare("SELECT wr FROM pragma_table_list(?) WHERE type = 'table'")
    .pluck()
    .get(table);
  if (!withoutRowid) return undefined;
  return db
    .prepare("SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk")
    .pluck()
    .all(table) as string[];
}

/**
 * Insert, then re-read the row by its key: `RETURNING *` yields the row before AFTER INSERT
 * triggers run, and the re-read shows what they changed.
 */
export function insertRow(
  db: Database.Database,
  table: string,
  values: Record<string, unknown>
): InsertRowResult {
  const columns = Object.keys(values);
  const target = quoteIdent(table);
  const keyColumns = withoutRowidKey(db, table);
  const returning = keyColumns ? keyColumns.map(quoteIdent).join(", ") : "rowid";
  const query = columns.length
    ? `INSERT INTO ${target} (${columns.map(quoteIdent).join(", ")}) VALUES (${columns
        .map(() => "?")
        .join(", ")}) RETURNING ${returning}`
    : `INSERT INTO ${target} DEFAULT VALUES RETURNING ${returning}`;
  const key = db
    .prepare(query)
    .raw(true)
    .safeIntegers(true)
    .get(...columns.map((column) => values[column])) as unknown[] | undefined;
  if (!key) return { row: undefined };

  const where = keyColumns
    ? keyColumns.map((column) => `${quoteIdent(column)} = ?`).join(" AND ")
    : "rowid = ?";
  const row = db
    .prepare(`SELECT * FROM ${target} WHERE ${where}`)
    .safeIntegers(true)
    .get(...key) as Record<string, unknown> | undefined;
  return { row: row ? normalizeRow(row) : undefined };
}

export function updateRowByKey(
  db: Database.Database,
  table: string,
  key: Record<string, unknown>,
  changes: Record<string, unknown>
): UpdateRowResult {
  const changeColumns = Object.keys(changes);
  const keyColumns = Object.keys(key);
  const target = quoteIdent(table);
  const setClause = changeColumns.map((column) => `${quoteIdent(column)} = ?`).join(", ");
  const whereClause = keyColumns.map((column) => `${quoteIdent(column)} = ?`).join(" AND ");
  const query = `UPDATE ${target} SET ${setClause} WHERE ${whereClause}`;
  const result = db
    .prepare(query)
    .run(
      ...changeColumns.map((column) => changes[column]),
      ...keyColumns.map((column) => key[column])
    );
  return { matched: result.changes };
}

export function deleteRowsByKey(
  db: Database.Database,
  table: string,
  keys: Array<Record<string, unknown>>
): DeleteRowsResult {
  const target = quoteIdent(table);
  let deleted = 0;
  for (const key of keys) {
    const keyColumns = Object.keys(key);
    const whereClause = keyColumns.map((column) => `${quoteIdent(column)} = ?`).join(" AND ");
    const result = db
      .prepare(`DELETE FROM ${target} WHERE ${whereClause}`)
      .run(...keyColumns.map((column) => key[column]));
    deleted += result.changes;
  }
  return { deleted };
}

/** Run staged operations atomically in SQLite's native transaction wrapper. */
export function commitBatch(db: Database.Database, ops: MutationOp[]): CommitMutationsResult {
  let failedIndex: number | undefined;
  const results: Array<InsertRowResult | UpdateRowResult | DeleteRowsResult> = [];

  const runAll = db.transaction((operations: MutationOp[]) => {
    for (const [index, op] of operations.entries()) {
      if (op.type === "insert") {
        results.push(insertRow(db, op.table, op.values));
        continue;
      }
      if (op.type === "update") {
        const result = updateRowByKey(db, op.table, op.key, op.changes);
        if (result.matched === 0) {
          failedIndex = index;
          throw new Error("Row no longer matches (stale).");
        }
        results.push(result);
        continue;
      }
      const result = deleteRowsByKey(db, op.table, op.keys);
      if (result.deleted < op.keys.length) {
        failedIndex = index;
        throw new Error("Some rows no longer match (stale).");
      }
      results.push(result);
    }
  });

  try {
    runAll(ops);
    return { committed: true, results };
  } catch (error) {
    if (classifySqlitePermissionDenied(error)) throw error;
    return { committed: false, failedIndex: failedIndex ?? results.length };
  }
}
