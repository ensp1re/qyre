import {
  confirmedNameRequestSchema,
  createDatabaseRequestSchema,
  createSchemaRequestSchema
} from "@qyre/core";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ServerContext } from "../app.js";
import { applyReadOnlyOverride } from "../services/read-only-capabilities.js";
import { permissionRoute } from "../services/permission-denied.js";
import { requireAdapter } from "../services/require-adapter.js";

/** Database/schema-lifecycle operations landed by F115, per docs/product-specs/schema-editing.md's
 * audit-event contract - a separate type from schema-ddl-validation.ts's `DdlOperation` since these
 * target a database/schema, not a `schema.table` pair. `listDatabases` is a read, never audited. */
type AdminOperation = "createDatabase" | "dropDatabase" | "createSchema" | "dropSchema";

function logAdminSuccess(
  ctx: ServerContext,
  request: FastifyRequest,
  operation: AdminOperation,
  target: string,
  startedAt: number,
  message: string
): void {
  const durationMs = Math.round(performance.now() - startedAt);
  ctx.eventLog.log("info", message);
  request.log.info({ operation, target, durationMs, outcome: "success" }, `${operation} succeeded`);
}

function logAdminFailure(
  ctx: ServerContext,
  request: FastifyRequest,
  operation: AdminOperation,
  target: string,
  startedAt: number,
  error: unknown
): void {
  if (ctx.adapter?.classifyPermissionDenied(error)) return;
  const durationMs = Math.round(performance.now() - startedAt);
  const detail = error instanceof Error ? error.message : String(error);
  ctx.eventLog.log("error", `${operation} failed for ${target}: ${detail}`);
  request.log.error({ operation, target, durationMs, outcome: "error" }, `${operation} failed`);
}

/** A "warn"/"rejected" outcome (confirmed-name mismatch or capability rejection) - the same
 * explicit pre-throw logging schema-ddl-validation.ts's `ddlRejected` does, since the generic
 * error handler only logs an EventLog entry for >=500s. */
function adminRejected(
  ctx: ServerContext,
  request: FastifyRequest,
  operation: AdminOperation,
  target: string,
  message: string,
  statusCode: number
): Error {
  if (statusCode !== 403) {
    ctx.eventLog.log("warn", `${operation} rejected: ${message}`);
    request.log.warn(
      { operation, target, durationMs: 0, outcome: "rejected" },
      `${operation} rejected`
    );
  }
  return Object.assign(new Error(message), { statusCode });
}

const CAPABILITY_MESSAGE = "This session cannot manage databases.";

/**
 * Database/schema-lifecycle routes (F115), per docs/product-specs/schema-editing.md's "Database
 * and schema lifecycle" section. Every mutating route is gated by both the F096 central read-only
 * guard (`config: { mutating: true }`) and the session's `supportsDatabaseManagement` capability -
 * the same two-tier gate every DDL route already applies. An absent adapter member is a clean
 * per-engine 400 (SQLite has no admin namespace at all; MongoDB has no `createDatabase`; only
 * Postgres has the schema pair), mirroring the MongoDB column-routes precedent - never a bare 404
 * that could read as a routing bug.
 */
