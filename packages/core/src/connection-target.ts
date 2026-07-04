import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { InvalidConnectionTargetError } from "./errors.js";
import type { ConnectionTarget } from "./types/connection.js";

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const MYSQL_PROTOCOLS = new Set(["mysql:"]);
const MONGODB_PROTOCOLS = new Set(["mongodb:", "mongodb+srv:"]);

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
 * Resolve a candidate SQLite file path (bare path or `file:` URL) into a {@link ConnectionTarget}.
 * Existence is checked here, at the parse boundary, so the CLI fails fast with the exact resolved
 * path it looked for, matching Postgres's fail-fast-on-invalid-input behavior - see
 * `docs/product-specs/connect-and-inspect-sqlite.md`.
 */
function resolveSqliteTarget(raw: string, path: string): ConnectionTarget {
  const resolvedPath = resolve(path);
  if (!existsSync(resolvedPath)) {
    throw new InvalidConnectionTargetError(
      `No file found at "${resolvedPath}". Expected a path to an existing SQLite file (e.g. ` +
        "./app.db), or a Postgres connection string (postgres://user:pass@localhost:5432/mydb)."
    );
  }
  return { engine: "sqlite", raw };
}

/**
 * Parse and validate a user-provided database target at the boundary.
 * Throws {@link InvalidConnectionTargetError} with actionable guidance on failure.
 */
export function parseConnectionTarget(input: string | undefined): ConnectionTarget {
  const trimmed = input?.trim();
  if (!trimmed) {
    throw new InvalidConnectionTargetError(
      "No database target provided. Expected a Postgres connection string (e.g. " +
        "postgres://user:pass@localhost:5432/mydb), a MySQL connection string (e.g. " +
        "mysql://user:pass@localhost:3306/mydb), a MongoDB connection string (e.g. " +
        "mongodb://localhost:27017/mydb), or a path to a SQLite file (e.g. ./app.db)."
    );
  }

  let url: URL | undefined;
  try {
    url = new URL(trimmed);
  } catch {
    url = undefined;
  }

  if (url) {
    if (POSTGRES_PROTOCOLS.has(url.protocol)) {
      return { engine: "postgres", raw: trimmed };
    }
    if (MYSQL_PROTOCOLS.has(url.protocol)) {
      return { engine: "mysql", raw: trimmed };
    }
    if (MONGODB_PROTOCOLS.has(url.protocol)) {
      return { engine: "mongodb", raw: trimmed };
    }
    if (url.protocol === "file:") {
      return resolveSqliteTarget(trimmed, fileURLToPath(url));
    }
    throw new InvalidConnectionTargetError(
      `Unsupported database target protocol "${url.protocol}". ` +
        "Humb currently supports Postgres (postgres:// or postgresql://), MySQL (mysql://), " +
        "MongoDB (mongodb:// or mongodb+srv://), and SQLite (a file path)."
    );
  }

  // Not URL-shaped at all (e.g. `./app.db`, `data.sqlite`) - treat as a candidate SQLite file path.
  return resolveSqliteTarget(trimmed, trimmed);
}
