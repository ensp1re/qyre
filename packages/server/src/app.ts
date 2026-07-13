/**
 * Local HTTP server for Qyre, built on Fastify.
 *
 * Exposes a small JSON API the browser UI consumes, plus a health endpoint used for verification.
 * The server never talks to a database directly; it goes through a {@link DatabaseAdapter}.
 */
import { DEFAULT_PORT } from "@qyre/core";
import type { ConnectionTarget, HealthResponse } from "@qyre/core";
import type { AdapterFactory, DatabaseAdapter } from "@qyre/driver-contract";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerAuthGuard } from "./plugins/auth-guard.js";
import { registerAccessRoute } from "./routes/access.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { registerHostGuard } from "./plugins/host-guard.js";
import { registerReadOnlyGuard } from "./plugins/read-only-guard.js";
import { registerSecurityHeaders } from "./plugins/security-headers.js";
import { registerStaticWeb } from "./plugins/static-web.js";
import { registerConnectRoute } from "./routes/connect.js";
import { registerConsoleRoutes } from "./routes/console.js";
import { CSV_IMPORT_MULTIPART_LIMITS, registerCsvImportRoutes } from "./routes/csv-import.js";
import { registerDatabaseAdminRoutes } from "./routes/database-admin.js";
import { registerFilesRoutes } from "./routes/files.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerMutationsRoutes } from "./routes/mutations.js";
import { registerOverviewRoute } from "./routes/overview.js";
import { registerQueryRoute } from "./routes/query.js";
import { registerSchemaDdlRoutes } from "./routes/schema-ddl.js";
import { registerTablesRoutes } from "./routes/tables.js";
import { registerOperationsRoutes } from "./routes/operations.js";
import { generateAuthToken } from "./services/auth-token.js";
import { EventLog } from "./services/event-log.js";
import { OperationRegistry } from "./services/operation-registry.js";

// Ambient augmentation declared here (not a standalone .d.ts) so it's visible in every downstream
// package's own `tsc` run too - each package/*'s tsconfig only `include`s its own src, so a
// separate types/*.d.ts file never included via an import wouldn't merge into e.g. @qyre/qyre's
// program even though it pulls in this file's FastifyInstance type transitively (F122).
declare module "fastify" {
  interface FastifyInstance {
    /** The random per-session bearer token this instance's `/api/*` routes require (F122). */
    authToken: string;
  }
}

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
  /**
   * The session bearer token every `/api/*` route requires (F122). Omit to let `createServer`
   * generate a cryptographically random one - the common case, and what the real CLI does. Tests
   * pass a known value so they can build an authorized `Authorization` header; `startServer`'s
   * caller can read the generated token back off the returned `RunningServer.authToken`.
   */
  authToken?: string;
  /**
   * Forces the whole session read-only regardless of what the connected database role would
   * otherwise allow (F096, the CLI's `--read-only` flag) - `GET /api/overview`'s capabilities
   * report every `supports*` flag `false` and `readOnlyReason: "qyre-flag"`, and the read-only
   * guard plugin rejects any route registered as mutating. Defaults to `false`.
   */
  readOnly?: boolean;
}

/**
 * Mutable state shared by reference across every route/plugin registered onto one `createServer`
 * instance - e.g. `POST /api/connect` (F064) swaps `adapter`/`target` in place so every route
 * reading them sees the new connection on its very next request, without restarting the server.
 */
export interface ServerContext {
  adapter?: DatabaseAdapter;
  target?: ConnectionTarget;
  readonly eventLog: EventLog;
  readonly filesRoot?: string;
  readonly adapterFactories?: AdapterFactory[];
  lastKnownStatus?: HealthResponse["database"];
  lastError: string | null;
  /** Whether the session is forced read-only via `--read-only` (F096). Untouched by `POST
   * /api/connect`'s adapter swap, so it persists across connection switches by construction. */
  readonly readOnly: boolean;
  /** In-flight cancellable-operation registry (F126) - outlives any single adapter swap; assigned
   * onto whichever adapter is currently connected as `adapter.operationRegistry`, the same
   * "server assigns a hook after connect()" pattern `onConnectionEvent` already uses. */
  readonly operationRegistry: OperationRegistry;
}

/** Build (but do not start) the Qyre HTTP server. */
export function createServer(options: CreateServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const authToken = options.authToken ?? generateAuthToken();
  app.decorate("authToken", authToken);
  const ctx: ServerContext = {
    adapter: options.adapter,
    target: options.target,
    eventLog: options.eventLog ?? new EventLog(),
    filesRoot: options.filesRoot,
    adapterFactories: options.adapterFactories,
    lastError: null,
    readOnly: options.readOnly ?? false,
    operationRegistry: new OperationRegistry()
  };
  if (ctx.adapter) ctx.adapter.operationRegistry = ctx.operationRegistry;

  registerHostGuard(app);
  registerSecurityHeaders(app);
  registerAuthGuard(app, authToken);
  registerReadOnlyGuard(app, ctx);
  registerErrorHandler(app, ctx.eventLog);
  app.register(multipart, {
    throwFileSizeLimit: true,
    limits: CSV_IMPORT_MULTIPART_LIMITS
  });

  registerHealthRoute(app, ctx);
  registerConnectRoute(app, ctx);
  registerOverviewRoute(app, ctx);
  registerAccessRoute(app, ctx);
  registerTablesRoutes(app, ctx);
  registerCsvImportRoutes(app, ctx);
  registerMutationsRoutes(app, ctx);
  registerSchemaDdlRoutes(app, ctx);
  registerDatabaseAdminRoutes(app, ctx);
  registerQueryRoute(app, ctx);
  registerConsoleRoutes(app, ctx);
  registerFilesRoutes(app, ctx);
  registerOperationsRoutes(app, ctx);

  registerStaticWeb(app, options.webRoot, authToken);

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
  /** The session bearer token this instance's `/api/*` routes require (F122). The served UI
   * already has it embedded (static-web.ts injects it into index.html); exposed here for callers
   * that need it directly, e.g. e2e tests asserting the tokenless-request 401 path. */
  authToken: string;
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
    authToken: app.authToken,
    close: () => app.close()
  };
}
