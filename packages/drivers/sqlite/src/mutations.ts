import type { InsertRowResult } from "@qyre/core";
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
