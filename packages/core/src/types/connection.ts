/**
 * Database engines Qyre can target. Postgres is supported first, SQLite second, MySQL third,
 * MongoDB fourth (basic read-only browsing only - see
 * docs/product-specs/connect-and-inspect-mongodb.md).
 */
export type DatabaseEngine = "postgres" | "sqlite" | "mysql" | "mongodb";

/** A parsed, validated database connection target. */
export interface ConnectionTarget {
  readonly engine: DatabaseEngine;
  /** The original connection string (may contain credentials - never log unredacted). */
  readonly raw: string;
}
