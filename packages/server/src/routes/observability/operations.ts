import type { OperationParams } from "../../types/routes.js";
import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../../types/server.js";

export function registerOperationsRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.post<{ Params: OperationParams }>("/api/operations/:id/cancel", async (request) => {
    const cancelled = await ctx.operationRegistry.cancel(request.params.id);
    return { cancelled };
  });
}
