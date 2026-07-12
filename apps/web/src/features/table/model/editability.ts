import type { ConnectionCapabilities, DatabaseEngine, TableMetadata } from "@qyre/core";
import { classifyFilterColumnKind } from "@qyre/core/filter-capabilities";
import { sessionAllows, tableAllows } from "../../../shared/lib/capabilities/capability-gates.js";

export interface TableEditability {
  readonly editable: boolean;
  /** Why editing is disabled, for UI copy - undefined when `editable` is true. */
  readonly reason?: string;
  /** Columns eligible for inline cell editing when `editable` is true - primary-key columns and
   * structured/binary/unknown/null `FilterColumnKind` columns are never included, per
   * docs/product-specs/row-editing.md ("a primary-key column is... never editable when updating an
   * existing row"). Empty when `editable` is false. */
  readonly editableColumns: ReadonlySet<string>;
}

const NOT_EDITABLE: TableEditability = { editable: false, editableColumns: new Set() };

function readOnlySessionReason(capabilities: ConnectionCapabilities | undefined): string {
  switch (capabilities?.readOnlyReason) {
    case "qyre-flag":
      return "Qyre was started with --read-only.";
    case "replica":
      return "This connection is a read replica.";
    case "connection":
      return "This connection doesn't allow writes.";
    case "grants":
      return "Your database role doesn't have write access.";
    default:
      return "This session doesn't have write access.";
  }
}

/**
 * Derives whether the Rows grid can be edited, and which columns, entirely from data the app
 * already has - no new "why can't I edit this" field, per docs/product-specs/row-editing.md. Every
 * gate below is independent and fails closed: the first one that blocks editing determines the
 * surfaced reason.
 */
export function computeTableEditability(
  table: TableMetadata | undefined,
  capabilities: ConnectionCapabilities | undefined,
  engine: DatabaseEngine | undefined
): TableEditability {
  // MongoDB's editing surface is F125's document editor, not this grid.
  if (!table || engine === "mongodb") return NOT_EDITABLE;

  if (table.kind !== "table") {
    return {
      editable: false,
      reason:
        table.kind === "view"
          ? "Views are read-only - they have no rows of their own to update."
          : table.kind === "materialized-view"
            ? "Materialized views are refreshed, not edited row-by-row."
            : "This isn't editable.",
      editableColumns: new Set()
    };
  }

  if (!table.columns.some((column) => column.isPrimaryKey)) {
    return {
      editable: false,
      reason: "This table has no primary key, so a specific row can't be reliably targeted.",
      editableColumns: new Set()
    };
  }

  if (!sessionAllows(capabilities, "supportsRowMutations")) {
    return {
      editable: false,
      reason: readOnlySessionReason(capabilities),
      editableColumns: new Set()
    };
  }

  if (!tableAllows(table.permissions, "update")) {
    return {
      editable: false,
      reason: "This session doesn't have permission to update this table.",
      editableColumns: new Set()
    };
  }

  const editableColumns = new Set(
    table.columns
      .filter((column) => !column.isPrimaryKey)
      .filter((column) => {
        const kind = classifyFilterColumnKind(column.dataType, engine);
        return kind !== "structured" && kind !== "binary" && kind !== "unknown" && kind !== "null";
      })
      .map((column) => column.name)
  );

  return { editable: true, editableColumns };
}
