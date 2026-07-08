import { runQuerySchema } from "@qyre/core";
import { ReadOnlyViolationError } from "@qyre/driver-contract";
import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../app.js";
import { requireAdapter } from "../services/require-adapter.js";

export function registerQueryRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.post<{ Body: unknown }>("/api/query", async (request, reply) => {
    const parsed = runQuerySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Request body must be { sql: string }." });
    }
    const start = Date.now();
    try {
      const result = await requireAdapter(ctx.adapter).runReadOnlyQuery(parsed.data.sql);
      ctx.eventLog.log(
        "info",
        `Query executed in ${Date.now() - start}ms - ${result.rows.length} rows returned`
      );
      return result;
    } catch (error) {
      if (error instanceof ReadOnlyViolationError) {
        ctx.eventLog.log("warn", `Query rejected: ${error.message}`);
        return reply.status(400).send({ error: error.message });
      }
      // Anything else (a bad table name, a syntax error, ...) is a genuine unexpected failure -
      // handled generically (and logged) by the global error handler, not duplicated here.
      throw error;
    }
  });
}
