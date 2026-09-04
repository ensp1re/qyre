import type {
  QueryParams,
  TableDocumentParams,
  TableExportParams,
  TableParams
} from "../../types/routes.js";
import { Readable } from "node:stream";
import {
  DATABASE_ENGINES,
  deleteRowsRequestSchema,
  insertRowRequestSchema,
  ROW_EXPORT_FORMATS,
  rowsQuerySchema,
  updateRowRequestSchema
} from "@qyre/core";
import type { AllTablesResponse, RowExportFormat } from "@qyre/core";
import { OperationCancelledError } from "@qyre/driver-contract";
import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../../types/server.js";
import { formatRowExport } from "../../services/rows/row-export.js";
import { issueDownloadGrant } from "../../services/access/download-grants.js";
import { permissionRoute } from "../../services/access/permission-denied.js";
import { requireAdapter } from "../../services/connection/require-adapter.js";
import {
  assertMutable,
  resolveInsertValues,
  resolveKey,
  resolveKeys,
  resolveUpdateChanges
} from "../../services/rows/row-mutation-validation.js";
import {
  resolveRowFilters,
  resolveRowQuery,
  resolveRowSearch,
  resolveRowSort
} from "../../services/rows/row-query.js";

const EXPORT_CONTENT_TYPES: Record<RowExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
  sql: "application/sql; charset=utf-8"
};

function exportFilename(table: string, format: RowExportFormat): string {
  const safeTable = table.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120) || "export";
  return `${safeTable}.${format}`;
}

const READ_TABLE_ROUTE = permissionRoute(
  { operation: "read-table", target: "table", likelyMissingGrant: "SELECT" },
  false
);

