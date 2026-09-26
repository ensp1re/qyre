import type { RemoteDatabaseEngine } from "@qyre/core";

export interface RecentTarget {
  readonly raw: string;
  readonly display: string;
}

export type FieldEngine = RemoteDatabaseEngine;

export interface ConnectionFields {
  engine: FieldEngine;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  srv: boolean;
  /** URL query options without the leading `?`, e.g. `sslmode=require`. */
  options?: string;
}
