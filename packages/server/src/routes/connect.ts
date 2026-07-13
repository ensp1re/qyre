import {
  connectRequestSchema,
  parseConnectionTarget,
  switchDatabaseRequestSchema,
  withDatabase
} from "@qyre/core";
import type { ConnectionTarget, ConnectResponse } from "@qyre/core";
import { resolveAdapter } from "@qyre/driver-contract";
import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../app.js";
import { describeError, displayTarget } from "../services/connection-display.js";

/**
 * F064: only registered when the caller opts in with `adapterFactories` - omitted (every existing
 * test, and any caller not yet updated) means both routes below 404, unchanged from pre-F064
 * behavior.
 */
export function registerConnectRoute(app: FastifyInstance, ctx: ServerContext): void {
  if (!ctx.adapterFactories) return;
  const adapterFactories = ctx.adapterFactories;

  /** Connects to `newTarget`, swaps it in only once confirmed live, and disconnects the old
   * adapter - shared by both routes below. The old connection is left completely untouched until
   * the new one is confirmed, so a bad target can never leave the developer with no connection. */
  async function connectAndSwap(newTarget: ConnectionTarget): Promise<ConnectResponse> {
    const newAdapter = resolveAdapter(adapterFactories, newTarget);
    await newAdapter.connect();
    if (!(await newAdapter.ping())) {
      throw new Error("Connected, but the new target did not respond to a ping.");
    }

    const oldAdapter = ctx.adapter;
    // Reassigned before the old adapter disconnects, so nothing in between can observe a moment
    // with no adapter at all.
    newAdapter.onConnectionEvent = (level, message) => ctx.eventLog.log(level, message);
    newAdapter.operationRegistry = ctx.operationRegistry;
    ctx.adapter = newAdapter;
    ctx.target = newTarget;
    // Reset transition-tracking state so /api/health's next poll treats the new connection as a
    // fresh baseline instead of comparing it against the old adapter's last known status.
    ctx.lastKnownStatus = undefined;
    ctx.lastError = null;
    ctx.eventLog.log("info", `Switched database connection to ${displayTarget(newTarget)}.`);
    if (oldAdapter) await oldAdapter.disconnect().catch(() => {});

    return { target: displayTarget(newTarget) };
  }

  app.post<{ Body: unknown }>("/api/connect", async (request, reply) => {
    const parsedBody = connectRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "Request body must be { target: string }." });
    }
    try {
      return await connectAndSwap(parseConnectionTarget(parsedBody.data.target));
    } catch (error) {
      return reply.status(400).send({ error: describeError(error) });
    }
  });

  // F116: switches to a sibling database on the SAME server, reusing the current target's own raw
  // connection string (credentials included) - the client only ever names the database, never
  // sees or supplies credentials for it. Not gated by supportsDatabaseManagement (switching to a
  // database you can already see in the list is not itself an admin action) or the F096 read-only
  // guard (not a data mutation) - matching GET /api/databases' own ungated read, per
  // docs/product-specs/schema-editing.md's "Database and schema lifecycle" section.
  app.post<{ Body: unknown }>("/api/connect/database", async (request, reply) => {
    if (!ctx.target) {
      return reply.status(400).send({ error: "Not connected to a database server." });
    }
    const parsedBody = switchDatabaseRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "Request body must be { database: string }." });
    }
    try {
      const raw = withDatabase(ctx.target.raw, parsedBody.data.database);
      return await connectAndSwap(parseConnectionTarget(raw));
    } catch (error) {
      return reply.status(400).send({ error: describeError(error) });
    }
  });
}
