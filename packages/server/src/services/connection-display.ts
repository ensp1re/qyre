import type { ConnectionTarget } from "@qyre/core";
import { redactConnectionString } from "@qyre/core";

// A SQLite target's "raw" is a filesystem path, not a URL with credentials - nothing to redact,
// and redactConnectionString would otherwise mask it as "<unparseable...>".
// Exported so packages/cli can render the same redacted string in its startup banner (F067)
// instead of duplicating this engine-specific special-case.
export function displayTarget(target: ConnectionTarget): string {
  return target.engine === "sqlite" ? target.raw : redactConnectionString(target.raw);
}

// Same credential-key substring rule @qyre/core's redactConnectionString uses (matched
// case-insensitively against the whole key, so close variants like `sslpassword` or
// `tlsCertificateKeyFilePassword` are covered without hard-coding every engine's exact spelling) -
// applied here to arbitrary free-text driver error messages rather than one parseable URL, since a
// connection string can appear embedded as a substring rather than the whole message.
const CREDENTIAL_QUERY_PARAM_PATTERN = /password|pwd|secret|token/i;
// Matches a URL-shaped `://user:password@` fragment anywhere in a string. Only the password half
// is masked (group 1 keeps `://user`), mirroring redactConnectionString's own `url.password`-only
// behavior.
const USERINFO_PATTERN = /(:\/\/[^\s"'@/:]*):([^\s"'@/]*)@/g;
// Matches a `?key=value`/`&key=value` query-param fragment anywhere in a string, not just inside a
// well-formed URL, so it also catches one embedded as a substring of a longer driver message.
const QUERY_PARAM_PATTERN = /([?&])([^=&\s"']+)=([^&\s"')]*)/g;

/**
 * Best-effort credential redaction for arbitrary error text (SUGGESTIONS.md S3) - driver-generated
 * messages (MongoDB's `MongoParseError` family especially) can echo pieces of the connection
 * string verbatim, including its embedded userinfo or a credential-bearing query param, which
 * SECURITY.md requires redacted "in logs, errors, screenshots, and diagnostics" the same as any
 * other credential surface. Unlike `redactConnectionString`, this operates on free text that may
 * only contain a connection string as a substring, not text that must itself parse as one URL.
 */
function redactErrorMessage(message: string): string {
  return message
    .replace(USERINFO_PATTERN, "$1:***@")
    .replace(QUERY_PARAM_PATTERN, (match, separator: string, key: string) =>
      CREDENTIAL_QUERY_PARAM_PATTERN.test(key) ? `${separator}${key}=***` : match
    );
}

/**
 * A connection failure to an unreachable host often throws Node's `AggregateError` (Node tries
 * IPv6 then IPv4 and wraps both failures) - confirmed live: its own `.message` is an empty string,
 * with the real reason ("connect ECONNREFUSED ...") only in `.errors[0]`. Falling back to that
 * nested message instead of surfacing an empty string to the developer. Exported (F073) so
 * packages/cli can apply the same unwrapping to its own initial `adapter.connect()` call, which
 * previously had the same empty-message bug this fixed here for the `/api/health`/`/api/connect`
 * paths. Every return path is redacted (F131/S3) so a caller can never forget to.
 */
export function describeError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return describeError(error.errors[0]);
  }
  if (error instanceof Error && error.message) {
    return redactErrorMessage(error.message);
  }
  return redactErrorMessage(String(error));
}
