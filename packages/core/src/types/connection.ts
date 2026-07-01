/** Database engines Humb can target. Postgres is supported first. */
export type DatabaseEngine = "postgres";

/** A parsed, validated database connection target. */
export interface ConnectionTarget {
  readonly engine: DatabaseEngine;
  /** The original connection string (may contain credentials - never log unredacted). */
  readonly raw: string;
}
