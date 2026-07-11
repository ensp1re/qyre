import type {
  CommitMutationsResult,
  DeleteRowsResult,
  InsertRowResult,
  MutationOp,
  UpdateRowResult
} from "@qyre/core";
import type Database from "better-sqlite3";
import { normalizeRow } from "./row-values.js";
import { quoteIdent } from "./sql.js";

/**
 * `values` is already validated/coerced against the table's real columns by the caller
 * (packages/server/src/services/row-mutation-validation.ts) - this only builds the parameterized
 * statement. SQLite has no `RETURNING`-across-versions guarantee this codebase relies on
 * elsewhere, so the inserted row is re-fetched by `lastInsertRowid` - every ordinary (not
 * `WITHOUT ROWID`) table has an implicit `rowid`, independent of its declared primary key, so this
 * works uniformly rather than only for `INTEGER PRIMARY KEY` tables. `safeIntegers`/`normalizeRow`
 * mirror `getRows`'s own BIGINT-safety handling (F019) so a re-fetched large integer doesn't lose
 * precision.
 */
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

/**
 * `key`/`changes` are already validated/coerced (full primary-key match enforced, PK columns
 * excluded from `changes`) by the caller - see row-mutation-validation.ts. `matched` comes from
 * `changes` on the `RunResult` - live-verified that SQLite's own `changes()` counts rows matched by
 * the `WHERE` clause and processed by the statement, regardless of whether any column's value
 * actually differed, so setting a column to its current value still reports `matched: 1`, not a
 * false stale/conflict.
 */
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

/**
 * Each key is already validated/coerced (full primary-key match enforced) by the caller - see
 * row-mutation-validation.ts. One parameterized DELETE per key, summed into `deleted` - same
 * reasoning as the other SQL adapters: simpler and just as correct as a compound-WHERE statement
 * for the small, explicit key lists this spec covers.
 */
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

/**
 * Runs every staged op in one native transaction (F102), all-or-nothing - `db.transaction()`
 * (better-sqlite3's synchronous BEGIN/COMMIT/ROLLBACK wrapper) rolls back and re-throws on any
 * exception from the wrapped function, which this relies on for both native errors (a constraint
 * violation) and the explicit staleness check below. `results.length` at the moment of a throw
 * always equals the failing op's index, since a result is only pushed after that op succeeds -
 * true whether the throw came from a caught staleness case (`failedIndex` set explicitly) or an
 * uncaught native error (falls back to `results.length`, which is identical in that case too).
 * `op.schema` is accepted for shape-parity with the other SQL engines but unused - SQLite has only
 * one schema ("main"), matching every other per-op wiring in adapter.ts.
 */
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
  } catch {
    return { committed: false, failedIndex: failedIndex ?? results.length };
  }
}
