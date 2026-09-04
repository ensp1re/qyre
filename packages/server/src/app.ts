import { DEFAULT_PORT } from "@qyre/core";
import type { ConnectionTarget, HealthResponse } from "@qyre/core";
import type { AdapterFactory, DatabaseAdapter } from "@qyre/driver-contract";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerAuthGuard } from "./plugins/auth-guard.js";
import { registerAccessRoute } from "./routes/admin/access.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { registerHostGuard } from "./plugins/host-guard.js";
import { registerReadOnlyGuard } from "./plugins/read-only-guard.js";
import { registerSecurityHeaders } from "./plugins/security-headers.js";
import { registerStaticWeb } from "./plugins/static-web.js";
import { registerConnectRoute } from "./routes/connection/connect.js";
import { registerConsoleRoutes } from "./routes/observability/console.js";
import {
  CSV_IMPORT_MULTIPART_LIMITS,
  registerCsvImportRoutes
} from "./routes/transfer/csv-import.js";
import { registerDatabaseAdminRoutes } from "./routes/admin/database-admin.js";
import { registerFilesRoutes } from "./routes/transfer/files.js";
import { registerHealthRoute } from "./routes/connection/health.js";
import { registerMutationsRoutes } from "./routes/write/mutations.js";
import { registerOverviewRoute } from "./routes/connection/overview.js";
import { registerQueryRoute } from "./routes/data/query.js";
import { registerSchemaDdlRoutes } from "./routes/write/schema-ddl.js";
import { registerTablesRoutes } from "./routes/data/tables.js";
import { registerOperationsRoutes } from "./routes/observability/operations.js";
import { generateAuthToken } from "./services/access/auth-token.js";
import { EventLog } from "./services/observability/event-log.js";
import { buildLoggerOptions } from "./services/observability/log-redaction.js";
import type { ServerLoggerOption } from "./services/observability/log-redaction.js";
import { OperationRegistry } from "./services/observability/operation-registry.js";

// Keep augmentation in an imported module so downstream package type-checks see it.
declare module "fastify" {
  interface FastifyInstance {
    authToken: string;
  }
}

export interface CreateServerOptions {
  adapter?: DatabaseAdapter;
  target?: ConnectionTarget;
  logger?: ServerLoggerOption;
  webRoot?: string;
  filesRoot?: string;
  eventLog?: EventLog;
  adapterFactories?: AdapterFactory[];
  authToken?: string;
  readOnly?: boolean;
}

export interface ServerContext {
  adapter?: DatabaseAdapter;
  target?: ConnectionTarget;
  readonly eventLog: EventLog;
  readonly filesRoot?: string;
  readonly adapterFactories?: AdapterFactory[];
  lastKnownStatus?: HealthResponse["database"];
  lastError: string | null;
  readonly readOnly: boolean;
  readonly operationRegistry: OperationRegistry;
}

export function createServer(options: CreateServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: buildLoggerOptions(options.logger) });
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
  registerErrorHandler(app, ctx);
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
  eventLog: EventLog;
  authToken: string;
  close: () => Promise<void>;
}

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
