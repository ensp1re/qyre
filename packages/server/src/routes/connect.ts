import { connectRequestSchema, parseConnectionTarget } from "@qyre/core";
import type { ConnectionTarget, ConnectResponse } from "@qyre/core";
import { resolveAdapter } from "@qyre/driver-contract";
import type { DatabaseAdapter } from "@qyre/driver-contract";
import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../app.js";
import { describeError, displayTarget } from "../services/connection-display.js";

/**
 * F064: only registered when the caller opts in with `adapterFactories` - omitted (every existing
 * test, and any caller not yet updated) means this 404s, unchanged from pre-F064 behavior.
 */
export function registerConnectRoute(app: FastifyInstance, ctx: ServerContext): void {
  if (!ctx.adapterFactories) return;
  const adapterFactories = ctx.adapterFactories;

  app.post<{ Body: unknown }>("/api/connect", async (request, reply) => {
    const parsedBody = connectRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "Request body must be { target: string }." });
    }

    let newTarget: ConnectionTarget;
    let newAdapter: DatabaseAdapter;
    try {
      newTarget = parseConnectionTarget(parsedBody.data.target);
      newAdapter = resolveAdapter(adapterFactories, newTarget);
      await newAdapter.connect();
      if (!(await newAdapter.ping())) {
        throw new Error("Connected, but the new target did not respond to a ping.");
      }
    } catch (error) {
      // The old connection is left completely untouched - only swapped in below once the new
      // one is confirmed live, so a bad target can never leave the developer with no connection.
      return reply.status(400).send({ error: describeError(error) });
    }

    const oldAdapter = ctx.adapter;
    // Reassigned before the old adapter disconnects, so nothing in between can observe a moment
    // with no adapter at all.
    newAdapter.onConnectionEvent = (level, message) => ctx.eventLog.log(level, message);
    ctx.adapter = newAdapter;
    ctx.target = newTarget;
    // Reset transition-tracking state so /api/health's next poll treats the new connection as a
    // fresh baseline instead of comparing it against the old adapter's last known status.
    ctx.lastKnownStatus = undefined;
    ctx.lastError = null;
    ctx.eventLog.log("info", `Switched database connection to ${displayTarget(newTarget)}.`);
    if (oldAdapter) await oldAdapter.disconnect().catch(() => {});

    const response: ConnectResponse = { target: displayTarget(newTarget) };
    return response;
  });
}
