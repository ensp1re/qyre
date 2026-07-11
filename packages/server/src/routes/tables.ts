import { Readable } from "node:stream";
import { insertRowRequestSchema, MAX_PAGE_SIZE, rowsQuerySchema } from "@qyre/core";
import type { AllTablesResponse } from "@qyre/core";
import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../app.js";
import { csvLine } from "../services/csv.js";
import { requireAdapter } from "../services/require-adapter.js";
import { assertMutable, resolveInsertValues } from "../services/row-mutation-validation.js";
import { resolveRowQuery } from "../services/row-query.js";

export function registerTablesRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.get<{ Params: { schema: string; table: string } }>(
    "/api/tables/:schema/:table",
    async (request) => {
      const { schema, table } = request.params;
      return requireAdapter(ctx.adapter).getTable(schema, table);
    }
  );

  // Backs the Schema tab (F027): previously the browser fanned useAllTables out into one HTTP
  // request per table (plus several catalog queries within each), which could mean hundreds of
  // concurrent requests on a large database. Fetching every table's metadata server-side in one
  // request keeps that fan-out off the browser's connection pool; getAllTables() (F123) keeps it
  // off the database too, replacing the adapter-side per-table fan-out this route used to drive
  // (an unbounded Promise.all(getTable) per table) with each engine's own batched introspection.
  app.get("/api/tables", async (): Promise<AllTablesResponse> => {
    const tables = await requireAdapter(ctx.adapter).getAllTables();
    return { tables };
  });

  app.get<{ Params: { schema: string; table: string }; Querystring: Record<string, string> }>(
    "/api/tables/:schema/:table/rows",
    async (request, reply) => {
      const parsed = rowsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Invalid page/pageSize/sort/filters query parameters." });
      }
      const { schema, table } = request.params;
      const { page, pageSize, sortColumn, sortDirection, filters } = parsed.data;
      const db = requireAdapter(ctx.adapter);
      const resolved = await resolveRowQuery(db, schema, table, sortColumn, sortDirection, filters);
      return db.getRows(schema, table, page, pageSize, resolved.sort, resolved.filters);
    }
  );

  // F099: structured row insert. Gated by the F096 central read-only guard (`config: { mutating:
  // true }`) and the table's own insert permission (assertMutable) - defense in depth on top of
  // the database's own real enforcement, per docs/product-specs/permissions-and-capabilities.md.
  app.post<{ Params: { schema: string; table: string }; Body: unknown }>(
    "/api/tables/:schema/:table/rows",
    { config: { mutating: true } },
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

  // F066: streams every row of the table as CSV (honoring the sort/filters above, if any) rather
  // than capping at runReadOnlyQuery's 1,000-row limit (F050) - exporting the whole table is the
  // point.
  app.get<{ Params: { schema: string; table: string }; Querystring: Record<string, string> }>(
    "/api/tables/:schema/:table/export.csv",
    async (request, reply) => {
      const parsed = rowsQuerySchema
        .pick({ sortColumn: true, sortDirection: true, filters: true })
        .safeParse(request.query);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Invalid sortColumn/sortDirection/filters query parameters." });
      }
      const { schema, table } = request.params;
      const db = requireAdapter(ctx.adapter);
      const resolved = await resolveRowQuery(
        db,
        schema,
        table,
        parsed.data.sortColumn,
        parsed.data.sortDirection,
        parsed.data.filters
      );
      const sort = resolved.sort;
      const filters = resolved.filters;

      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="${table}.csv"`);

      const stream = new Readable({ read() {} });
      // Fetches and pushes in bounded MAX_PAGE_SIZE batches rather than materializing the whole
      // table in memory (F066) - mirrors capResultRows's philosophy (F050) for a path that must
      // NOT be capped, since exporting the whole table is the entire point of this endpoint.
      // Not awaited: the response has already started streaming (status/headers committed the
      // moment the first chunk is pushed) once this handler returns the stream below, so a
      // mid-export failure can only end the connection abruptly, not change the status code.
      void (async () => {
        let page = 0;
        let wroteHeader = false;
        for (;;) {
          const rowPage = await db.getRows(schema, table, page, MAX_PAGE_SIZE, sort, filters);
          if (!wroteHeader) {
            stream.push(`${csvLine(rowPage.columns)}\n`);
            wroteHeader = true;
          }
          for (const row of rowPage.rows) {
            stream.push(`${csvLine(rowPage.columns.map((column) => row[column]))}\n`);
          }
          if (rowPage.rows.length < MAX_PAGE_SIZE) break;
          page += 1;
        }
        stream.push(null);
      })().catch((error: unknown) => {
        stream.destroy(error instanceof Error ? error : new Error(String(error)));
      });

      return stream;
    }
  );
}
