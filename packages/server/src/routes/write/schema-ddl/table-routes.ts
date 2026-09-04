import {
  confirmedNameRequestSchema,
  createTableRequestSchema,
  renameTableRequestSchema
} from "@qyre/core";
import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../../../app.js";
import { applyReadOnlyOverride } from "../../../services/access/read-only-capabilities.js";
import { permissionRoute } from "../../../services/access/permission-denied.js";
import { requireAdapter } from "../../../services/connection/require-adapter.js";
import {
  assertDdlTarget,
  ddlRejected,
  validateColumnDefinitions
} from "../../../services/schema/schema-ddl-validation.js";
import { logDdlFailure, logDdlSuccess } from "./route-support.js";

export function registerTableDdlRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.post<{ Params: { schema: string }; Body: unknown }>(
    "/api/schemas/:schema/tables",
    permissionRoute({ operation: "create-table", target: "table", likelyMissingGrant: "CREATE" }),
    async (request, reply) => {
      const parsedBody = createTableRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply
          .status(400)
          .send({ error: "Request body must be { table: string, columns: ColumnDefinition[] }." });
      }
      const { schema } = request.params;
      const { table, columns } = parsedBody.data;
      const db = requireAdapter(ctx.adapter);

      const capabilities = applyReadOnlyOverride(await db.getCapabilities(), ctx.readOnly);
      if (!capabilities.supportsDdl || !db.ddl?.createTable) {
        throw ddlRejected(
          ctx,
          request,
          "createTable",
          schema,
          table,
          "This session cannot perform schema-editing operations.",
          403
        );
      }
      validateColumnDefinitions(columns, db.engine);

      const startedAt = performance.now();
      try {
        await db.ddl.createTable(schema, table, columns);
      } catch (error) {
        logDdlFailure(ctx, request, "createTable", schema, table, startedAt, error);
        throw error;
      }
      logDdlSuccess(
        ctx,
        request,
        "createTable",
        schema,
        table,
        startedAt,
        `Created table ${schema}.${table}.`
      );

      reply.status(201);
      return { schema, table };
    }
  );

  app.post<{ Params: { schema: string; table: string }; Body: unknown }>(
    "/api/tables/:schema/:table/ddl/rename",
    permissionRoute({ operation: "rename-table", target: "table", likelyMissingGrant: "ALTER" }),
    async (request, reply) => {
      const parsedBody = renameTableRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Request body must be { newName: string }." });
      }
      const { schema, table } = request.params;
      const { newName } = parsedBody.data;
      const db = requireAdapter(ctx.adapter);
      const tableMetadata = await db.getTable(schema, table);
      assertDdlTarget(tableMetadata);

      const capabilities = applyReadOnlyOverride(await db.getCapabilities(), ctx.readOnly);
      if (!capabilities.supportsDdl || !db.ddl?.renameTable) {
        throw ddlRejected(
          ctx,
          request,
          "renameTable",
          schema,
          table,
          "This session cannot perform schema-editing operations.",
          403
        );
      }

      const startedAt = performance.now();
      try {
        await db.ddl.renameTable(schema, table, newName);
      } catch (error) {
        logDdlFailure(ctx, request, "renameTable", schema, table, startedAt, error);
        throw error;
      }
      logDdlSuccess(
        ctx,
        request,
        "renameTable",
        schema,
        table,
        startedAt,
        `Renamed ${schema}.${table} to ${newName}.`
      );

      return { schema, table: newName };
    }
  );

  app.post<{ Params: { schema: string; table: string }; Body: unknown }>(
    "/api/tables/:schema/:table/ddl/truncate",
    permissionRoute({
      operation: "truncate-table",
      target: "table",
      likelyMissingGrant: "TRUNCATE or DELETE"
    }),
    async (request, reply) => {
      const parsedBody = confirmedNameRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Request body must be { confirmedName: string }." });
      }
      const { schema, table } = request.params;
      const db = requireAdapter(ctx.adapter);
      const tableMetadata = await db.getTable(schema, table);
      assertDdlTarget(tableMetadata);

      if (parsedBody.data.confirmedName !== table) {
        throw ddlRejected(
          ctx,
          request,
          "truncateTable",
          schema,
          table,
          `confirmedName must match the table name "${table}".`,
          400
        );
      }

      const capabilities = applyReadOnlyOverride(await db.getCapabilities(), ctx.readOnly);
      if (!capabilities.supportsDdl || !db.ddl?.truncateTable) {
        throw ddlRejected(
          ctx,
          request,
          "truncateTable",
          schema,
          table,
          "This session cannot perform schema-editing operations.",
          403
        );
      }

      const startedAt = performance.now();
      try {
        await db.ddl.truncateTable(schema, table);
      } catch (error) {
        logDdlFailure(ctx, request, "truncateTable", schema, table, startedAt, error);
        throw error;
      }
      logDdlSuccess(
        ctx,
        request,
        "truncateTable",
        schema,
        table,
        startedAt,
        `Truncated table ${schema}.${table}.`
      );

      return { schema, table };
    }
  );

  app.delete<{ Params: { schema: string; table: string }; Body: unknown }>(
    "/api/tables/:schema/:table",
    permissionRoute({
      operation: "drop-table",
      target: "table",
      likelyMissingGrant: "DROP or ownership"
    }),
    async (request, reply) => {
      const parsedBody = confirmedNameRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Request body must be { confirmedName: string }." });
      }
      const { schema, table } = request.params;
      const db = requireAdapter(ctx.adapter);
      const tableMetadata = await db.getTable(schema, table);
      assertDdlTarget(tableMetadata);

      if (parsedBody.data.confirmedName !== table) {
        throw ddlRejected(
          ctx,
          request,
          "dropTable",
          schema,
          table,
          `confirmedName must match the table name "${table}".`,
          400
        );
      }

      const capabilities = applyReadOnlyOverride(await db.getCapabilities(), ctx.readOnly);
      if (!capabilities.supportsDdl || !db.ddl?.dropTable) {
        throw ddlRejected(
          ctx,
          request,
          "dropTable",
          schema,
          table,
          "This session cannot perform schema-editing operations.",
          403
        );
      }

      const startedAt = performance.now();
      try {
        await db.ddl.dropTable(schema, table);
      } catch (error) {
        logDdlFailure(ctx, request, "dropTable", schema, table, startedAt, error);
        throw error;
      }
      logDdlSuccess(
        ctx,
        request,
        "dropTable",
        schema,
        table,
        startedAt,
        `Dropped table ${schema}.${table}.`
      );

      reply.status(204);
      return null;
    }
  );
}
