/**
 * Shared domain types and contracts for Humb.
 *
 * This package must stay UI-, server-, and engine-agnostic. See ARCHITECTURE.md.
 */

/** Database engines Humb can target. Postgres is supported first. */
export type DatabaseEngine = "postgres";

/** A parsed, validated database connection target. */
export interface ConnectionTarget {
  readonly engine: DatabaseEngine;
  /** The original connection string (may contain credentials - never log unredacted). */
  readonly raw: string;
}

/** Metadata for a single column in a table. */
export interface ColumnMetadata {
  readonly name: string;
  readonly dataType: string;
  readonly nullable: boolean;
  readonly isPrimaryKey: boolean;
}

/** Metadata for a single index on a table. */
export interface IndexMetadata {
  readonly name: string;
  readonly columns: string[];
  readonly unique: boolean;
  readonly primary: boolean;
}

/** Metadata for a single table. */
export interface TableMetadata {
  readonly schema: string;
  readonly name: string;
  readonly columns: ColumnMetadata[];
  readonly indexes?: IndexMetadata[];
  readonly rowCount?: number;
}

/** A schema and the tables it contains. */
export interface SchemaMetadata {
  readonly name: string;
  readonly tables: string[];
}

/** Top-level overview of a database's structure. */
export interface DatabaseOverview {
  readonly engine: DatabaseEngine;
  readonly schemas: SchemaMetadata[];
}

/** A page of rows returned for a table or read-only query. */
export interface RowPage {
  readonly columns: string[];
  readonly rows: Array<Record<string, unknown>>;
  readonly page: number;
  readonly pageSize: number;
  readonly total?: number;
}

/** Thrown when a connection target cannot be parsed or is unsupported. */
export class InvalidConnectionTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConnectionTargetError";
  }
}

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
