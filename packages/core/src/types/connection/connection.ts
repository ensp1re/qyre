export type DatabaseEngine = "postgres" | "sqlite" | "mysql" | "mongodb";

/** A parsed, validated database connection target. */
export interface ConnectionTarget {
  readonly engine: DatabaseEngine;
  /** May contain credentials; never log unredacted. */
  readonly raw: string;
}
