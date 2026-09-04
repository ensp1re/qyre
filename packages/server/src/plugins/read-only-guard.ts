import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../types/server.js";

declare module "fastify" {
  interface FastifyContextConfig {
    mutating?: boolean;
  }
}

export function registerReadOnlyGuard(app: FastifyInstance, ctx: ServerContext): void {
  app.addHook("preHandler", async (request, reply) => {
    if (!ctx.readOnly || !request.routeOptions.config.mutating) return;
    return reply.status(403).send({
      error: "Qyre is running in read-only mode (--read-only). This action is disabled.",
      reason: "qyre-flag"
    });
  });
}
