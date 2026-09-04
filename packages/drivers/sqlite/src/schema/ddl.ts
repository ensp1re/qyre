import type { ColumnDefinition, ColumnUpdateResult, IndexDefinition } from "@qyre/core";
import type Database from "better-sqlite3";
import { fetchForeignKeyList, fetchTableInfo, type TableInfoRow } from "./introspection.js";
import { quoteIdent } from "../query/sql.js";

/** Format a SQLite DDL default literal; booleans use SQLite's integer representation. */
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

/** Build a column definition while preserving stored defaults for untouched columns. */
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

/** Rebuild the table using SQLite's documented 12-step alter-column workaround. */
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

/** Apply rename and alter atomically using better-sqlite3's nested transaction support. */
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
