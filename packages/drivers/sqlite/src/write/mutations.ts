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

/** Insert and re-fetch the row because SQLite RETURNING is not assumed across versions. */
export function insertRow(
  db: Database.Database,
  table: string,
  values: Record<string, unknown>
): InsertRowResult {
  const columns = Object.keys(values);
  const target = quoteIdent(table);
  const query = columns.length
    ? `INSERT INTO ${target} (${columns.map(quoteIdent).join(", ")}) VALUES (${columns
        .map(() => "?")
        .join(", ")})`
    : `INSERT INTO ${target} DEFAULT VALUES`;
  const result = db.prepare(query).run(...columns.map((column) => values[column]));

  const row = db
    .prepare(`SELECT * FROM ${target} WHERE rowid = ?`)
    .safeIntegers(true)
    .get(result.lastInsertRowid) as Record<string, unknown> | undefined;
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
