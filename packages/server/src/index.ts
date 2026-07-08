/**
 * Local HTTP server for Qyre, built on Fastify.
 *
 * Exposes a small JSON API the browser UI consumes, plus a health endpoint used for verification.
 * The server never talks to a database directly; it goes through a {@link DatabaseAdapter}.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import fastifyCompress from "@fastify/compress";
import fastifyStatic from "@fastify/static";
import {
  connectRequestSchema,
  DEFAULT_PORT,
  fileContentQuerySchema,
  MAX_PAGE_SIZE,
  parseConnectionTarget,
  redactConnectionString,
  rowsQuerySchema,
  runQuerySchema
} from "@qyre/core";
import type {
  AllTablesResponse,
  ConnectResponse,
  ConnectionTarget,
  ConsoleEvents,
  FileContent,
  FilesOverview,
  HealthResponse,
  RowSort,
  SortDirection
} from "@qyre/core";
import { ReadOnlyViolationError, resolveAdapter } from "@qyre/driver-contract";
import type { AdapterFactory, DatabaseAdapter } from "@qyre/driver-contract";
import Fastify from "fastify";
import type { FastifyError, FastifyInstance } from "fastify";
import { csvLine } from "./csv.js";
import { EventLog } from "./event-log.js";

export { EventLog } from "./event-log.js";
import { buildFileTree, InvalidFilePathError, resolveSqlFilePath } from "./files.js";

export interface CreateServerOptions {
  /** The connected (or to-be-connected) database adapter. */
  adapter?: DatabaseAdapter;
  /** The parsed connection target, for diagnostics (credentials are redacted in responses). */
  target?: ConnectionTarget;
  /**
   * Enable Fastify's logger. Defaults to false (the CLI configures logging). Pass a pino level
   * object (e.g. `{ level: "warn" }`) instead of `true` to log only warnings/errors, not every
   * request (F067) - the CLI does this by default, only passing `true` under `--verbose`.
   */
  logger?: boolean | { level: "trace" | "debug" | "info" | "warn" | "error" | "fatal" };
  /**
   * Directory containing the built `apps/web` static assets (its `index.html` and bundle).
   * When provided and it exists, the server serves the browser UI itself so `npx qyre <target>`
   * has something to open. When omitted, only the `/api/*` routes are registered.
   */
  webRoot?: string;
  /**
   * Absolute path to the one directory the Files tab may read `.sql` files from (the `--files-dir`
   * CLI flag, resolved and validated at startup). Omitted means file browsing is disabled - see
   * docs/product-specs/dashboard-ui.md's "Files tab security boundary".
   */
  filesRoot?: string;
  /**
   * Shared event log instance. Omit to let `createServer` make its own (the common case, and what
   * every existing test does) - only pass one in when a caller needs to log into the same log the
   * server reads from, e.g. `startServer` handing it back so the CLI can wire an adapter's
   * `onConnectionEvent` (F028) into the Console tab's event stream.
   */
  eventLog?: EventLog;
  /**
   * Engine factories to resolve a new adapter from when `POST /api/connect` is called (F064).
   * Omitted means the endpoint isn't registered at all - `POST /api/connect` 404s, matching
   * pre-F064 behavior everywhere this isn't explicitly opted into (every existing test, and any
   * caller that hasn't been updated). `packages/cli`'s real `main()` passes its full factory list
   * so switching connections works out of the box for the actual CLI.
   */
  adapterFactories?: AdapterFactory[];
}

function requireAdapter(adapter: DatabaseAdapter | undefined): DatabaseAdapter {
  if (!adapter) {
    throw Object.assign(new Error("No database connection is configured."), { statusCode: 503 });
  }
  return adapter;
}

// A SQLite target's "raw" is a filesystem path, not a URL with credentials - nothing to redact,
// and redactConnectionString would otherwise mask it as "<unparseable...>".
// Exported so packages/cli can render the same redacted string in its startup banner (F067)
// instead of duplicating this engine-specific special-case.
export function displayTarget(target: ConnectionTarget): string {
  return target.engine === "sqlite" ? target.raw : redactConnectionString(target.raw);
}

/**
 * Validates a requested sort column against the table's real columns before it's ever used in a
 * query (F065) - this is the actual injection surface `page`/`pageSize` don't have, since a column
 * name is a raw identifier rather than a value Zod can numeric-coerce or a driver can
 * parameter-bind. Throws a 400-shaped error (matching `requireAdapter`'s convention, caught by the
 * global error handler below) for an unrecognized column; returns undefined when no sort was
 * requested at all.
 */
