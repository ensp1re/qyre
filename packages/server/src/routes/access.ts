import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../app.js";
import { applyReadOnlyOverride } from "../services/read-only-capabilities.js";
import { requireAdapter } from "../services/require-adapter.js";

/** Read-only access inspection. Remains available under `--read-only`. */
export function registerAccessRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get("/api/access", async (_request, reply) => {
    const adapter = requireAdapter(ctx.adapter);
    const capabilities = applyReadOnlyOverride(await adapter.getCapabilities(), ctx.readOnly);
    const inspectAccess = adapter.admin?.inspectAccess;
    if (!capabilities.supportsAccessInspection || !inspectAccess) {
      return reply.status(400).send({ error: "This engine does not support access inspection." });
    }
    return inspectAccess();
  });
}
