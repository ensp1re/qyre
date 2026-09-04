import type { FastifyError, FastifyInstance } from "fastify";
import type { ServerContext } from "../types/server.js";
import { permissionDeniedResponse } from "../services/access/permission-denied.js";
import { redactErrorMessage } from "../services/connection/connection-display.js";
import { redactSensitiveQueryParams } from "../services/observability/log-redaction.js";

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
    // Redact both the logged error and response because URLs and driver messages may contain secrets.
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
