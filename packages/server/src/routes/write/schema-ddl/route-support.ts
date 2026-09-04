import { DATABASE_ENGINES } from "@qyre/core";
import type { DatabaseEngine } from "@qyre/core";
import type { FastifyRequest } from "fastify";
import type { ServerContext } from "../../../types/server.js";
import type { DdlOperation } from "../../../services/schema/schema-ddl-validation.js";

/** MongoDB collections have no fixed column structure to alter. */
export function mongoColumnRoutesNotApplicable(engine: DatabaseEngine): boolean {
  return engine === DATABASE_ENGINES.mongodb;
}

export function logDdlSuccess(
  ctx: ServerContext,
  request: FastifyRequest,
  operation: DdlOperation,
  schema: string,
  table: string,
  startedAt: number,
  message: string
): void {
  const durationMs = Math.round(performance.now() - startedAt);
  ctx.eventLog.log("info", message);
  request.log.info(
    { operation, schema, table, durationMs, outcome: "success" },
    `${operation} succeeded`
  );
}

export function logDdlFailure(
  ctx: ServerContext,
  request: FastifyRequest,
  operation: DdlOperation,
  schema: string,
  table: string,
  startedAt: number,
  error: unknown
): void {
  if (ctx.adapter?.classifyPermissionDenied(error)) return;
  const durationMs = Math.round(performance.now() - startedAt);
  const detail = error instanceof Error ? error.message : String(error);
  ctx.eventLog.log("error", `${operation} failed for ${schema}.${table}: ${detail}`);
  request.log.error(
    { operation, schema, table, durationMs, outcome: "error" },
    `${operation} failed`
  );
}
