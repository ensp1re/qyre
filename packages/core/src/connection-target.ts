import { InvalidConnectionTargetError } from "./errors.js";
import type { ConnectionTarget } from "./types/connection.js";

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

/** Default local port Humb's server listens on. */
export const DEFAULT_PORT = 7717;

/**
 * Redact credentials from a connection string so it is safe to log.
 * Returns a best-effort redacted form; on parse failure returns a generic mask.
 */
export function redactConnectionString(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.password) {
      url.password = "***";
    }
    return url.toString();
  } catch {
    return "<unparseable connection string>";
  }
}

/**
 * Parse and validate a user-provided database target at the boundary.
 * Throws {@link InvalidConnectionTargetError} with actionable guidance on failure.
 */
export function parseConnectionTarget(input: string | undefined): ConnectionTarget {
  const trimmed = input?.trim();
  if (!trimmed) {
    throw new InvalidConnectionTargetError(
      "No database target provided. Expected a Postgres connection string, e.g. " +
        "postgres://user:pass@localhost:5432/mydb"
    );
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new InvalidConnectionTargetError(
      `Could not parse "${redactConnectionString(trimmed)}" as a connection string. ` +
        "Expected a Postgres URL like postgres://user:pass@localhost:5432/mydb"
    );
  }

  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    throw new InvalidConnectionTargetError(
      `Unsupported database target protocol "${url.protocol}". ` +
        "Humb currently supports Postgres (postgres:// or postgresql://)."
    );
  }

  return { engine: "postgres", raw: trimmed };
}
