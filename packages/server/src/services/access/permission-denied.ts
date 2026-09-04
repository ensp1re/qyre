import type { PermissionDeniedOperation, PermissionDeniedResponse } from "@qyre/core";
import type { DatabaseAdapter, PermissionDenialKind } from "@qyre/driver-contract";
import type { FastifyRequest } from "fastify";

type PermissionTarget = "table" | "column" | "index" | "database" | "schema" | "batch" | "query";

export interface PermissionDeniedRouteContext {
  readonly operation: PermissionDeniedOperation;
  readonly target: PermissionTarget;
  readonly likelyMissingGrant: string;
}

declare module "fastify" {
  interface FastifyContextConfig {
    /** Metadata the global error handler uses to normalize an authoritative engine denial. */
    permissionDenied?: PermissionDeniedRouteContext;
  }
}

export function permissionRoute(
  context: PermissionDeniedRouteContext,
  mutating = true
): { config: { mutating: boolean; permissionDenied: PermissionDeniedRouteContext } } {
  return { config: { mutating, permissionDenied: context } };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function tableName(request: FastifyRequest): string {
  const params = record(request.params);
  const body = record(request.body);
  const schema = text(params.schema) ?? "current schema";
  const table = text(params.table) ?? text(body.table) ?? "target table";
  return `${schema}.${table}`;
}

function batchTarget(request: FastifyRequest): string {
  const ops = record(request.body).ops;
  if (!Array.isArray(ops)) return "the staged batch";
  const tables = [
    ...new Set(
      ops.map((op) => {
        const item = record(op);
        const schema = text(item.schema);
        const table = text(item.table);
        return schema && table ? `${schema}.${table}` : undefined;
      })
    )
  ].filter((value): value is string => value !== undefined);
  if (tables.length === 0) return "the staged batch";
  if (tables.length === 1) return tables[0]!;
  const shown = tables.slice(0, 3).join(", ");
  return `${tables.length} tables (${shown}${tables.length > 3 ? ", …" : ""})`;
}

export function permissionObject(request: FastifyRequest, target: PermissionTarget): string {
  const params = record(request.params);
  const body = record(request.body);
  switch (target) {
    case "table":
      return tableName(request);
    case "column":
      return `${tableName(request)}.${text(params.column) ?? text(body.name) ?? "target column"}`;
    case "index":
      return `${tableName(request)}.${text(params.indexName) ?? text(body.name) ?? "target index"}`;
    case "database":
      return text(params.database) ?? text(body.database) ?? "the target database";
    case "schema":
      return text(params.schema) ?? text(body.schema) ?? "the target schema";
    case "batch":
      return batchTarget(request);
    case "query":
      return "the current database";
  }
}

function likelyGrant(
  context: PermissionDeniedRouteContext,
  kind: PermissionDenialKind,
  object: string
): string {
  if (kind === "ownership") return `ownership of ${object}`;
  if (kind === "read-only") return "write access on the current connection";
  return context.likelyMissingGrant;
}

/** Returns the safe shared 403 body for a classified engine denial, never raw engine text. */
export function permissionDeniedResponse(
  adapter: DatabaseAdapter | undefined,
  request: FastifyRequest,
  error: unknown
): PermissionDeniedResponse | undefined {
  const context = request.routeOptions.config.permissionDenied;
  if (!adapter || !context || typeof adapter.classifyPermissionDenied !== "function") {
    return undefined;
  }
  const statusCode =
    error && typeof error === "object" ? (error as { statusCode?: unknown }).statusCode : undefined;
  const kind =
    adapter.classifyPermissionDenied(error) ?? (statusCode === 403 ? "permission" : undefined);
  if (!kind) return undefined;

  const object = permissionObject(request, context.target);
  const missingGrant = likelyGrant(context, kind, object);
  const action = context.operation.replaceAll("-", " ");
  return {
    error: `Permission denied while attempting to ${action} on ${object}. The connected role likely needs ${missingGrant}.`,
    code: "permission-denied",
    operation: context.operation,
    object,
    likelyMissingGrant: missingGrant
  };
}
