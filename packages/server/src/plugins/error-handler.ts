import type { FastifyError, FastifyInstance } from "fastify";
import type { ServerContext } from "../app.js";
import { permissionDeniedResponse } from "../services/permission-denied.js";

/**
 * Catch-all for any route error not already given its own specific response (e.g.
 * ReadOnlyViolationError and InvalidFilePathError, which reply.send() directly and so never reach
 * this). Normalizes every uncaught error into one consistent { error: string } shape carrying the
 * real underlying message - Fastify's own default handler instead returns
 * { statusCode, error: <reason phrase>, message: <real detail> }, and apps/web's fetchJson reads
 * the wrong field of that shape (F017). Respects an explicit error.statusCode when set (e.g. a
 * missing-adapter 503); anything else is a genuine unexpected failure (500).
 */
export function registerErrorHandler(app: FastifyInstance, ctx: ServerContext): void {
  app.addHook("onRoute", (route) => {
    if (route.config?.mutating && !route.config.permissionDenied) {
      throw new Error(
        `Mutating route ${route.method} ${route.url} lacks permission-denial metadata.`
      );
    }
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const denial = permissionDeniedResponse(ctx.adapter, request, error);
    if (denial) {
      ctx.eventLog.log(
        "warn",
        `${denial.operation} denied on ${denial.object}; likely missing ${denial.likelyMissingGrant}.`
      );
      request.log.warn(
        {
          operation: denial.operation,
          object: denial.object,
          likelyMissingGrant: denial.likelyMissingGrant,
          outcome: "permission-denied"
        },
        "database permission denied"
      );
      return reply.status(403).send(denial);
    }

    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
    if (statusCode >= 500) {
      ctx.eventLog.log("error", `${request.method} ${request.url} failed: ${error.message}`);
    }
    return reply.status(statusCode).send({ error: error.message });
  });
}
