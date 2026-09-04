import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../../types/server.js";
import { permissionRoute } from "../../services/access/permission-denied.js";
import { applyReadOnlyOverride } from "../../services/access/read-only-capabilities.js";
import { requireAdapter } from "../../services/connection/require-adapter.js";

export function registerOverviewRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get(
    "/api/overview",
    permissionRoute(
      {
        operation: "list-schemas",
        target: "query",
        likelyMissingGrant: "read access on the connected database"
      },
      false
    ),
    async () => {
      const overview = await requireAdapter(ctx.adapter).getOverview();
      return {
        ...overview,
        capabilities: applyReadOnlyOverride(overview.capabilities, ctx.readOnly)
      };
    }
  );
}
