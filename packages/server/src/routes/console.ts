import type { ConsoleEvents } from "@qyre/core";
import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../app.js";

export function registerConsoleRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.get("/api/console", async (): Promise<ConsoleEvents> => {
    return { events: ctx.eventLog.list() };
  });

  app.delete("/api/console", async (): Promise<ConsoleEvents> => {
    ctx.eventLog.clear();
    return { events: [] };
  });
}
