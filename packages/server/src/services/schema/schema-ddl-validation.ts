import { DATABASE_ENGINES } from "@qyre/core";
import type { ColumnDefinition, DatabaseEngine, TableMetadata } from "@qyre/core";
import { MYSQL_COLUMN_TYPES, POSTGRES_COLUMN_TYPES, SQLITE_COLUMN_TYPES } from "@qyre/core";
import type { DatabaseAdapter } from "@qyre/driver-contract";
import type { FastifyRequest } from "fastify";
import type { ServerContext } from "../../types/server.js";

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

export function assertDdlTarget(tableMetadata: TableMetadata): void {
  if (tableMetadata.kind !== "table" && tableMetadata.kind !== "collection") {
    throw badRequest(`Cannot run a schema-editing operation on a ${tableMetadata.kind}.`);
  }
}

export function assertColumnExists(tableMetadata: TableMetadata, column: string): void {
  if (!tableMetadata.columns.some((candidate) => candidate.name === column)) {
    throw badRequest(`Unknown column "${column}".`);
  }
}

export function assertIndexColumnsExist(
  tableMetadata: TableMetadata,
  columns: string[],
  engine: DatabaseAdapter["engine"]
): void {
  if (engine === DATABASE_ENGINES.mongodb) return;
  for (const column of columns) {
    if (!tableMetadata.columns.some((candidate) => candidate.name === column)) {
      throw badRequest(`Unknown column "${column}".`);
    }
  }
}

export function assertIndexExists(tableMetadata: TableMetadata, indexName: string): void {
  if (!tableMetadata.indexes?.some((candidate) => candidate.name === indexName)) {
    throw badRequest(`Unknown index "${indexName}".`);
  }
}

const COLUMN_TYPE_CATALOG: Partial<Record<DatabaseEngine, readonly string[]>> = {
  [DATABASE_ENGINES.postgres]: POSTGRES_COLUMN_TYPES,
  [DATABASE_ENGINES.mysql]: MYSQL_COLUMN_TYPES,
  [DATABASE_ENGINES.sqlite]: SQLITE_COLUMN_TYPES
};

/** Validate DDL types before interpolating them into engine statements. */
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

export function validateColumnDefinitions(
  columns: ColumnDefinition[],
  engine: DatabaseAdapter["engine"]
): void {
  for (const column of columns) validateColumnDataType(column.dataType, engine, column.name);
}

export function ddlRejected(
  ctx: ServerContext,
  request: FastifyRequest,
  operation: DdlOperation,
  schema: string,
  table: string,
  message: string,
  statusCode: number
): Error {
  if (statusCode !== 403) {
    ctx.eventLog.log("warn", `${operation} rejected: ${message}`);
    request.log.warn(
      { operation, schema, table, durationMs: 0, outcome: "rejected" },
      `${operation} rejected`
    );
  }
  return Object.assign(new Error(message), { statusCode });
}
