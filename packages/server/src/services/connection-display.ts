import type { ConnectionTarget } from "@qyre/core";
import { redactConnectionString } from "@qyre/core";

// A SQLite target's "raw" is a filesystem path, not a URL with credentials - nothing to redact,
// and redactConnectionString would otherwise mask it as "<unparseable...>".
// Exported so packages/cli can render the same redacted string in its startup banner (F067)
// instead of duplicating this engine-specific special-case.
export function displayTarget(target: ConnectionTarget): string {
  return target.engine === "sqlite" ? target.raw : redactConnectionString(target.raw);
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
