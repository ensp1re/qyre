import { indexDefinitionSchema } from "@qyre/core";
import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../../../app.js";
import { applyReadOnlyOverride } from "../../../services/access/read-only-capabilities.js";
import { permissionRoute } from "../../../services/access/permission-denied.js";
import { requireAdapter } from "../../../services/connection/require-adapter.js";
import {
  assertDdlTarget,
  assertIndexColumnsExist,
  assertIndexExists,
  ddlRejected
} from "../../../services/schema/schema-ddl-validation.js";
import { logDdlFailure, logDdlSuccess } from "./route-support.js";

export function registerIndexDdlRoutes(app: FastifyInstance, ctx: ServerContext): void {
  // Create an index. Non-destructive - a plain review-before-submit step, no typed confirmation.
  // Gated on supportsIndexManagement (not supportsDdl - a distinct capability F090 reserved for
  // index grants specifically), per docs/product-specs/schema-editing.md.
  app.post<{ Params: { schema: string; table: string }; Body: unknown }>(
    "/api/tables/:schema/:table/ddl/indexes",
    permissionRoute({
      operation: "create-index",
      target: "index",
      likelyMissingGrant: "INDEX, ALTER, or ownership"
    }),
    async (request, reply) => {
      const { schema, table } = request.params;
      const db = requireAdapter(ctx.adapter);

      const parsedBody = indexDefinitionSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Request body must be an IndexDefinition." });
      }
      const definition = parsedBody.data;
      const tableMetadata = await db.getTable(schema, table);
      assertDdlTarget(tableMetadata);
      assertIndexColumnsExist(tableMetadata, definition.columns, db.engine);

      const capabilities = applyReadOnlyOverride(await db.getCapabilities(), ctx.readOnly);
      if (!capabilities.supportsIndexManagement || !db.ddl?.createIndex) {
        throw ddlRejected(
          ctx,
          request,
          "createIndex",
          schema,
          table,
          "This session cannot manage indexes.",
          403
        );
      }

      const startedAt = performance.now();
      try {
        await db.ddl.createIndex(schema, table, definition);
      } catch (error) {
        logDdlFailure(ctx, request, "createIndex", schema, table, startedAt, error);
        throw error;
      }
      logDdlSuccess(
        ctx,
        request,
        "createIndex",
        schema,
        table,
        startedAt,
        `Created index ${definition.name} on ${schema}.${table}.`
      );

      reply.status(201);
      return { schema, table, index: definition.name };
    }
  );

  // Drop an index. A plain explicit confirming click, not typed confirmation - an index carries no
  // user data of its own and is recoverable by recreating it, a materially lower-risk action than
  // dropping table structure or row data (docs/product-specs/schema-editing.md's "Typed-
  // confirmation" section).
  app.delete<{ Params: { schema: string; table: string; indexName: string } }>(
    "/api/tables/:schema/:table/ddl/indexes/:indexName",
    permissionRoute({
      operation: "drop-index",
      target: "index",
      likelyMissingGrant: "INDEX, ALTER, or ownership"
    }),
    async (request, reply) => {
      const { schema, table, indexName } = request.params;
      const db = requireAdapter(ctx.adapter);
      const tableMetadata = await db.getTable(schema, table);
      assertDdlTarget(tableMetadata);
      assertIndexExists(tableMetadata, indexName);

      const capabilities = applyReadOnlyOverride(await db.getCapabilities(), ctx.readOnly);
      if (!capabilities.supportsIndexManagement || !db.ddl?.dropIndex) {
        throw ddlRejected(
          ctx,
          request,
          "dropIndex",
          schema,
          table,
          "This session cannot manage indexes.",
          403
        );
      }

      const startedAt = performance.now();
      try {
        await db.ddl.dropIndex(schema, table, indexName);
      } catch (error) {
        logDdlFailure(ctx, request, "dropIndex", schema, table, startedAt, error);
        throw error;
      }
      logDdlSuccess(
        ctx,
        request,
        "dropIndex",
        schema,
        table,
        startedAt,
        `Dropped index ${indexName} on ${schema}.${table}.`
      );

      reply.status(204);
      return null;
    }
  );
}