async function resolveRowSort(
  db: DatabaseAdapter,
  schema: string,
  table: string,
  sortColumn: string | undefined,
  sortDirection: SortDirection
): Promise<RowSort | undefined> {
  if (!sortColumn) return undefined;
  const tableMetadata = await db.getTable(schema, table);
  if (!tableMetadata.columns.some((column) => column.name === sortColumn)) {
    throw Object.assign(new Error(`Unknown sort column "${sortColumn}".`), { statusCode: 400 });
  }
  return { column: sortColumn, direction: sortDirection };
}

/**
 * A connection failure to an unreachable host often throws Node's `AggregateError` (Node tries
 * IPv6 then IPv4 and wraps both failures) - confirmed live: its own `.message` is an empty string,
 * with the real reason ("connect ECONNREFUSED ...") only in `.errors[0]`. Falling back to that
 * nested message instead of surfacing an empty string to the developer. Exported (F073) so
 * packages/cli can apply the same unwrapping to its own initial `adapter.connect()` call, which
 * previously had the same empty-message bug this fixed here for the `/api/health`/`/api/connect`
 * paths.
 */
export function describeError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return describeError(error.errors[0]);
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

// The server binds to 127.0.0.1 and sets no CORS headers, but has no auth - the residual risk is
// DNS rebinding: a malicious page the developer visits resolves its own hostname to 127.0.0.1, so
// the browser treats a request to http://<attacker-domain>:<port>/api/... as same-origin even
// though it reaches this server. Rejecting any request whose Host header isn't one of these
// loopback hostnames closes that vector, since an attacker-registered domain can never be one.
const ALLOWED_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Extract the hostname portion of a `Host` header, handling bracketed IPv6 literals correctly. */
function extractHostname(hostHeader: string): string {
  if (hostHeader.startsWith("[")) {
    const closeIndex = hostHeader.indexOf("]");
    return (closeIndex === -1 ? hostHeader : hostHeader.slice(0, closeIndex + 1)).toLowerCase();
  }
  const colonIndex = hostHeader.lastIndexOf(":");
  return (colonIndex === -1 ? hostHeader : hostHeader.slice(0, colonIndex)).toLowerCase();
}

