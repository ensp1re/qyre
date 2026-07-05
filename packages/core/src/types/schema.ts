import type { DatabaseEngine } from "./connection.js";

/** A schema and the tables it contains. */
export interface SchemaMetadata {
  readonly name: string;
  readonly tables: string[];
}

/**
 * What a connected adapter actually supports, so callers (the UI) can ask "can this engine do X"
 * instead of checking `engine === "mongodb"` by name. See
 * docs/product-specs/adapter-capabilities.md.
 */
export interface AdapterCapabilities {
  /** Whether `runReadOnlyQuery` accepts real SQL text - false disables the SQL Editor tab and the
   * Files tab's "Run in editor" action, which both submit raw SQL. */
  readonly supportsSql: boolean;
}

/** Top-level overview of a database's structure. */
export interface DatabaseOverview {
  readonly engine: DatabaseEngine;
  readonly schemas: SchemaMetadata[];
  readonly capabilities: AdapterCapabilities;
}
