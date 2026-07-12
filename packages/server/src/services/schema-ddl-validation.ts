import type { ColumnDefinition, TableMetadata } from "@qyre/core";
import { MYSQL_COLUMN_TYPES, POSTGRES_COLUMN_TYPES, SQLITE_COLUMN_TYPES } from "@qyre/core";
import type { DatabaseAdapter } from "@qyre/driver-contract";
import type { FastifyRequest } from "fastify";
import type { ServerContext } from "../app.js";

/** Table-lifecycle DDL operations landed so far (F110) - grows as F111 (columns)/F112 (indexes)
 * land, per docs/product-specs/schema-editing.md's audit-event contract. */
export type DdlOperation = "createTable" | "renameTable" | "truncateTable" | "dropTable";

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

const COLUMN_TYPE_CATALOG: Partial<Record<string, readonly string[]>> = {
  postgres: POSTGRES_COLUMN_TYPES,
  mysql: MYSQL_COLUMN_TYPES,
  sqlite: SQLITE_COLUMN_TYPES
};

/**
 * Validates every column's `dataType` against the connected engine's curated type catalog
 * (docs/product-specs/schema-editing.md's "Column type catalog") before an adapter is ever called -
 * a `dataType` sits inside a DDL statement, not a value position a prepared statement can
 * parameter-bind, so an unvalidated string here would be a real SQL-injection surface. MongoDB has
 * no catalog to check against - its `createTable` ignores `columns` entirely (see the spec's
 * "MongoDB's column operations" section), so this is a no-op there.
 */
export function validateColumnDefinitions(
  columns: ColumnDefinition[],
  engine: DatabaseAdapter["engine"]
): void {
  const catalog = COLUMN_TYPE_CATALOG[engine];
  if (!catalog) return;
  for (const column of columns) {
    if (!catalog.includes(column.dataType)) {
      throw badRequest(
        `Column "${column.name}" has an unsupported type "${column.dataType}" for ${engine}.`
      );
    }
  }
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
