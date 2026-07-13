import type { DatabaseEngine } from "./connection.js";
import type { JsonExportMode, RowExportFormat } from "./query.js";

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
  /** Whole-result export formats implemented by the adapter (F118). */
  readonly rowExportFormats: readonly RowExportFormat[];
  /** The JSON dialect used when `rowExportFormats` contains `json`. */
  readonly jsonExportMode: JsonExportMode;
  /** Whether the adapter exposes the read-only roles and grants summary (F119). */
  readonly supportsAccessInspection: boolean;
}

/** Why every `supports*` write flag on {@link ConnectionCapabilities} is false; `null` once any
 * flag is true. See docs/product-specs/permissions-and-capabilities.md. */
export type ReadOnlyReason = "qyre-flag" | "replica" | "connection" | "grants" | null;

/**
 * Session-level capabilities: what the *connected role*, not just the engine, can do - extends
 * {@link AdapterCapabilities} (`supportsSql` keeps its existing engine-level meaning) with flags
 * that depend on the connected user's actual database grants. Advisory only: the database is
 * always the real enforcer of every read and write. See
 * docs/product-specs/permissions-and-capabilities.md.
 */
export interface ConnectionCapabilities extends AdapterCapabilities {
  readonly supportsRowMutations: boolean;
  readonly supportsDdl: boolean;
  readonly supportsIndexManagement: boolean;
  readonly supportsDatabaseManagement: boolean;
  readonly supportsTransactions: boolean;
  readonly readOnlyReason: ReadOnlyReason;
}

/** Per-table permissions the connected role has on one table - advisory, attached to
 * `TableMetadata.permissions` by each engine's introspection. See
 * docs/product-specs/permissions-and-capabilities.md. */
export interface TablePermissions {
  readonly select: boolean;
  readonly insert: boolean;
  readonly update: boolean;
  readonly delete: boolean;
}

/** Top-level overview of a database's structure. */
export interface DatabaseOverview {
  readonly engine: DatabaseEngine;
  readonly schemas: SchemaMetadata[];
  readonly capabilities: ConnectionCapabilities;
}
