import type { ColumnDefinition, ColumnUpdateResult, IndexDefinition } from "@qyre/core";
import type Database from "better-sqlite3";
import { fetchForeignKeyList, fetchTableInfo, type TableInfoRow } from "./introspection.js";
import { quoteIdent } from "./sql.js";

/**
 * `column.dataType`/`column.name` are already validated by the caller (identifier shape for new
 * names, `dataType` against SQLite's curated type-affinity catalog) - see
 * packages/server/src/services/schema-ddl-validation.ts. A default literal can't be parameter-bound
 * (it sits inside DDL, not a value position a prepared statement can target), so it's formatted
 * here the same way `quoteIdent` formats identifiers - doubling the delimiter, the standard SQL
 * escape for a string literal. SQLite has no native boolean type - `TRUE`/`FALSE` map to the
 * integer affinity `1`/`0`, matching how every boolean value is already stored elsewhere in this
 * adapter.
 */
function formatDefaultLiteral(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Default value must be a finite number.");
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

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

/** No native `TRUNCATE` - a plain `DELETE FROM` matches TRUNCATE's own row-removal effect, per
 * docs/product-specs/schema-editing.md. `VACUUM` is deliberately not run automatically (a
 * full-database operation, out of scope for a single-table action). */
export function truncateTable(db: Database.Database, table: string): void {
  db.exec(`DELETE FROM ${quoteIdent(table)}`);
}

export function dropTable(db: Database.Database, table: string): void {
  db.exec(`DROP TABLE ${quoteIdent(table)}`);
}

/** Native `ADD COLUMN` (real limits apply - no non-constant default, no `PRIMARY KEY`/`UNIQUE`,
 * no `NOT NULL` unless a default is given - SQLite's own constraint, not this adapter's). */
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

/** Native `DROP COLUMN` (3.35+, refuses a column that's part of a primary key, a foreign key, an
 * index, or a generated column - SQLite's own constraint surfaces as a real error). */
export function dropColumn(db: Database.Database, table: string, column: string): void {
  db.exec(`ALTER TABLE ${quoteIdent(table)} DROP COLUMN ${quoteIdent(column)}`);
}

/** Builds one column's definition for the rebuilt table - `override` carries `alterColumn`'s
 * requested changes for the one column being altered; every other column is carried over verbatim
 * from its existing `PRAGMA table_info` row, including `dflt_value`'s text exactly as SQLite
 * itself stores it (already valid, reusable SQL - re-quoting it would risk double-escaping). */
function rebuildColumnSql(
  row: TableInfoRow,
  isSoleIntegerPrimaryKey: boolean,
  override: Partial<Pick<ColumnDefinition, "dataType" | "nullable" | "default">> | undefined
): string {
  const dataType = override?.dataType ?? row.type;
  const nullable = override?.nullable ?? row.notnull === 0;
  const parts = [quoteIdent(row.name), dataType];
  if (isSoleIntegerPrimaryKey) parts.push("PRIMARY KEY");
  if (!nullable) parts.push("NOT NULL");

  if (override && "default" in override) {
    const value = override.default;
    if (value !== null && value !== undefined) parts.push(`DEFAULT ${formatDefaultLiteral(value)}`);
  } else if (row.dflt_value !== null) {
    parts.push(`DEFAULT ${row.dflt_value}`);
  }
  return parts.join(" ");
}

/**
 * SQLite's own documented workaround for a column change its native `ALTER TABLE` can't express
 * directly (a type change, or a nullable/default change beyond `ADD COLUMN`'s own limits) - the
 * 12-step rebuild pattern: `PRAGMA foreign_keys=OFF` (a no-op if toggled mid-transaction, so this
 * must run first), create a new table with the desired final schema, copy every row across, drop
 * the old table, rename the new one into its place, recreate every index/trigger that referenced
 * the old table (from `sqlite_master`'s own stored `CREATE INDEX`/`CREATE TRIGGER` text - a view's
 * stored SQL only names the table, so it keeps working once the rebuilt table exists under the
 * same name, unaffected by the swap), `PRAGMA foreign_key_check`, commit, `PRAGMA foreign_keys=ON`.
 * Every `alterColumn` call takes this one path - never a "fast path for safe changes" that could
 * silently diverge from it, per docs/product-specs/schema-editing.md.
 */
function rebuildTable(
  db: Database.Database,
  table: string,
  column: string,
  changes: Partial<Pick<ColumnDefinition, "dataType" | "nullable" | "default">>
): void {
  const tableInfo = fetchTableInfo(db, table);
  const foreignKeys = fetchForeignKeyList(db, table);
  const replayObjects = db
    .prepare(
      `SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL`
    )
    .all(table) as Array<{ sql: string }>;

  const pkColumns = tableInfo.filter((row) => row.pk > 0).sort((a, b) => a.pk - b.pk);
  const isSoleIntegerPrimaryKey =
    pkColumns.length === 1 && pkColumns[0]?.type.toUpperCase() === "INTEGER";

  const columnDefs = tableInfo.map((row) =>
    rebuildColumnSql(
      row,
      isSoleIntegerPrimaryKey && row.pk > 0,
      row.name === column ? changes : undefined
    )
  );
  if (!isSoleIntegerPrimaryKey && pkColumns.length > 0) {
    columnDefs.push(`PRIMARY KEY (${pkColumns.map((row) => quoteIdent(row.name)).join(", ")})`);
  }
  for (const foreignKey of foreignKeys) {
    if (foreignKey.to === null) continue;
    const actions = [
      foreignKey.on_delete && foreignKey.on_delete !== "NO ACTION"
        ? `ON DELETE ${foreignKey.on_delete}`
        : "",
      foreignKey.on_update && foreignKey.on_update !== "NO ACTION"
        ? `ON UPDATE ${foreignKey.on_update}`
        : ""
    ]
      .filter(Boolean)
      .join(" ");
    columnDefs.push(
      `FOREIGN KEY (${quoteIdent(foreignKey.from)}) REFERENCES ${quoteIdent(foreignKey.table)}(${quoteIdent(
        foreignKey.to
      )})${actions ? ` ${actions}` : ""}`
    );
  }

  const tempTable = `${table}__qyre_rebuild`;
  const columnNames = tableInfo.map((row) => quoteIdent(row.name)).join(", ");

  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`CREATE TABLE ${quoteIdent(tempTable)} (${columnDefs.join(", ")})`);
      db.exec(
        `INSERT INTO ${quoteIdent(tempTable)} (${columnNames}) SELECT ${columnNames} FROM ${quoteIdent(table)}`
      );
      db.exec(`DROP TABLE ${quoteIdent(table)}`);
      db.exec(`ALTER TABLE ${quoteIdent(tempTable)} RENAME TO ${quoteIdent(table)}`);
      for (const object of replayObjects) {
        db.exec(object.sql);
      }
      const violations = db.pragma("foreign_key_check") as unknown[];
      if (violations.length > 0) {
        throw new Error(`Foreign key check failed while rebuilding "${table}".`);
      }
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

export function alterColumn(
  db: Database.Database,
  table: string,
  column: string,
  changes: Partial<Pick<ColumnDefinition, "dataType" | "nullable" | "default">>
): void {
  rebuildTable(db, table, column, changes);
}

/**
 * Runs a rename and/or alter as one transaction (F134) - `renameColumn`'s `ALTER TABLE ... RENAME
 * COLUMN` and `alterColumn`'s own internal 12-step rebuild both run inside `db.transaction()`;
 * better-sqlite3 nests transaction functions as SAVEPOINTs, so wrapping both in an outer
 * transaction here rolls back a mid-request alter failure - including an already-issued rename -
 * instead of leaving it committed with the alter reported as failed. Only ever resolves once every
 * requested step actually applied; any failure throws instead (nothing partial to report),
 * matching {@link ColumnUpdateResult}'s contract for a transactional engine.
 */
export function renameAndAlterColumn(
  db: Database.Database,
  table: string,
  column: string,
  update: {
    newName?: string;
    changes?: Partial<Pick<ColumnDefinition, "dataType" | "nullable" | "default">>;
  }
): ColumnUpdateResult {
  let currentName = column;
  db.transaction(() => {
    if (update.newName !== undefined) {
      renameColumn(db, table, column, update.newName);
      currentName = update.newName;
    }
    if (update.changes !== undefined) {
      alterColumn(db, table, currentName, update.changes);
    }
  })();
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
