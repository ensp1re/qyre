import {
  columnDefinitionSchema,
  confirmedNameRequestSchema,
  createTableRequestSchema,
  indexDefinitionSchema,
  renameTableRequestSchema,
  updateColumnRequestSchema
} from "@qyre/core";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ServerContext } from "../app.js";
import { applyReadOnlyOverride } from "../services/read-only-capabilities.js";
import { permissionRoute } from "../services/permission-denied.js";
import { requireAdapter } from "../services/require-adapter.js";
import {
  assertColumnExists,
  assertDdlTarget,
  assertIndexColumnsExist,
  assertIndexExists,
  ddlRejected,
  validateColumnDataType,
  validateColumnDefinitions,
  type DdlOperation
} from "../services/schema-ddl-validation.js";

/** MongoDB has no fixed structure a "column" concept could alter (docs/product-specs/
 * schema-editing.md's "MongoDB's column operations" section) - registered for every engine (never
 * a bare 404, which could read as a routing bug) but engine-conditionally rejected here, the same
 * pattern `POST /api/mutations/commit` already uses for MongoDB. */
function mongoColumnRoutesNotApplicable(engine: string): boolean {
  return engine === "mongodb";
}

function logDdlSuccess(
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

function logDdlFailure(
  ctx: ServerContext,
  request: FastifyRequest,
  operation: DdlOperation,
  schema: string,
  table: string,
  startedAt: number,
  error: unknown
): void {
  // The global handler owns authoritative denials so their raw engine text is never logged and
  // the EventLog receives exactly one safe denial entry.
  if (ctx.adapter?.classifyPermissionDenied(error)) return;
  const durationMs = Math.round(performance.now() - startedAt);
  const detail = error instanceof Error ? error.message : String(error);
  ctx.eventLog.log("error", `${operation} failed for ${schema}.${table}: ${detail}`);
  request.log.error(
    { operation, schema, table, durationMs, outcome: "error" },
    `${operation} failed`
  );
}

/** Table/collection-lifecycle DDL routes (F110), per docs/product-specs/schema-editing.md. Every
 * route is gated by both the F096 central read-only guard (`config: { mutating: true }`) and the
 * session's `supportsDdl` capability - the same two-tier gate every mutating route in this plan
 * already applies, just checking the DDL-specific capability flag instead of `supportsRowMutations`. */
export function registerSchemaDdlRoutes(app: FastifyInstance, ctx: ServerContext): void {
  // Create a new table/collection scoped to an existing schema/database. Non-destructive - a plain
  // review-before-submit step in the UI, no typed confirmation.
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

  // Rename a table/collection. Non-destructive - a plain review-before-submit step, no typed
  // confirmation.
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

  // Truncate - deletes every row, keeps the table/collection itself. Destructive: requires the
  // caller to type the table's exact name, re-validated server-side.
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

  // Drop table/collection. Destructive: requires the caller to type the table's exact name,
  // re-validated server-side. A request body on DELETE is valid HTTP, matching row-editing.md's
  // identical precedent for its own DELETE route.
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
