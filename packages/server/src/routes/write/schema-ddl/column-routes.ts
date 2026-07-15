import {
  columnDefinitionSchema,
  confirmedNameRequestSchema,
  updateColumnRequestSchema
} from "@qyre/core";
import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../../../app.js";
import { applyReadOnlyOverride } from "../../../services/access/read-only-capabilities.js";
import { permissionRoute } from "../../../services/access/permission-denied.js";
import { requireAdapter } from "../../../services/connection/require-adapter.js";
import {
  assertColumnExists,
  assertDdlTarget,
  ddlRejected,
  validateColumnDataType
} from "../../../services/schema/schema-ddl-validation.js";
import { logDdlFailure, logDdlSuccess, mongoColumnRoutesNotApplicable } from "./route-support.js";

export function registerColumnDdlRoutes(app: FastifyInstance, ctx: ServerContext): void {
  // Add a column. Non-destructive - a plain review-before-submit step, no typed confirmation.
  app.post<{ Params: { schema: string; table: string }; Body: unknown }>(
    "/api/tables/:schema/:table/ddl/columns",
    permissionRoute({ operation: "add-column", target: "column", likelyMissingGrant: "ALTER" }),
    async (request, reply) => {
      const { schema, table } = request.params;
      const db = requireAdapter(ctx.adapter);
      if (mongoColumnRoutesNotApplicable(db.engine)) {
        return reply.status(400).send({ error: "Collections don't have columns to alter." });
      }

      const parsedBody = columnDefinitionSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Request body must be a ColumnDefinition." });
      }
      const column = parsedBody.data;
      const tableMetadata = await db.getTable(schema, table);
      assertDdlTarget(tableMetadata);

      const capabilities = applyReadOnlyOverride(await db.getCapabilities(), ctx.readOnly);
      if (!capabilities.supportsDdl || !db.ddl?.addColumn) {
        throw ddlRejected(
          ctx,
          request,
          "addColumn",
          schema,
          table,
          "This session cannot perform schema-editing operations.",
          403
        );
      }
      validateColumnDataType(column.dataType, db.engine, column.name);

      const startedAt = performance.now();
      try {
        await db.ddl.addColumn(schema, table, column);
      } catch (error) {
        logDdlFailure(ctx, request, "addColumn", schema, table, startedAt, error);
        throw error;
      }
      logDdlSuccess(
        ctx,
        request,
        "addColumn",
        schema,
        table,
        startedAt,
        `Added column ${schema}.${table}.${column.name}.`
      );

      reply.status(201);
      return { schema, table, column: column.name };
    }
  );

  // Rename and/or alter a column in one request - either or both together, per
  // docs/product-specs/schema-editing.md's API-shapes section. Non-destructive - a plain
  // review-before-submit step, no typed confirmation.
  app.patch<{ Params: { schema: string; table: string; column: string }; Body: unknown }>(
    "/api/tables/:schema/:table/ddl/columns/:column",
    permissionRoute({ operation: "alter-column", target: "column", likelyMissingGrant: "ALTER" }),
    async (request, reply) => {
      const { schema, table, column } = request.params;
      const db = requireAdapter(ctx.adapter);
      if (mongoColumnRoutesNotApplicable(db.engine)) {
        return reply.status(400).send({ error: "Collections don't have columns to alter." });
      }

      const parsedBody = updateColumnRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply
          .status(400)
          .send({ error: "Request body must include newName and/or changes." });
      }
      const { newName, changes } = parsedBody.data;
      const tableMetadata = await db.getTable(schema, table);
      assertDdlTarget(tableMetadata);
      assertColumnExists(tableMetadata, column);

      const capabilities = applyReadOnlyOverride(await db.getCapabilities(), ctx.readOnly);
      if (!capabilities.supportsDdl) {
        throw ddlRejected(
          ctx,
          request,
          newName !== undefined ? "renameColumn" : "alterColumn",
          schema,
          table,
          "This session cannot perform schema-editing operations.",
          403
        );
      }
      if (changes?.dataType !== undefined) {
        validateColumnDataType(changes.dataType, db.engine, column);
      }

      const renameAndAlterColumn = db.ddl?.renameAndAlterColumn;
      if (!renameAndAlterColumn) {
        return reply
          .status(400)
          .send({ error: "This engine does not support renaming or altering columns." });
      }

      // F134: one call combining both steps - Postgres/SQLite run it as one transaction (a mid-
      // request failure rolls back everything, including an already-issued rename, so this only
      // ever resolves fully applied or throws); MySQL has no transactional DDL to wrap, so a
      // rename that already committed before a following alter failure is reported back as a
      // partial result instead of thrown, so the caller never treats a half-applied edit as a
      // total failure or retries into "Unknown column".
      const operation = newName !== undefined ? "renameColumn" : "alterColumn";
      const startedAt = performance.now();
      let result;
      try {
        result = await renameAndAlterColumn(schema, table, column, { newName, changes });
      } catch (error) {
        logDdlFailure(ctx, request, operation, schema, table, startedAt, error);
        throw error;
      }

      if (result.alterError) {
        const durationMs = Math.round(performance.now() - startedAt);
        const message = `Renamed column ${schema}.${table}.${column} to ${result.column}, but the alter failed: ${result.alterError}`;
        ctx.eventLog.log("warn", message);
        request.log.warn(
          { operation: "alterColumn", schema, table, durationMs, outcome: "partial" },
          message
        );
        return reply.status(200).send({ schema, table, ...result });
      }

      logDdlSuccess(
        ctx,
        request,
        operation,
        schema,
        table,
        startedAt,
        result.renamed && result.altered
          ? `Renamed column ${schema}.${table}.${column} to ${result.column} and altered it.`
          : result.renamed
            ? `Renamed column ${schema}.${table}.${column} to ${result.column}.`
            : `Altered column ${schema}.${table}.${result.column}.`
      );

      return { schema, table, ...result };
    }
  );

  // Drop a column. Destructive: requires the caller to type the column's exact name, re-validated
  // server-side. A request body on DELETE is valid HTTP, matching row-editing.md's identical
  // precedent for its own DELETE route.
  app.delete<{ Params: { schema: string; table: string; column: string }; Body: unknown }>(
    "/api/tables/:schema/:table/ddl/columns/:column",
    permissionRoute({ operation: "drop-column", target: "column", likelyMissingGrant: "ALTER" }),
    async (request, reply) => {
      const { schema, table, column } = request.params;
      const db = requireAdapter(ctx.adapter);
      if (mongoColumnRoutesNotApplicable(db.engine)) {
        return reply.status(400).send({ error: "Collections don't have columns to alter." });
      }

      const parsedBody = confirmedNameRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Request body must be { confirmedName: string }." });
      }
      const tableMetadata = await db.getTable(schema, table);
      assertDdlTarget(tableMetadata);
      assertColumnExists(tableMetadata, column);

      if (parsedBody.data.confirmedName !== column) {
        throw ddlRejected(
          ctx,
          request,
          "dropColumn",
          schema,
          table,
          `confirmedName must match the column name "${column}".`,
          400
        );
      }

      const capabilities = applyReadOnlyOverride(await db.getCapabilities(), ctx.readOnly);
      if (!capabilities.supportsDdl || !db.ddl?.dropColumn) {
        throw ddlRejected(
          ctx,
          request,
          "dropColumn",
          schema,
          table,
          "This session cannot perform schema-editing operations.",
          403
        );
      }

      const startedAt = performance.now();
      try {
        await db.ddl.dropColumn(schema, table, column);
      } catch (error) {
        logDdlFailure(ctx, request, "dropColumn", schema, table, startedAt, error);
        throw error;
      }
      logDdlSuccess(
        ctx,
        request,
        "dropColumn",
        schema,
        table,
        startedAt,
        `Dropped column ${schema}.${table}.${column}.`
      );

      reply.status(204);
      return null;
    }
  );
}
