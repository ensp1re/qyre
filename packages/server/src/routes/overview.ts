import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../app.js";
import { applyReadOnlyOverride } from "../services/read-only-capabilities.js";
import { requireAdapter } from "../services/require-adapter.js";

export function registerOverviewRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get("/api/overview", async () => {
    const overview = await requireAdapter(ctx.adapter).getOverview();
    return {
      ...overview,
      capabilities: applyReadOnlyOverride(overview.capabilities, ctx.readOnly)
    };
  });
}
