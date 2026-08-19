import type { FastifyError, FastifyInstance } from "fastify";
import type { ServerContext } from "../app.js";
import { permissionDeniedResponse } from "../services/access/permission-denied.js";
import { redactErrorMessage } from "../services/connection/connection-display.js";
import { redactSensitiveQueryParams } from "../services/observability/log-redaction.js";

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
    // Both the logged line and the response body go through redaction (F154). The URL carries the
    // live session token for export downloads (`?token=...`, the one route the auth guard accepts
    // it from), so logging it raw wrote a working credential into the Console tab, which
    // `GET /api/console` serves and users screenshot. The message can echo a connection string
    // verbatim - MongoDB's error family especially - which docs/SECURITY.md requires redacted in
    // errors as much as in logs.
    const safeMessage = redactErrorMessage(error.message);
    if (statusCode >= 500) {
      ctx.eventLog.log(
        "error",
        `${request.method} ${redactSensitiveQueryParams(request.url)} failed: ${safeMessage}`
      );
    }
    return reply.status(statusCode).send({ error: safeMessage });
  });
}
