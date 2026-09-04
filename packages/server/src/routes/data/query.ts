import { explainQuerySchema, runQuerySchema } from "@qyre/core";
import {
  classifyStatement,
  OperationCancelledError,
  ReadOnlyViolationError
} from "@qyre/driver-contract";
import type { DatabaseAdapter, StatementClassification } from "@qyre/driver-contract";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ServerContext } from "../../types/server.js";
import { applyReadOnlyOverride } from "../../services/access/read-only-capabilities.js";
import { permissionRoute } from "../../services/access/permission-denied.js";
import { requireAdapter } from "../../services/connection/require-adapter.js";

async function runReadOnlyPath(
  db: DatabaseAdapter,
  ctx: ServerContext,
  sql: string,
  reply: FastifyReply,
  classification?: StatementClassification,
  operationId?: string
) {
  const start = Date.now();
  try {
    const result = await db.runReadOnlyQuery(sql, operationId);
    ctx.eventLog.log(
      "info",
      `Query executed in ${Date.now() - start}ms - ${result.rows.length} rows returned`
    );
    return classification ? { ...result, classification } : result;
  } catch (error) {
    if (error instanceof OperationCancelledError) {
      ctx.eventLog.log("info", "Query cancelled.");
      return reply.status(499).send({ error: error.message, cancelled: true });
    }
    if (error instanceof ReadOnlyViolationError) {
      ctx.eventLog.log("warn", `Query rejected: ${error.message}`);
      return reply
        .status(400)
        .send({ error: error.message, ...(classification ? {} : { reason: "read-only" }) });
    }
    throw error;
  }
}

export function registerQueryRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.post<{ Body: unknown }>(
    "/api/query",
    permissionRoute(
      {
        operation: "execute-query",
        target: "query",
        likelyMissingGrant: "the privilege required by this SQL statement"
      },
      false
    ),
    async (request, reply) => {
      const parsed = runQuerySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Request body must be { sql: string, confirmed?: boolean }." });
      }
      const { sql, confirmed, operationId } = parsed.data;
      const db = requireAdapter(ctx.adapter);

      const capabilities = applyReadOnlyOverride(await db.getCapabilities(), ctx.readOnly);
      const runQuery = db.runQuery?.bind(db);
      if (!capabilities.supportsRowMutations || !runQuery) {
        return runReadOnlyPath(db, ctx, sql, reply, undefined, operationId);
      }

      let classification: StatementClassification;
      try {
        classification = classifyStatement(sql);
      } catch (error) {
        if (error instanceof ReadOnlyViolationError) {
          ctx.eventLog.log("warn", `Query rejected: ${error.message}`);
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }

      if (classification === "read") {
        return runReadOnlyPath(db, ctx, sql, reply, classification, operationId);
      }

      if (classification === "destructive" && !confirmed) {
        ctx.eventLog.log(
          "warn",
          "Destructive statement rejected pending confirmation - resubmit with confirmed: true."
        );
        return reply.status(409).send({
          error: "This statement is destructive and requires explicit confirmation to run.",
          classification
        });
      }

      const start = Date.now();
      try {
        const result = await runQuery(sql, operationId);
        ctx.eventLog.log(
          "info",
          `Executed a ${classification} statement in ${Date.now() - start}ms - ${result.rowsAffected} row(s) affected.`
        );
        return { ...result, classification };
      } catch (error) {
        if (error instanceof OperationCancelledError) {
          ctx.eventLog.log("info", "Query cancelled.");
          return reply.status(499).send({ error: error.message, cancelled: true });
        }
        throw error;
      }
    }
  );

  app.post<{ Body: unknown }>(
    "/api/query/explain",
    permissionRoute(
      {
        operation: "execute-query",
        target: "query",
        likelyMissingGrant: "the privilege required to plan this SQL statement"
      },
      false
    ),
    async (request, reply) => {
      const parsed = explainQuerySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Request body must be { sql: string, analyze?: boolean }." });
      }

      const db = requireAdapter(ctx.adapter);
      const explainQuery = db.explainQuery?.bind(db);
      if (!explainQuery) {
        return reply.status(400).send({
          error: "EXPLAIN is not available for this database engine."
        });
      }

      const start = Date.now();
      try {
        const result = await explainQuery(parsed.data.sql, parsed.data.analyze);
        ctx.eventLog.log(
          "info",
          `Query plan generated in ${Date.now() - start}ms - ${result.lines.length} line(s).`
        );
        return result;
      } catch (error) {
        if (error instanceof ReadOnlyViolationError) {
          ctx.eventLog.log("warn", `Query plan rejected: ${error.message}`);
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    }
  );
}
