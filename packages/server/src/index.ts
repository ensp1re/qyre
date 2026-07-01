/**
 * Local HTTP server for Humb, built on Fastify.
 *
 * Exposes a small JSON API the browser UI consumes, plus a health endpoint used for verification.
 * The server never talks to a database directly; it goes through a {@link DatabaseAdapter}.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import { DEFAULT_PORT, redactConnectionString } from "@humb/core";
import type { ConnectionTarget } from "@humb/core";
import type { DatabaseAdapter } from "@humb/db-adapter";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

export interface CreateServerOptions {
  /** The connected (or to-be-connected) database adapter. */
  adapter?: DatabaseAdapter;
  /** The parsed connection target, for diagnostics (credentials are redacted in responses). */
  target?: ConnectionTarget;
  /** Enable Fastify's logger. Defaults to false (the CLI configures logging). */
  logger?: boolean;
  /**
   * Directory containing the built `apps/web` static assets (its `index.html` and bundle).
   * When provided and it exists, the server serves the browser UI itself so `npx humb <target>`
   * has something to open. When omitted, only the `/api/*` routes are registered.
   */
  webRoot?: string;
}

const querySchema = z.object({ sql: z.string().min(1) });
const rowsQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(200).default(50)
});

function requireAdapter(adapter: DatabaseAdapter | undefined): DatabaseAdapter {
  if (!adapter) {
    throw Object.assign(new Error("No database connection is configured."), { statusCode: 503 });
  }
  return adapter;
}

/** Build (but do not start) the Humb HTTP server. */
export function createServer(options: CreateServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const { adapter, target } = options;

  app.get("/api/health", async () => {
    let database: "connected" | "disconnected" | "unconfigured" = "unconfigured";
    if (adapter) {
      database = (await adapter.ping().catch(() => false)) ? "connected" : "disconnected";
    }
    return {
      status: "ok",
      database,
      target: target ? redactConnectionString(target.raw) : null
    };
  });

  app.get("/api/overview", async () => {
    return requireAdapter(adapter).getOverview();
  });

  app.get<{ Params: { schema: string; table: string } }>(
    "/api/tables/:schema/:table",
    async (request) => {
      const { schema, table } = request.params;
      return requireAdapter(adapter).getTable(schema, table);
    }
  );

  app.get<{ Params: { schema: string; table: string }; Querystring: Record<string, string> }>(
    "/api/tables/:schema/:table/rows",
    async (request) => {
      const { schema, table } = request.params;
      const { page, pageSize } = rowsQuerySchema.parse(request.query);
      return requireAdapter(adapter).getRows(schema, table, page, pageSize);
    }
  );

  app.post<{ Body: unknown }>("/api/query", async (request, reply) => {
    const parsed = querySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Request body must be { sql: string }." });
    }
    return requireAdapter(adapter).runReadOnlyQuery(parsed.data.sql);
  });

  if (options.webRoot && existsSync(join(options.webRoot, "index.html"))) {
    void app.register(fastifyStatic, { root: options.webRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith("/api/")) {
        return reply.status(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

export interface StartServerOptions extends CreateServerOptions {
  port?: number;
  host?: string;
}

export interface RunningServer {
  app: FastifyInstance;
  url: string;
  close: () => Promise<void>;
}

/** Build and start the Humb HTTP server, listening on localhost. */
export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  const app = createServer(options);
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? "127.0.0.1";
  await app.listen({ port, host });
  return {
    app,
    url: `http://${host}:${port}`,
    close: () => app.close()
  };
}
