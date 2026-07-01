import type { DatabaseEngine } from "./connection.js";

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
