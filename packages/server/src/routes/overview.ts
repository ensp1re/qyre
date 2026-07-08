import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../app.js";
import { requireAdapter } from "../services/require-adapter.js";

export function registerOverviewRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get("/api/overview", async () => {
    return requireAdapter(ctx.adapter).getOverview();
  });
}
