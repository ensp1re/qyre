import type { ConnectionCapabilities, DatabaseEngine, TableMetadata } from "@qyre/core";
import { sessionAllows } from "../../../shared/lib/capabilities/capability-gates.js";

export interface TableStructureEditability {
  /** Add/rename/alter/drop-column controls - false for MongoDB (collections have no fixed
   * structure to alter, per docs/product-specs/schema-editing.md's "MongoDB's column operations"). */
  readonly canEditColumns: boolean;
  /** Create/drop-index controls - `supportsIndexManagement`, independent of `canEditColumns` (F090
   * reserves index grants as a distinct capability). */
  readonly canManageIndexes: boolean;
  /** Rename/truncate/drop-table controls - the session's `supportsDdl` flag. */
  readonly canEditTable: boolean;
}

const NOT_EDITABLE: TableStructureEditability = {
  canEditColumns: false,
  canManageIndexes: false,
  canEditTable: false
};

/**
 * Derives F114's Structure view gating, mirroring `computeTableEditability`'s (row-editing, F103)
 * "kind === table/collection" precedent: a view or materialized view has no structure DDL can alter,
 * per {@link TableMetadata.kind}'s own doc comment, so every control stays hidden there regardless
 * of capabilities.
 */
export function computeTableStructureEditability(
  table: TableMetadata | undefined,
  capabilities: ConnectionCapabilities | undefined,
  engine: DatabaseEngine | undefined
): TableStructureEditability {
  if (!table || (table.kind !== "table" && table.kind !== "collection")) return NOT_EDITABLE;

  const ddl = sessionAllows(capabilities, "supportsDdl");
  return {
    canEditColumns: ddl && engine !== "mongodb",
    canManageIndexes: sessionAllows(capabilities, "supportsIndexManagement"),
    canEditTable: ddl
  };
}
