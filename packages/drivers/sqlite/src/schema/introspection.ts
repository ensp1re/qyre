import type { ColumnMetadata, IndexMetadata, TableKind, TableMetadata } from "@qyre/core";
import type Database from "better-sqlite3";
import { quoteIdent } from "../query/sql.js";
import type { ForeignKeyListRow, TableInfoRow } from "./types.js";

/** SQLite has a single implicit namespace; the UI still expects a schema name. */
export const MAIN_SCHEMA = "main";

interface IndexListRow {
  seq: number;
  name: string;
  unique: number;
  origin: "c" | "u" | "pk";
  partial: number;
}

interface IndexInfoRow {
  seqno: number;
  cid: number;
  name: string;
}

/** Raw `PRAGMA table_info` rows (cid/type/notnull/dflt_value/pk) - unlike `ColumnMetadata`, this
 * carries a column's default value text and 1-based PK sequence number, both needed to faithfully
 * reconstruct a table's full definition for `alterColumn`'s 12-step rebuild. */
export function fetchTableInfo(db: Database.Database, table: string): TableInfoRow[] {
  return db.pragma(`table_info(${quoteIdent(table)})`) as TableInfoRow[];
}

/** Raw `PRAGMA foreign_key_list` rows, incl. `on_update`/`on_delete` actions - `ColumnMetadata.
 * references` only carries the target table/column, not enough to faithfully reconstruct a
 * `FOREIGN KEY` clause during `alterColumn`'s rebuild. */
export function fetchForeignKeyList(db: Database.Database, table: string): ForeignKeyListRow[] {
  return db.pragma(`foreign_key_list(${quoteIdent(table)})`) as ForeignKeyListRow[];
}

/** Every non-system table or view in sqlite_master. */
export function fetchAllTableTargets(
  db: Database.Database
): Array<{ name: string; kind: TableKind }> {
  const rows = db
    .prepare(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all() as Array<{ name: string; type: "table" | "view" }>;
  return rows.map((row) => ({ name: row.name, kind: row.type }));
}

function fetchIndexes(db: Database.Database, table: string): IndexMetadata[] {
  const indexList = db.pragma(`index_list(${quoteIdent(table)})`) as IndexListRow[];
  return indexList.map((index) => {
    const indexInfo = db.pragma(`index_info(${quoteIdent(index.name)})`) as IndexInfoRow[];
    return {
      name: index.name,
      columns: indexInfo.map((column) => column.name),
      unique: index.unique === 1,
      primary: index.origin === "pk"
    };
  });
}

/** Introspect one SQLite table or view, including columns, keys, indexes, and row count. */
export function introspectTable(
  db: Database.Database,
  schema: string,
  table: string
): TableMetadata {
  const tableInfo = fetchTableInfo(db, table);
  const foreignKeyList = fetchForeignKeyList(db, table);
  const foreignKeys = new Set(foreignKeyList.map((foreignKey) => foreignKey.from));
  const foreignKeyReferences = new Map(
    foreignKeyList
      .filter((foreignKey): foreignKey is ForeignKeyListRow & { to: string } => {
        return foreignKey.to !== null;
      })
      .map((foreignKey) => [foreignKey.from, { table: foreignKey.table, column: foreignKey.to }])
  );

  const columns: ColumnMetadata[] = tableInfo.map((row) => ({
    name: row.name,
    dataType: row.type || "any",
    nullable: row.notnull === 0,
    isPrimaryKey: row.pk > 0,
    isForeignKey: foreignKeys.has(row.name),
    references: foreignKeyReferences.get(row.name)
  }));
  const typeRow = db.prepare("SELECT type FROM sqlite_master WHERE name = ?").get(table) as
    { type: string } | undefined;
  const kind: TableKind = typeRow?.type === "view" ? "view" : "table";
  const rowCount =
    kind === "view"
      ? undefined
      : (
          db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`).get() as {
            count: number;
          }
        ).count;

  return {
    schema,
    name: table,
    kind,
    columns,
    indexes: fetchIndexes(db, table),
    rowCount
  };
}
