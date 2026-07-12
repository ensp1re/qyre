import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../app.js";

/**
 * F126: cancels a running query by its client-supplied `operationId`. Not gated by the read-only
 * guard (`config: { mutating: true }`) - cancelling a stuck read must work even in a read-only
 * session, since it isn't itself a data-modifying action. Never errors for an unknown/already-
 * finished id - `cancelled: false` just means there was nothing left to cancel (the query already
 * completed, the engine has no real cancellation mechanism, or the id was never registered).
 */
export function registerOperationsRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.post<{ Params: { id: string } }>("/api/operations/:id/cancel", async (request) => {
    const cancelled = await ctx.operationRegistry.cancel(request.params.id);
    return { cancelled };
  });
}