export function registerDatabaseAdminRoutes(app: FastifyInstance, ctx: ServerContext): void {
  // List every non-system database on the connected server. A read - no mutating gate, no
  // capability check (the underlying catalogs are readable regardless of write grants).
  app.get("/api/databases", async (request, reply) => {
    const db = requireAdapter(ctx.adapter);
    const listDatabases = db.admin?.listDatabases;
    if (!listDatabases) {
      return reply
        .status(400)
        .send({ error: "This engine manages exactly one database per connection." });
    }
    return { databases: await listDatabases() };
  });

  // Create a database. Non-destructive - a plain review-before-submit step, no typed confirmation.
  app.post<{ Body: unknown }>(
    "/api/databases",
    permissionRoute({
      operation: "create-database",
      target: "database",
      likelyMissingGrant: "CREATE DATABASE"
    }),
    async (request, reply) => {
      const parsedBody = createDatabaseRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Request body must be { database: string }." });
      }
      const { database } = parsedBody.data;
      const db = requireAdapter(ctx.adapter);

      const createDatabase = db.admin?.createDatabase;
      if (!createDatabase) {
        return reply.status(400).send({
          error:
            db.engine === "mongodb"
              ? "MongoDB creates databases implicitly on the first write into them - create a collection instead."
              : "This engine does not support creating databases."
        });
      }

      const capabilities = applyReadOnlyOverride(await db.getCapabilities(), ctx.readOnly);
      if (!capabilities.supportsDatabaseManagement) {
        throw adminRejected(ctx, request, "createDatabase", database, CAPABILITY_MESSAGE, 403);
      }

      const startedAt = performance.now();
      try {
        await createDatabase(database);
      } catch (error) {
        logAdminFailure(ctx, request, "createDatabase", database, startedAt, error);
        throw error;
      }
      logAdminSuccess(
        ctx,
        request,
        "createDatabase",
        database,
        startedAt,
        `Created database ${database}.`
      );

      reply.status(201);
      return { database };
    }
  );

  // Drop a database. Destructive: requires the caller to type the database's exact name,
  // re-validated server-side, per the spec's typed-confirmation rule.
  app.delete<{ Params: { database: string }; Body: unknown }>(
    "/api/databases/:database",
    permissionRoute({
      operation: "drop-database",
      target: "database",
      likelyMissingGrant: "DROP DATABASE or ownership"
    }),
    async (request, reply) => {
      const parsedBody = confirmedNameRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Request body must be { confirmedName: string }." });
      }
      const { database } = request.params;
      const db = requireAdapter(ctx.adapter);

      const admin = db.admin;
      if (!admin?.dropDatabase || !admin.listDatabases) {
        return reply
          .status(400)
          .send({ error: "This engine manages exactly one database per connection." });
      }

      const databases = await admin.listDatabases();
      if (!databases.includes(database)) {
        return reply.status(404).send({ error: `Unknown database "${database}".` });
      }

      if (parsedBody.data.confirmedName !== database) {
        throw adminRejected(
          ctx,
          request,
          "dropDatabase",
          database,
          `confirmedName must match the database name "${database}".`,
          400
        );
      }

      const capabilities = applyReadOnlyOverride(await db.getCapabilities(), ctx.readOnly);
      if (!capabilities.supportsDatabaseManagement) {
        throw adminRejected(ctx, request, "dropDatabase", database, CAPABILITY_MESSAGE, 403);
      }

      const startedAt = performance.now();
      try {
        await admin.dropDatabase(database);
      } catch (error) {
        logAdminFailure(ctx, request, "dropDatabase", database, startedAt, error);
        throw error;
      }
      logAdminSuccess(
        ctx,
        request,
        "dropDatabase",
        database,
        startedAt,
        `Dropped database ${database}.`
      );

      reply.status(204);
      return null;
    }
  );

  // Create a schema (Postgres only - MySQL's "schema" IS its database, SQLite/MongoDB have no
  // schema concept below the database). Non-destructive - no typed confirmation.
  app.post<{ Body: unknown }>(
    "/api/schemas",
    permissionRoute({ operation: "create-schema", target: "schema", likelyMissingGrant: "CREATE" }),
    async (request, reply) => {
      const parsedBody = createSchemaRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Request body must be { schema: string }." });
      }
      const { schema } = parsedBody.data;
      const db = requireAdapter(ctx.adapter);

      const createSchema = db.admin?.createSchema;
      if (!createSchema) {
        return reply.status(400).send({ error: "This engine does not support creating schemas." });
      }

      const capabilities = applyReadOnlyOverride(await db.getCapabilities(), ctx.readOnly);
      if (!capabilities.supportsDatabaseManagement) {
        throw adminRejected(ctx, request, "createSchema", schema, CAPABILITY_MESSAGE, 403);
      }

      const startedAt = performance.now();
      try {
        await createSchema(schema);
      } catch (error) {
        logAdminFailure(ctx, request, "createSchema", schema, startedAt, error);
        throw error;
      }
      logAdminSuccess(ctx, request, "createSchema", schema, startedAt, `Created schema ${schema}.`);

      reply.status(201);
      return { schema };
    }
  );

  // Drop a schema (Postgres only). Destructive: requires the caller to type the schema's exact
  // name, re-validated server-side. No CASCADE - dropping a non-empty schema surfaces Postgres's
  // own dependency error rather than silently taking every contained table with it.
  app.delete<{ Params: { schema: string }; Body: unknown }>(
    "/api/schemas/:schema",
    permissionRoute({
      operation: "drop-schema",
      target: "schema",
      likelyMissingGrant: "DROP or ownership"
    }),
    async (request, reply) => {
      const parsedBody = confirmedNameRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Request body must be { confirmedName: string }." });
      }
      const { schema } = request.params;
      const db = requireAdapter(ctx.adapter);

      const dropSchema = db.admin?.dropSchema;
      if (!dropSchema) {
        return reply.status(400).send({ error: "This engine does not support dropping schemas." });
      }

      // No exists-first 404 here, unlike dropDatabase: getOverview() derives schemas from tables,
      // so a legitimately empty schema (the most common drop target) never appears in it, and
      // there is no other schema list in the adapter surface. A nonexistent schema surfaces
      // Postgres's own "schema does not exist" error instead.
      if (parsedBody.data.confirmedName !== schema) {
        throw adminRejected(
          ctx,
          request,
          "dropSchema",
          schema,
          `confirmedName must match the schema name "${schema}".`,
          400
        );
      }

      const capabilities = applyReadOnlyOverride(await db.getCapabilities(), ctx.readOnly);
      if (!capabilities.supportsDatabaseManagement) {
        throw adminRejected(ctx, request, "dropSchema", schema, CAPABILITY_MESSAGE, 403);
      }

      const startedAt = performance.now();
      try {
        await dropSchema(schema);
      } catch (error) {
        logAdminFailure(ctx, request, "dropSchema", schema, startedAt, error);
        throw error;
      }
      logAdminSuccess(ctx, request, "dropSchema", schema, startedAt, `Dropped schema ${schema}.`);

      reply.status(204);
      return null;
    }
  );
}
