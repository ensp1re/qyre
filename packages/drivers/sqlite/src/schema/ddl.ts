import type {
  ColumnDefinition,
  ColumnUpdateRequest,
  ColumnUpdateResult,
  IndexDefinition
} from "@qyre/core";
import type Database from "better-sqlite3";
import { quoteIdent } from "../query/sql.js";
import {
  type ColumnChanges,
  formatDefaultLiteral,
  rewriteCreateTableSql,
  unsupportedRebuild
} from "./create-table-sql.js";
import { fetchTableXInfo } from "./introspection.js";

function columnDefinitionSql(column: ColumnDefinition): string {
  const parts = [quoteIdent(column.name), column.dataType];
  if (!column.nullable) parts.push("NOT NULL");
  if (column.default !== null) parts.push(`DEFAULT ${formatDefaultLiteral(column.default)}`);
  return parts.join(" ");
}

export function createTable(
  db: Database.Database,
  table: string,
  columns: ColumnDefinition[]
): void {
  db.exec(`CREATE TABLE ${quoteIdent(table)} (${columns.map(columnDefinitionSql).join(", ")})`);
}

export function renameTable(db: Database.Database, table: string, newName: string): void {
  db.exec(`ALTER TABLE ${quoteIdent(table)} RENAME TO ${quoteIdent(newName)}`);
}

/** SQLite has no TRUNCATE; DELETE provides the table-scoped row removal required here. */
export function truncateTable(db: Database.Database, table: string): void {
  db.exec(`DELETE FROM ${quoteIdent(table)}`);
}

export function dropTable(db: Database.Database, table: string): void {
  db.exec(`DROP TABLE ${quoteIdent(table)}`);
}

/** Add a column using SQLite's native ALTER TABLE constraints. */
export function addColumn(db: Database.Database, table: string, column: ColumnDefinition): void {
  db.exec(`ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${columnDefinitionSql(column)}`);
}

/** Native `RENAME COLUMN` (3.25+). */
export function renameColumn(
  db: Database.Database,
  table: string,
  column: string,
  newName: string
): void {
  db.exec(
    `ALTER TABLE ${quoteIdent(table)} RENAME COLUMN ${quoteIdent(column)} TO ${quoteIdent(newName)}`
  );
}

/** Drop a column using SQLite 3.35+'s native operation. */
export function dropColumn(db: Database.Database, table: string, column: string): void {
  db.exec(`ALTER TABLE ${quoteIdent(table)} DROP COLUMN ${quoteIdent(column)}`);
}

/** Run `fn` with foreign-key enforcement off, restoring the previous setting afterwards. SQLite
 * ignores `PRAGMA foreign_keys` inside a transaction, so this must wrap the transaction. */
function withForeignKeysDisabled<T>(db: Database.Database, fn: (wasEnabled: boolean) => T): T {
  if (db.inTransaction) {
    throw Object.assign(
      new Error("Finish the open transaction before altering columns on this SQLite database."),
      { statusCode: 409 }
    );
  }
  const wasEnabled = db.pragma("foreign_keys", { simple: true }) === 1;
  if (wasEnabled) db.pragma("foreign_keys = OFF");
  try {
    return fn(wasEnabled);
  } finally {
    if (wasEnabled) db.pragma("foreign_keys = ON");
  }
}

type ForeignKeyViolation = { table: string; parent: string; fkid: number };

