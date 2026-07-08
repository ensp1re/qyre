import type { HealthResponse } from "@qyre/core";
import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../app.js";
import { describeError, displayTarget } from "../services/connection-display.js";

export function registerHealthRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.get("/api/health", async (): Promise<HealthResponse> => {
    let database: HealthResponse["database"] = "unconfigured";
    let pingLatencyMs: number | null = null;
    if (ctx.adapter) {
      const pingStartedAt = performance.now();
      try {
        database = (await ctx.adapter.ping()) ? "connected" : "disconnected";
        if (database === "connected") ctx.lastError = null;
      } catch (error) {
        database = "disconnected";
        ctx.lastError = describeError(error);
      }
      pingLatencyMs = Math.round(performance.now() - pingStartedAt);
    }

    // Log only actual transitions, not every poll - and never the very first observation (that's
    // the baseline, not a notable event).
    if (ctx.lastKnownStatus !== undefined && ctx.lastKnownStatus !== database) {
      ctx.eventLog.log(
        database === "connected" ? "info" : "warn",
        database === "connected" ? "Database connection restored." : "Database connection lost."
      );
    }
    ctx.lastKnownStatus = database;

    const engineVersion =
      ctx.adapter && database === "connected"
        ? await ctx.adapter.getVersion().catch(() => null)
        : null;

    return {
      status: "ok",
      database,
      target: ctx.target ? displayTarget(ctx.target) : null,
      engineVersion,
      pingLatencyMs,
      lastError: ctx.lastError
    };
  });
}
