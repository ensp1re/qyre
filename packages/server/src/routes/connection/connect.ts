import {
  connectionWarnings,
  connectRequestSchema,
  parseConnectionTarget,
  switchDatabaseRequestSchema,
  withDatabase
} from "@qyre/core";
import type { ConnectionTarget, ConnectResponse } from "@qyre/core";
import { resolveAdapter } from "@qyre/driver-contract";
import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../../types/server.js";
import { describeError, displayTarget } from "../../services/connection/connection-display.js";

export function registerConnectRoute(app: FastifyInstance, ctx: ServerContext): void {
  if (!ctx.adapterFactories) return;
  const adapterFactories = ctx.adapterFactories;

  async function connectAndSwap(newTarget: ConnectionTarget): Promise<ConnectResponse> {
    const newAdapter = resolveAdapter(adapterFactories, newTarget);
    await newAdapter.connect();
    if (!(await newAdapter.ping())) {
      throw new Error("Connected, but the new target did not respond to a ping.");
    }
    try {
      await newAdapter.getOverview();
    } catch (error) {
      await newAdapter.disconnect().catch(() => {});
      if (newAdapter.classifyPermissionDenied?.(error)) {
        throw new Error(
          "Connection is stable, but this role is not authorized to browse the database " +
            "(listing schemas/collections was denied). Check the credential's privileges."
        );
      }
      throw error;
    }

    const oldAdapter = ctx.adapter;
    newAdapter.onConnectionEvent = (level, message) => ctx.eventLog.log(level, message);
    newAdapter.operationRegistry = ctx.operationRegistry;
    ctx.adapter = newAdapter;
    ctx.target = newTarget;
    ctx.lastKnownStatus = undefined;
    ctx.lastError = null;
    ctx.eventLog.log("info", `Switched database connection to ${displayTarget(newTarget)}.`);
    if (oldAdapter) await oldAdapter.disconnect().catch(() => {});

    const warnings = connectionWarnings(newTarget.raw);
    for (const warning of warnings) ctx.eventLog.log("warn", warning.message);
    return warnings.length > 0
      ? { target: displayTarget(newTarget), warnings }
      : { target: displayTarget(newTarget) };
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