export function registerTablesRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.get<{ Params: TableParams }>(
    "/api/tables/:schema/:table",
    READ_TABLE_ROUTE,
    async (request) => {
      const { schema, table } = request.params;
      return requireAdapter(ctx.adapter).getTable(schema, table);
    }
  );

  app.get(
    "/api/tables",
    permissionRoute(
      {
        operation: "list-schemas",
        target: "query",
        likelyMissingGrant: "read access on the connected database"
      },
      false
    ),
    async (): Promise<AllTablesResponse> => {
      const tables = await requireAdapter(ctx.adapter).getAllTables();
      return { tables };
    }
  );

  app.get<{ Params: TableDocumentParams }>(
    "/api/tables/:schema/:table/document/:id",
    async (request, reply) => {
      const { schema, table, id } = request.params;
      const db = requireAdapter(ctx.adapter);
      if (db.engine !== DATABASE_ENGINES.mongodb || !db.mutations?.getDocumentText) {
        return reply.status(400).send({ error: "This engine does not support document editing." });
      }
      const document = await db.mutations.getDocumentText(schema, table, id);
      if (document === undefined) {
        return reply.status(404).send({ error: "No document with that _id exists." });
      }
      return { document };
    }
  );

  app.get<{ Params: TableParams; Querystring: QueryParams }>(
    "/api/tables/:schema/:table/rows",
    READ_TABLE_ROUTE,
    async (request, reply) => {
      const parsed = rowsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Invalid page/pageSize/sort/filters/search query parameters." });
      }
      const { schema, table } = request.params;
      const { page, pageSize, sortColumn, sortDirection, filters, search, operationId } =
        parsed.data;
      const db = requireAdapter(ctx.adapter);
      const resolved = await resolveRowQuery(
        db,
        schema,
        table,
        sortColumn,
        sortDirection,
        filters,
        search
      );
      try {
        return await db.getRows(
          schema,
          table,
          page,
          pageSize,
          resolved.sort,
          resolved.filters,
          resolved.search,
          operationId
        );
      } catch (error) {
        if (error instanceof OperationCancelledError) {
          ctx.eventLog.log("info", "Rows fetch cancelled.");
          return reply.status(499).send({ error: error.message, cancelled: true });
        }
        throw error;
      }
    }
  );

  app.post<{ Params: TableParams; Body: unknown }>(
    "/api/tables/:schema/:table/rows",
    permissionRoute({ operation: "insert", target: "table", likelyMissingGrant: "INSERT" }),
    async (request, reply) => {
      const parsedBody = insertRowRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Request body must be a JSON object." });
      }
      const { schema, table } = request.params;
      const db = requireAdapter(ctx.adapter);
      const tableMetadata = await db.getTable(schema, table);
      assertMutable(tableMetadata, "insert");
      if (!db.mutations?.insertRow) {
        return reply.status(400).send({ error: "This engine does not support inserting rows." });
      }

      const values = resolveInsertValues(tableMetadata, parsedBody.data, db.engine);
      const startedAt = performance.now();
      const result = await db.mutations.insertRow(schema, table, values);
      const durationMs = Math.round(performance.now() - startedAt);

      ctx.eventLog.log("info", `Inserted 1 row into ${schema}.${table}.`);
      request.log.info(
        { operation: "insert", schema, table, rowCount: 1, durationMs, outcome: "success" },
        "row insert succeeded"
      );

      reply.status(201);
      return result;
    }
  );

  app.patch<{ Params: TableParams; Body: unknown }>(
    "/api/tables/:schema/:table/rows",
    permissionRoute({ operation: "update", target: "table", likelyMissingGrant: "UPDATE" }),
    async (request, reply) => {
      const parsedBody = updateRowRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Request body must include key and changes." });
      }
      const { schema, table } = request.params;
      const db = requireAdapter(ctx.adapter);
      const tableMetadata = await db.getTable(schema, table);
      assertMutable(tableMetadata, "update");
      if (!db.mutations?.updateRowByKey) {
        return reply.status(400).send({ error: "This engine does not support updating rows." });
      }

      const rawChanges =
        db.engine === DATABASE_ENGINES.mongodb ? parsedBody.data.document : parsedBody.data.changes;
      if (!rawChanges) {
        return reply.status(400).send({ error: "Request body must include changes." });
      }
      if (db.engine === DATABASE_ENGINES.mongodb && !parsedBody.data.originalDocument) {
        return reply.status(400).send({ error: "Request body must include originalDocument." });
      }

      const key = resolveKey(tableMetadata, parsedBody.data.key, db.engine);
      const changes = resolveUpdateChanges(tableMetadata, rawChanges, db.engine);
      const expectedOriginal =
        db.engine === DATABASE_ENGINES.mongodb ? parsedBody.data.originalDocument : undefined;

      const startedAt = performance.now();
      const result = await db.mutations.updateRowByKey(
        schema,
        table,
        key,
        changes,
        expectedOriginal
      );
      const durationMs = Math.round(performance.now() - startedAt);

      if (result.matched === 0) {
        ctx.eventLog.log(
          "warn",
          `Update rejected: ${schema}.${table} row no longer matches (stale).`
        );
        request.log.warn(
          { operation: "update", schema, table, rowCount: 0, durationMs, outcome: "conflict" },
          "row update conflict"
        );
        return reply.status(409).send({ error: "This row was already changed or removed." });
      }

      ctx.eventLog.log("info", `Updated 1 row in ${schema}.${table}.`);
      request.log.info(
        {
          operation: "update",
          schema,
          table,
          rowCount: result.matched,
          durationMs,
          outcome: "success"
        },
        "row update succeeded"
      );

      return result;
    }
  );

  app.delete<{ Params: TableParams; Body: unknown }>(
    "/api/tables/:schema/:table/rows",
    permissionRoute({ operation: "delete", target: "table", likelyMissingGrant: "DELETE" }),
    async (request, reply) => {
      const parsedBody = deleteRowsRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Request body must include keys." });
      }
      const { schema, table } = request.params;
      const db = requireAdapter(ctx.adapter);
      const tableMetadata = await db.getTable(schema, table);
      assertMutable(tableMetadata, "delete");
      if (!db.mutations?.deleteRowsByKey) {
        return reply.status(400).send({ error: "This engine does not support deleting rows." });
      }

      const keys = resolveKeys(tableMetadata, parsedBody.data.keys, db.engine);

      const startedAt = performance.now();
      const result = await db.mutations.deleteRowsByKey(schema, table, keys);
      const durationMs = Math.round(performance.now() - startedAt);

      if (result.deleted < keys.length) {
        ctx.eventLog.log(
          "warn",
          `Delete rejected: only ${result.deleted}/${keys.length} row(s) in ${schema}.${table} still matched (stale).`
        );
        request.log.warn(
          {
            operation: "delete",
            schema,
            table,
            rowCount: result.deleted,
            durationMs,
            outcome: "conflict"
          },
          "row delete conflict"
        );
        return reply
          .status(409)
          .send({ error: "Some of these rows were already changed or removed." });
      }

      ctx.eventLog.log("info", `Deleted ${result.deleted} row(s) from ${schema}.${table}.`);
      request.log.info(
        {
          operation: "delete",
          schema,
          table,
          rowCount: result.deleted,
          durationMs,
          outcome: "success"
        },
        "row delete succeeded"
      );

      return result;
    }
  );

  app.post("/api/exports/grant", async () => ({ grant: issueDownloadGrant() }));

  app.get<{
    Params: TableExportParams;
    Querystring: QueryParams;
  }>("/api/tables/:schema/:table/export.:format", async (request, reply) => {
    const format = request.params.format as RowExportFormat;
    if (!ROW_EXPORT_FORMATS.includes(format)) {
      return reply.status(400).send({ error: "Export format must be csv, json, or sql." });
    }
    const parsed = rowsQuerySchema
      .pick({ sortColumn: true, sortDirection: true, filters: true, search: true })
      .safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Invalid sortColumn/sortDirection/filters/search query parameters." });
    }
    const { schema, table } = request.params;
    const db = requireAdapter(ctx.adapter);
    const [metadata, capabilities] = await Promise.all([
      db.getTable(schema, table),
      db.getCapabilities()
    ]);
    if (!capabilities.rowExportFormats.includes(format)) {
      return reply.status(400).send({ error: `This engine does not support ${format} export.` });
    }
    if (format === "sql" && !db.formatSqlInsert) {
      return reply.status(400).send({ error: "This engine does not support SQL INSERT export." });
    }

    const sort = resolveRowSort(metadata, parsed.data.sortColumn, parsed.data.sortDirection);
    const filters = resolveRowFilters(metadata, parsed.data.filters, db.engine);
    const search = resolveRowSearch(metadata, parsed.data.search);
    const columns = metadata.columns.map((column) => column.name);
    const rows = db.streamRows(schema, table, metadata.columns, sort, filters, search);

    reply.header("Content-Type", EXPORT_CONTENT_TYPES[format]);
    reply.header("Content-Disposition", `attachment; filename="${exportFilename(table, format)}"`);
    return Readable.from(formatRowExport(db, format, schema, table, columns, rows));
  });
}
