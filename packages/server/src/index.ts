/**
 * Local HTTP server for Humb, built on Fastify.
 *
 * Exposes a small JSON API the browser UI consumes, plus a health endpoint used for verification.
 * The server never talks to a database directly; it goes through a {@link DatabaseAdapter}.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import {
  DEFAULT_PORT,
  fileContentQuerySchema,
  redactConnectionString,
  rowsQuerySchema,
  runQuerySchema
} from "@humbdb/core";
import type {
  ConnectionTarget,
  ConsoleEvents,
  FileContent,
  FilesOverview,
  HealthResponse
} from "@humbdb/core";
import { ReadOnlyViolationError } from "@humbdb/driver-contract";
import type { DatabaseAdapter } from "@humbdb/driver-contract";
import Fastify from "fastify";
import type { FastifyError, FastifyInstance } from "fastify";
import { EventLog } from "./event-log.js";
import { buildFileTree, InvalidFilePathError, resolveSqlFilePath } from "./files.js";

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
  /**
   * Absolute path to the one directory the Files tab may read `.sql` files from (the `--files-dir`
   * CLI flag, resolved and validated at startup). Omitted means file browsing is disabled - see
   * docs/product-specs/dashboard-ui.md's "Files tab security boundary".
   */
  filesRoot?: string;
}

function requireAdapter(adapter: DatabaseAdapter | undefined): DatabaseAdapter {
  if (!adapter) {
    throw Object.assign(new Error("No database connection is configured."), { statusCode: 503 });
  }
  return adapter;
}

/** Build (but do not start) the Humb HTTP server. */
export function createServer(options: CreateServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const { adapter, target, filesRoot } = options;
  const eventLog = new EventLog();
  let lastKnownStatus: HealthResponse["database"] | undefined;

  // Catch-all for any route error not already given its own specific response (e.g.
  // ReadOnlyViolationError and InvalidFilePathError below, which reply.send() directly and so
  // never reach this). Normalizes every uncaught error into one consistent { error: string } shape
  // carrying the real underlying message - Fastify's own default handler instead returns
  // { statusCode, error: <reason phrase>, message: <real detail> }, and apps/web's fetchJson reads
  // the wrong field of that shape (F017). Respects an explicit error.statusCode when set (e.g.
  // requireAdapter's 503 below); anything else is a genuine unexpected failure (500).
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
    if (statusCode >= 500) {
      eventLog.log("error", `${request.method} ${request.url} failed: ${error.message}`);
    }
    return reply.status(statusCode).send({ error: error.message });
  });

  app.get("/api/health", async (): Promise<HealthResponse> => {
    let database: HealthResponse["database"] = "unconfigured";
    if (adapter) {
      database = (await adapter.ping().catch(() => false)) ? "connected" : "disconnected";
    }

    // Log only actual transitions, not every poll - and never the very first observation (that's
    // the baseline, not a notable event).
    if (lastKnownStatus !== undefined && lastKnownStatus !== database) {
      eventLog.log(
        database === "connected" ? "info" : "warn",
        database === "connected" ? "Database connection restored." : "Database connection lost."
      );
    }
    lastKnownStatus = database;

    const engineVersion =
      adapter && database === "connected" ? await adapter.getVersion().catch(() => null) : null;

    return {
      status: "ok",
      database,
      // A SQLite target's "raw" is a filesystem path, not a URL with credentials - nothing to
      // redact, and redactConnectionString would otherwise mask it as "<unparseable...>".
      target: target
        ? target.engine === "sqlite"
          ? target.raw
          : redactConnectionString(target.raw)
        : null,
      engineVersion
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
    const parsed = runQuerySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Request body must be { sql: string }." });
    }
    const start = Date.now();
    try {
      const result = await requireAdapter(adapter).runReadOnlyQuery(parsed.data.sql);
      eventLog.log(
        "info",
        `Query executed in ${Date.now() - start}ms - ${result.rows.length} rows returned`
      );
      return result;
    } catch (error) {
      if (error instanceof ReadOnlyViolationError) {
        eventLog.log("warn", `Query rejected: ${error.message}`);
        return reply.status(400).send({ error: error.message });
      }
      // Anything else (a bad table name, a syntax error, ...) is a genuine unexpected failure -
      // handled generically (and logged) by the global error handler above, not duplicated here.
      throw error;
    }
  });

  app.get("/api/console", async (): Promise<ConsoleEvents> => {
    return { events: eventLog.list() };
  });

  app.delete("/api/console", async (): Promise<ConsoleEvents> => {
    eventLog.clear();
    return { events: [] };
  });

  app.get("/api/files", async (): Promise<FilesOverview> => {
    if (!filesRoot) return { enabled: false, tree: [] };
    return { enabled: true, tree: buildFileTree(filesRoot) };
  });

  app.get<{ Querystring: Record<string, string> }>("/api/files/content", async (request, reply) => {
    if (!filesRoot) {
      return reply.status(503).send({ error: "File browsing is not configured." });
    }
    const parsed = fileContentQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Query must include ?path=<relative path>." });
    }

    let absolutePath: string;
    try {
      absolutePath = resolveSqlFilePath(filesRoot, parsed.data.path);
    } catch (error) {
      if (error instanceof InvalidFilePathError) {
        return reply.status(400).send({ error: error.message });
      }
      throw error;
    }

    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      return reply.status(404).send({ error: "File not found." });
    }

    const content: FileContent = {
      path: parsed.data.path,
      content: readFileSync(absolutePath, "utf-8")
    };
    return content;
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
