import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../../app.js";

export function registerOperationsRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.post<{ Params: { id: string } }>("/api/operations/:id/cancel", async (request) => {
    const cancelled = await ctx.operationRegistry.cancel(request.params.id);
    return { cancelled };
  });
}
