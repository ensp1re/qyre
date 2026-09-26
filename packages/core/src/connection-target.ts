import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DATABASE_ENGINES } from "./constants/connection.js";
import { InvalidConnectionTargetError } from "./errors.js";
import type { ConnectionTarget } from "./types/connection/connection.js";

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const MYSQL_PROTOCOLS = new Set(["mysql:"]);
const MONGODB_PROTOCOLS = new Set(["mongodb:", "mongodb+srv:"]);

export const DEFAULT_PORT = 7717;

// Mask credential-like query parameters across all supported URL forms.
const CREDENTIAL_QUERY_PARAM_PATTERN = /password|pwd|secret|token/i;

/** Redact credentials before logging. */
export function redactConnectionString(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.password) {
      url.password = "***";
    }
    for (const key of url.searchParams.keys()) {
      if (CREDENTIAL_QUERY_PARAM_PATTERN.test(key)) {
        url.searchParams.set(key, "***");
      }
    }
    return url.toString();
  } catch {
    return "<unparseable connection string>";
  }
}

function resolveSqliteTarget(raw: string, path: string): ConnectionTarget {
  const resolvedPath = resolve(path);
  if (!existsSync(resolvedPath)) {
    throw new InvalidConnectionTargetError(
      `No file found at "${resolvedPath}". Expected a path to an existing SQLite file (e.g. ` +
        "./app.db), or a Postgres connection string (postgres://user:pass@localhost:5432/mydb)."
    );
  }
  return { engine: DATABASE_ENGINES.sqlite, raw };
}

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
      return { engine: DATABASE_ENGINES.postgres, raw: trimmed };
    }
    if (MYSQL_PROTOCOLS.has(url.protocol)) {
      return { engine: DATABASE_ENGINES.mysql, raw: trimmed };
    }
    if (MONGODB_PROTOCOLS.has(url.protocol)) {
      return { engine: DATABASE_ENGINES.mongodb, raw: trimmed };
    }
    if (url.protocol === "file:") {
      return resolveSqliteTarget(trimmed, fileURLToPath(url));
    }
    throw new InvalidConnectionTargetError(
      `Unsupported database target protocol "${url.protocol}". ` +
        "Qyre currently supports Postgres (postgres:// or postgresql://), MySQL (mysql://), " +
        "MongoDB (mongodb:// or mongodb+srv://), and SQLite (a file path)."
    );
  }

  return resolveSqliteTarget(trimmed, trimmed);
}

const PATH_DEFAULT_AUTH_MECHANISMS = new Set(["DEFAULT", "SCRAM-SHA-1", "SCRAM-SHA-256"]);

/**
 * MongoDB authenticates against the URI path database unless `authSource` is set, so switching
 * the path must keep the original auth database. SRV URIs are left alone because their TXT
 * record may supply `authSource`, which an explicit parameter would override.
 */
function pinMongoAuthSource(url: URL): void {
  if (url.protocol !== "mongodb:" || !url.username) return;
  const params = [...url.searchParams.keys()].map((key) => key.toLowerCase());
  if (params.includes("authsource")) return;
  const mechanismKey = [...url.searchParams.keys()].find(
    (key) => key.toLowerCase() === "authmechanism"
  );
  const mechanism = mechanismKey ? url.searchParams.get(mechanismKey)?.toUpperCase() : undefined;
  if (mechanism && !PATH_DEFAULT_AUTH_MECHANISMS.has(mechanism)) return;
  const originalDatabase = decodeURIComponent(url.pathname.replace(/^\//, ""));
  url.searchParams.set("authSource", originalDatabase || "admin");
}

/** Replace a URL's database path while preserving credentials and options. */
export function withDatabase(raw: string, database: string): string {
  const url = new URL(raw);
  pinMongoAuthSource(url);
  url.pathname = `/${encodeURIComponent(database)}`;
  return url.toString();
}
