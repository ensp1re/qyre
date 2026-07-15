import type { ConnectionCapabilities, DatabaseEngine, TableMetadata } from "@qyre/core";
import {
  sessionAllows,
  tableAllows
} from "../../../../shared/lib/capabilities/capability-gates.js";

export interface DocumentEditability {
  /** Whether the per-row "Edit document" action renders at all. */
  readonly canEdit: boolean;
  /** Whether the toolbar "Insert document" action renders at all. */
  readonly canInsert: boolean;
  /** Whether the document editor's own "Delete document" section renders. */
  readonly canDelete: boolean;
}

const NOT_EDITABLE: DocumentEditability = { canEdit: false, canInsert: false, canDelete: false };

/**
 * MongoDB's whole-document editing affordances (F125) - a parallel, MongoDB-only counterpart to
 * `computeTableEditability`, which stays SQL-grid-only and always reports MongoDB as fully
 * non-editable (its editing surface is this document editor, not the flat cell grid). Never gates
 * on primary-key presence the way the SQL grid does - `_id` is always MongoDB's primary key
 * (F068), so a "no primary key" case never arises here.
 */
export function computeDocumentEditability(
  table: TableMetadata | undefined,
  capabilities: ConnectionCapabilities | undefined,
  engine: DatabaseEngine | undefined
): DocumentEditability {
  if (!table || engine !== "mongodb") return NOT_EDITABLE;
  // A Mongo view has no documents of its own to edit, matching the SQL grid's view exclusion.
  if (table.kind !== "collection") return NOT_EDITABLE;
  if (!sessionAllows(capabilities, "supportsRowMutations")) return NOT_EDITABLE;

  return {
    canEdit: tableAllows(table.permissions, "update"),
    canInsert: tableAllows(table.permissions, "insert"),
    canDelete: tableAllows(table.permissions, "delete")
  };
}
