import type { FastifyError, FastifyInstance } from "fastify";
import type { EventLog } from "../services/event-log.js";

/**
 * Catch-all for any route error not already given its own specific response (e.g.
 * ReadOnlyViolationError and InvalidFilePathError, which reply.send() directly and so never reach
 * this). Normalizes every uncaught error into one consistent { error: string } shape carrying the
 * real underlying message - Fastify's own default handler instead returns
 * { statusCode, error: <reason phrase>, message: <real detail> }, and apps/web's fetchJson reads
 * the wrong field of that shape (F017). Respects an explicit error.statusCode when set (e.g. a
 * missing-adapter 503); anything else is a genuine unexpected failure (500).
 */
export function registerErrorHandler(app: FastifyInstance, eventLog: EventLog): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
    if (statusCode >= 500) {
      eventLog.log("error", `${request.method} ${request.url} failed: ${error.message}`);
    }
    return reply.status(statusCode).send({ error: error.message });
  });
}
