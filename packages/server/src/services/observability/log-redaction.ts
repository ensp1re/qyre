import type { FastifyLoggerOptions, FastifyRequest } from "fastify";

/**
 * Masks sensitive query-string values before a request URL reaches Fastify's request logger
 * (F067's `--verbose` mode, which logs every request). The `token` query param (F122's
 * export-download auth path, the one route the auth guard accepts a token from instead of an
 * `Authorization` header - see `plugins/auth-guard.ts`) is the live session bearer token; logging
 * it verbatim would write a still-valid credential to the terminal/any captured log output. The
 * token remains fully valid for actual auth - only its logged representation changes.
 */
const REDACTED = "[redacted]";
const SENSITIVE_QUERY_PARAMS = new Set(["token"]);

/** Replaces any sensitive query-param value in `url` with a fixed placeholder, leaving everything
 * else (path, other params) untouched. Returns `url` unchanged when it has no sensitive param or
 * fails to parse (never throws on a malformed request URL). */
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

/** Mirrors Fastify's default request-log shape, with `url`'s sensitive query params masked via
 * {@link redactSensitiveQueryParams}. */
function redactedRequestSerializer(request: FastifyRequest): Record<string, unknown> {
  return {
    method: request.method,
    url: redactSensitiveQueryParams(request.url),
    hostname: request.hostname,
    remoteAddress: request.ip,
    remotePort: request.raw.socket?.remotePort
  };
}

/** What `CreateServerOptions.logger` accepts (F067's `--verbose` flag plumbing) - `stream` is
 * additionally accepted so tests can capture log output; the CLI never sets it. */
export type ServerLoggerOption =
  | boolean
  | {
      level?: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
      stream?: { write(msg: string): void };
    };

/**
 * Normalizes a `CreateServerOptions.logger` value into Fastify's logger config, always attaching
 * {@link redactedRequestSerializer} - `logger: true` and a bare `{ level }` object both bypass any
 * serializer otherwise, which is exactly the `--verbose` path that leaked the session token
 * (SUGGESTIONS.md S2). `false`/`undefined` disables logging entirely, unchanged.
 */
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
