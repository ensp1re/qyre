import type { RowSort } from "@qyre/core";
import { buildOrderByClause, resolveRowOrder } from "@qyre/driver-contract";
import type Database from "better-sqlite3";
import { quoteIdent } from "./sql.js";

const ROWID_ALIASES = ["rowid", "_rowid_", "oid"];

/** Primary-key columns in key order, else a rowid alias no real column shadows. WITHOUT ROWID
 * tables always have a primary key; views and virtual tables get no key. */
function fetchRowKeyColumns(db: Database.Database, table: string): string[] {
  const columns = db.pragma(`table_xinfo(${quoteIdent(table)})`) as Array<{
    name: string;
    pk: number;
  }>;
  const primaryKey = columns
    .filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((column) => column.name);
  if (primaryKey.length > 0) return primaryKey;

  const definition = db.prepare("SELECT type, sql FROM sqlite_master WHERE name = ?").get(table) as
    { type: string; sql: string | null } | undefined;
  if (definition?.type !== "table" || /^\s*CREATE\s+VIRTUAL\b/i.test(definition.sql ?? "")) {
    return [];
  }
  const names = new Set(columns.map((column) => column.name.toLowerCase()));
  const alias = ROWID_ALIASES.find((candidate) => !names.has(candidate));
  return alias ? [alias] : [];
}

/** ORDER BY for row paging and export: the user's sort, then the row key as a tiebreaker. */
export function buildRowOrderBy(
  db: Database.Database,
  table: string,
  sort: RowSort | undefined
): string {
  return buildOrderByClause(resolveRowOrder(sort, fetchRowKeyColumns(db, table)), quoteIdent);
}
