import type { TablePermissions } from "./schema.js";

/** The table/column a foreign key column points at (F061 - makes FK columns clickable). */
export interface ForeignKeyReference {
  readonly schema?: string;
  readonly table: string;
  readonly column: string;
}

/** Metadata for a single column in a table. */
export interface ColumnMetadata {
  readonly name: string;
  readonly dataType: string;
  readonly nullable: boolean;
  readonly isPrimaryKey: boolean;
  readonly isForeignKey: boolean;
  /** Only present when `isForeignKey` is true and the engine can resolve the reference target
   * (all SQL engines; MongoDB has no enforced foreign keys, so always undefined there). */
  readonly references?: ForeignKeyReference;
}

/** Metadata for a single index on a table. */
export interface IndexMetadata {
  readonly name: string;
  readonly columns: string[];
  readonly unique: boolean;
  readonly primary: boolean;
}

/** What kind of relation a `TableMetadata` describes (F124) - editing and DDL gate on
 * `kind === "table"`/`"collection"`; a view/materialized view renders read-only with a badge,
 * since writing through either is either unsupported or semantically wrong (a view has no rows of
 * its own to update; a materialized view is refreshed, not edited row-by-row). */
export type TableKind = "table" | "view" | "materialized-view" | "collection";

/** Metadata for a single table. */
export interface TableMetadata {
  readonly schema: string;
  readonly name: string;
  readonly kind: TableKind;
  readonly columns: ColumnMetadata[];
  readonly indexes?: IndexMetadata[];
  readonly rowCount?: number;
  /** Advisory per-table permissions for the connected role - undefined until an engine's
   * permission-introspection slice (F092-F095) populates it. See
   * docs/product-specs/permissions-and-capabilities.md. */
  readonly permissions?: TablePermissions;
}

/**
 * Every table's metadata across every schema in one response - backs the Schema tab (F027) so the
 * browser makes one request instead of fanning one out per table.
 */
export interface AllTablesResponse {
  readonly tables: TableMetadata[];
}