/** Build (but do not start) the Qyre HTTP server. */
export function createServer(options: CreateServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  // F064: mutable (not const-destructured) so POST /api/connect can swap in a new adapter/target
  // without restarting the server - every route below reads these same closure variables, so a
  // swap is instantly visible to the next request against any of them.
  let adapter = options.adapter;
  let target = options.target;
  const { filesRoot, adapterFactories } = options;
  const eventLog = options.eventLog ?? new EventLog();
  let lastKnownStatus: HealthResponse["database"] | undefined;
  let lastError: string | null = null;

  app.addHook("onRequest", async (request, reply) => {
    const hostHeader = request.headers.host;
    if (!hostHeader || !ALLOWED_HOSTNAMES.has(extractHostname(hostHeader))) {
      return reply.status(400).send({ error: "Invalid Host header." });
    }
  });

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
    let pingLatencyMs: number | null = null;
    if (adapter) {
      const pingStartedAt = performance.now();
      try {
        database = (await adapter.ping()) ? "connected" : "disconnected";
        if (database === "connected") lastError = null;
      } catch (error) {
        database = "disconnected";
        lastError = describeError(error);
      }
      pingLatencyMs = Math.round(performance.now() - pingStartedAt);
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
      target: target ? displayTarget(target) : null,
      engineVersion,
      pingLatencyMs,
      lastError
    };
  });

  // F064: only registered when the caller opts in with adapterFactories - omitted (every existing
  // test, and any caller not yet updated) means this 404s, unchanged from pre-F064 behavior.
  if (adapterFactories) {
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

      const oldAdapter = adapter;
      // Reassigned before the old adapter disconnects, so nothing in between can observe a moment
      // with no adapter at all.
      newAdapter.onConnectionEvent = (level, message) => eventLog.log(level, message);
      adapter = newAdapter;
      target = newTarget;
      // Reset transition-tracking state so /api/health's next poll treats the new connection as a
      // fresh baseline instead of comparing it against the old adapter's last known status.
      lastKnownStatus = undefined;
      lastError = null;
      eventLog.log("info", `Switched database connection to ${displayTarget(newTarget)}.`);
      if (oldAdapter) await oldAdapter.disconnect().catch(() => {});

      const response: ConnectResponse = { target: displayTarget(newTarget) };
      return response;
    });
  }

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

  // Backs the Schema tab (F027): previously the browser fanned useAllTables out into one HTTP
  // request per table (plus several catalog queries within each), which could mean hundreds of
  // concurrent requests on a large database. Fetching every table's metadata server-side in one
  // request keeps the per-table catalog queries (unchanged, tracked separately as tech debt) off
  // the browser's connection pool and out of per-table network round trips.
  app.get("/api/tables", async (): Promise<AllTablesResponse> => {
    const db = requireAdapter(adapter);
    const overview = await db.getOverview();
    const targets = overview.schemas.flatMap((schema) =>
      schema.tables.map((table) => ({ schema: schema.name, table }))
    );
    const tables = await Promise.all(
      targets.map(({ schema, table }) => db.getTable(schema, table))
    );
    return { tables };
  });

  app.get<{ Params: { schema: string; table: string }; Querystring: Record<string, string> }>(
    "/api/tables/:schema/:table/rows",
    async (request, reply) => {
      const parsed = rowsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid page/pageSize query parameters." });
      }
      const { schema, table } = request.params;
      const { page, pageSize, sortColumn, sortDirection } = parsed.data;
      const db = requireAdapter(adapter);
      const sort = await resolveRowSort(db, schema, table, sortColumn, sortDirection);
      return db.getRows(schema, table, page, pageSize, sort);
    }
  );

  // F066: streams every row of the table as CSV (honoring the sort above, if any) rather than
  // capping at runReadOnlyQuery's 1,000-row limit (F050) - exporting the whole table is the point.
  app.get<{ Params: { schema: string; table: string }; Querystring: Record<string, string> }>(
    "/api/tables/:schema/:table/export.csv",
    async (request, reply) => {
      const parsed = rowsQuerySchema
        .pick({ sortColumn: true, sortDirection: true })
        .safeParse(request.query);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Invalid sortColumn/sortDirection query parameters." });
      }
      const { schema, table } = request.params;
      const db = requireAdapter(adapter);
      const sort = await resolveRowSort(
        db,
        schema,
        table,
        parsed.data.sortColumn,
        parsed.data.sortDirection
      );

      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="${table}.csv"`);

      const stream = new Readable({ read() {} });
      // Fetches and pushes in bounded MAX_PAGE_SIZE batches rather than materializing the whole
      // table in memory (F066) - mirrors capResultRows's philosophy (F050) for a path that must
      // NOT be capped, since exporting the whole table is the entire point of this endpoint.
      // Not awaited: the response has already started streaming (status/headers committed the
      // moment the first chunk is pushed) once this handler returns the stream below, so a
      // mid-export failure can only end the connection abruptly, not change the status code.
      void (async () => {
        let page = 0;
        let wroteHeader = false;
        for (;;) {
          const rowPage = await db.getRows(schema, table, page, MAX_PAGE_SIZE, sort);
          if (!wroteHeader) {
            stream.push(`${csvLine(rowPage.columns)}\n`);
            wroteHeader = true;
          }
          for (const row of rowPage.rows) {
            stream.push(`${csvLine(rowPage.columns.map((column) => row[column]))}\n`);
          }
          if (rowPage.rows.length < MAX_PAGE_SIZE) break;
          page += 1;
        }
        stream.push(null);
      })().catch((error: unknown) => {
        stream.destroy(error instanceof Error ? error : new Error(String(error)));
      });

      return stream;
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
    // Compresses responses (gzip/brotli, negotiated via Accept-Encoding) - most useful for the
    // ~700KB JS bundle, negligible cost for the small JSON API responses (F044).
    void app.register(fastifyCompress);
    void app.register(fastifyStatic, {
      root: options.webRoot,
      // Disables @fastify/static's own default Cache-Control (public, max-age=0), which otherwise
      // wins over setHeaders below by being applied after it.
      cacheControl: false,
      setHeaders: (res, path) => {
        // Vite's build hashes every asset filename on content change, so those can be cached
        // aggressively and immutably; index.html itself references those hashed filenames and must
        // always be revalidated, or a stale cached copy would point at assets a redeploy removed.
        res.setHeader(
          "Cache-Control",
          path.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable"
        );
      }
    });
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
  /** The server's event log - e.g. so the caller can wire an adapter's `onConnectionEvent` into it. */
  eventLog: EventLog;
  close: () => Promise<void>;
}

/** Build and start the Qyre HTTP server, listening on localhost. */
export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  const eventLog = options.eventLog ?? new EventLog();
  const app = createServer({ ...options, eventLog });
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? "127.0.0.1";
  await app.listen({ port, host });
  return {
    app,
    url: `http://${host}:${port}`,
    eventLog,
    close: () => app.close()
  };
}