/** Count violations per foreign key so a rebuild is judged only on violations it introduced. */
function foreignKeyViolationCounts(db: Database.Database): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of db.pragma("foreign_key_check") as ForeignKeyViolation[]) {
    const key = `${row.table}\u0000${row.parent}\u0000${row.fkid}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function readSequence(db: Database.Database, table: string): number | undefined {
  const hasSequence = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
    .get();
  if (!hasSequence) return undefined;
  const row = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = ?").get(table) as
    { seq: number } | undefined;
  return row?.seq;
}

/** Rebuild the table using SQLite's documented 12-step alter procedure. Must run inside a
 * transaction opened under `withForeignKeysDisabled`. */
function rebuildTable(
  db: Database.Database,
  table: string,
  column: string,
  changes: ColumnChanges,
  checkForeignKeys: boolean
): void {
  const definition = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = ? COLLATE NOCASE")
    .get(table) as { name: string; sql: string | null } | undefined;
  if (!definition?.sql || /^\s*CREATE\s+VIRTUAL\b/i.test(definition.sql)) {
    throw unsupportedRebuild(
      `"${table}" is not an ordinary table, so its columns can't be altered.`
    );
  }
  const tableName = definition.name;
  const tempTable = `${tableName}__qyre_rebuild`;
  const createSql = rewriteCreateTableSql(definition.sql, tempTable, column, changes);

  const replayObjects = db
    .prepare(
      `SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL`
    )
    .all(tableName) as Array<{ sql: string }>;
  // Generated columns are recomputed by the new table and cannot be inserted into.
  const storedColumns = fetchTableXInfo(db, tableName)
    .filter((row) => row.hidden === 0)
    .map((row) => quoteIdent(row.name))
    .join(", ");
  const sequence = readSequence(db, tableName);
  const violationsBefore = checkForeignKeys ? foreignKeyViolationCounts(db) : undefined;

  db.exec(createSql);
  db.exec(
    `INSERT INTO ${quoteIdent(tempTable)} (${storedColumns}) SELECT ${storedColumns} FROM ${quoteIdent(tableName)}`
  );
  db.exec(`DROP TABLE ${quoteIdent(tableName)}`);
  // Legacy rename skips re-validating views and triggers that still name the dropped table.
  const legacyAlter = db.pragma("legacy_alter_table", { simple: true }) === 1;
  db.pragma("legacy_alter_table = ON");
  try {
    db.exec(`ALTER TABLE ${quoteIdent(tempTable)} RENAME TO ${quoteIdent(tableName)}`);
  } finally {
    if (!legacyAlter) db.pragma("legacy_alter_table = OFF");
  }
  if (sequence !== undefined) {
    db.prepare("DELETE FROM sqlite_sequence WHERE name = ?").run(tableName);
    db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)").run(tableName, sequence);
  }
  for (const object of replayObjects) {
    db.exec(object.sql);
  }
  const violationsAfter = violationsBefore ? foreignKeyViolationCounts(db) : undefined;
  if (
    violationsBefore &&
    violationsAfter &&
    [...violationsAfter].some(([key, count]) => count > (violationsBefore.get(key) ?? 0))
  ) {
    throw unsupportedRebuild(
      `Altering "${tableName}" would leave rows that violate a foreign key; no changes were made.`
    );
  }
}

export function alterColumn(
  db: Database.Database,
  table: string,
  column: string,
  changes: ColumnChanges
): void {
  withForeignKeysDisabled(db, (checkForeignKeys) => {
    db.transaction(() => rebuildTable(db, table, column, changes, checkForeignKeys))();
  });
}

/** Apply rename and alter atomically in one transaction. */
export function renameAndAlterColumn(
  db: Database.Database,
  table: string,
  column: string,
  update: ColumnUpdateRequest
): ColumnUpdateResult {
  let currentName = column;
  withForeignKeysDisabled(db, (checkForeignKeys) => {
    db.transaction(() => {
      if (update.newName !== undefined) {
        renameColumn(db, table, column, update.newName);
        currentName = update.newName;
      }
      if (update.changes !== undefined) {
        rebuildTable(db, table, currentName, update.changes, checkForeignKeys);
      }
    })();
  });
  return {
    column: currentName,
    renamed: update.newName !== undefined,
    altered: update.changes !== undefined
  };
}

export function createIndex(
  db: Database.Database,
  table: string,
  definition: IndexDefinition
): void {
  const unique = definition.unique ? "UNIQUE " : "";
  const columns = definition.columns.map(quoteIdent).join(", ");
  db.exec(
    `CREATE ${unique}INDEX ${quoteIdent(definition.name)} ON ${quoteIdent(table)} (${columns})`
  );
}

/** SQLite index names are unique per database, not per table - `table` isn't needed to target the
 * drop, matching `DROP INDEX`'s own grammar. */
export function dropIndex(db: Database.Database, indexName: string): void {
  db.exec(`DROP INDEX ${quoteIdent(indexName)}`);
}
