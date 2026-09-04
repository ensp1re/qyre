import type { FastifyLoggerOptions, FastifyRequest } from "fastify";

const REDACTED = "[redacted]";
const SENSITIVE_QUERY_PARAMS = new Set(["token"]);

export function redactSensitiveQueryParams(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url, "http://localhost");
  } catch {
    return url;
  }

  let redacted = false;
  for (const name of SENSITIVE_QUERY_PARAMS) {
    if (!parsed.searchParams.has(name)) continue;
    parsed.searchParams.set(name, REDACTED);
    redacted = true;
  }
  if (!redacted) return url;
  return `${parsed.pathname}${parsed.search}`;
}

function redactedRequestSerializer(request: FastifyRequest): Record<string, unknown> {
  return {
    method: request.method,
    url: redactSensitiveQueryParams(request.url),
    hostname: request.hostname,
    remoteAddress: request.ip,
    remotePort: request.raw.socket?.remotePort
  };
}

export type ServerLoggerOption =
  | boolean
  | {
      level?: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
      stream?: { write(msg: string): void };
    };

export function buildLoggerOptions(
  logger: ServerLoggerOption | undefined
): FastifyLoggerOptions | boolean {
  if (!logger) return false;
  const base = logger === true ? {} : logger;
  return {
    ...base,
    serializers: { req: redactedRequestSerializer }
  };
}
