import type { ConnectionTarget, HealthResponse } from "@qyre/core";
import type { AdapterFactory, DatabaseAdapter } from "@qyre/driver-contract";
import type { FastifyInstance } from "fastify";
import type { EventLog } from "../services/observability/event-log.js";
import type { ServerLoggerOption } from "../services/observability/log-redaction.js";
import type { OperationRegistry } from "../services/observability/operation-registry.js";

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
