import type { ColumnDefinition, TableMetadata } from "@qyre/core";
import { MYSQL_COLUMN_TYPES, POSTGRES_COLUMN_TYPES, SQLITE_COLUMN_TYPES } from "@qyre/core";
import type { DatabaseAdapter } from "@qyre/driver-contract";
import type { FastifyRequest } from "fastify";
import type { ServerContext } from "../app.js";

/** DDL operations landed so far (F110's table lifecycle, F111's column ops, F112's index ops),
 * per docs/product-specs/schema-editing.md's audit-event contract. */
export type DdlOperation =
  | "createTable"
  | "renameTable"
  | "truncateTable"
  | "dropTable"
  | "addColumn"
  | "renameColumn"
  | "alterColumn"
  | "dropColumn"
  | "createIndex"
  | "dropIndex";

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/**
 * Rejects a DDL operation against a target that isn't a table/collection, per docs/product-specs/
 * schema-editing.md: `kind !== "table"`/`"collection"` (F124) is a 400 - a view/materialized view
 * is never a DDL target through this surface, mirroring row-editing.md's identical `kind`-gating
 * rule applied to a different action. Unlike row-mutation's `assertMutable`, DDL has no per-table
 * permissions field to also check here - DDL grants are session-level (`supportsDdl`), checked
 * separately by each route.
 */
export function assertDdlTarget(tableMetadata: TableMetadata): void {
  if (tableMetadata.kind !== "table" && tableMetadata.kind !== "collection") {
    throw badRequest(`Cannot run a schema-editing operation on a ${tableMetadata.kind}.`);
  }
}

/**
 * Validates a `:column` route param against the table's real, freshly introspected columns (F111) -
 * the same "an unrecognized target is 400, not a database-level error" pattern row-mutation routes
 * already apply to column names (F099-F101).
 */
export function assertColumnExists(tableMetadata: TableMetadata, column: string): void {
  if (!tableMetadata.columns.some((candidate) => candidate.name === column)) {
    throw badRequest(`Unknown column "${column}".`);
  }
}

/**
 * Validates an `IndexDefinition.columns` list against the table's real, freshly introspected
 * columns (F112) - same pattern as {@link assertColumnExists}. MongoDB is exempt: its introspected
 * columns are a best-effort field sample (F094), not an authoritative catalog, and an index
 * column can be a dotted nested-field path that would never appear as a top-level sampled field -
 * Qyre doesn't invent a structure constraint MongoDB itself doesn't enforce, the same reasoning
 * `resolveInsertValues` already applies to MongoDB's row-mutation body.
 */
export function assertIndexColumnsExist(
  tableMetadata: TableMetadata,
  columns: string[],
  engine: DatabaseAdapter["engine"]
): void {
  if (engine === "mongodb") return;
  for (const column of columns) {
    if (!tableMetadata.columns.some((candidate) => candidate.name === column)) {
      throw badRequest(`Unknown column "${column}".`);
    }
  }
}

/** Validates an `:indexName` route param against the table's real, freshly introspected indexes
 * (F112) - same "an unrecognized target is 400, not a database-level error" pattern as
 * {@link assertColumnExists}. */
export function assertIndexExists(tableMetadata: TableMetadata, indexName: string): void {
  if (!tableMetadata.indexes?.some((candidate) => candidate.name === indexName)) {
    throw badRequest(`Unknown index "${indexName}".`);
  }
}

const COLUMN_TYPE_CATALOG: Partial<Record<string, readonly string[]>> = {
  postgres: POSTGRES_COLUMN_TYPES,
  mysql: MYSQL_COLUMN_TYPES,
  sqlite: SQLITE_COLUMN_TYPES
};

/**
 * Validates one `dataType` against the connected engine's curated type catalog (docs/product-specs/
 * schema-editing.md's "Column type catalog") before an adapter is ever called - a `dataType` sits
 * inside a DDL statement, not a value position a prepared statement can parameter-bind, so an
 * unvalidated string here would be a real SQL-injection surface. MongoDB has no catalog to check
 * against - its column operations don't exist at all (see the spec's "MongoDB's column operations"
 * section), so this is a no-op there.
 */
export function validateColumnDataType(
  dataType: string,
  engine: DatabaseAdapter["engine"],
  columnName: string
): void {
  const catalog = COLUMN_TYPE_CATALOG[engine];
  if (!catalog) return;
  if (!catalog.includes(dataType)) {
    throw badRequest(`Column "${columnName}" has an unsupported type "${dataType}" for ${engine}.`);
  }
}

/** Validates every column's `dataType` for `createTable` (F110) - see {@link validateColumnDataType}. */
export function validateColumnDefinitions(
  columns: ColumnDefinition[],
  engine: DatabaseAdapter["engine"]
): void {
  for (const column of columns) validateColumnDataType(column.dataType, engine, column.name);
}

/**
 * A "warn"/"rejected" DDL outcome (confirmed-name mismatch or capability rejection), per the spec's
 * audit-event contract - logs explicitly before returning the error to throw, since the generic
 * error handler only logs an EventLog entry for >=500s, not for a 4xx rejection like this one.
 */
export function ddlRejected(
  ctx: ServerContext,
  request: FastifyRequest,
  operation: DdlOperation,
  schema: string,
  table: string,
  message: string,
  statusCode: number
): Error {
  ctx.eventLog.log("warn", `${operation} rejected: ${message}`);
  request.log.warn(
    { operation, schema, table, durationMs: 0, outcome: "rejected" },
    `${operation} rejected`
  );
  return Object.assign(new Error(message), { statusCode });
}
