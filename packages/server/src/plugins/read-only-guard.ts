import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../app.js";

declare module "fastify" {
  interface FastifyContextConfig {
    /** Marks a route as mutating (F096) - the read-only guard rejects it whenever the session is
     * running with `--read-only`. Every future write route must set `config: { mutating: true }`
     * to be covered; omitted (every route today, since no write route exists yet) means the guard
     * never touches it. */
    mutating?: boolean;
  }
}

/**
 * The single central choke point every future mutating route registers under, landing before any
 * such route exists so it can't be forgotten once one does. Rejects a mutating request outright
 * when the session is in `--read-only` mode (F096) - a hard, Qyre-level ceiling that always wins
 * regardless of what the connected database role would otherwise allow, matching the product spec
 * ("`--read-only` always wins"). A no-op today: nothing sets `config.mutating` yet.
 */
export function registerReadOnlyGuard(app: FastifyInstance, ctx: ServerContext): void {
  app.addHook("preHandler", async (request, reply) => {
    if (!ctx.readOnly || !request.routeOptions.config.mutating) return;
    return reply.status(403).send({
      error: "Qyre is running in read-only mode (--read-only). This action is disabled."
    });
  });
}
