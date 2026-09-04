import type { DATABASE_ENGINES, REMOTE_DATABASE_ENGINES } from "../../constants/connection.js";

export type DatabaseEngine = (typeof DATABASE_ENGINES)[keyof typeof DATABASE_ENGINES];
export type RemoteDatabaseEngine = (typeof REMOTE_DATABASE_ENGINES)[number];

/** A parsed, validated database connection target. */
export interface ConnectionTarget {
  readonly engine: DatabaseEngine;
  /** May contain credentials; never log unredacted. */
  readonly raw: string;
}
