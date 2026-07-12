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
  /** Whether Add-row/Duplicate-row (F104) should render at all - hidden entirely (not merely
   * disabled) when false, per the spec. Gated independently of `editable`/`update`: a session can
   * have insert without update permission, or vice versa. */
  readonly canInsert: boolean;
  /** Why insert is unavailable - present only when `canInsert` is false and there's something worth
   * explaining (unused today since Add-row/Duplicate-row are hidden, not disabled-with-a-badge, but
   * kept symmetric with `reason` in case a future slice wants it). */
  readonly insertReason?: string;
  /** Columns an insert draft can set - unlike `editableColumns`, primary-key columns ARE included
   * (a new row's key must be supplied unless the engine auto-generates it, per the spec's insert
   * section); structured/binary/unknown/null kinds are still excluded. Empty when `canInsert` is
   * false. */
  readonly insertableColumns: ReadonlySet<string>;
}

const NOT_EDITABLE: TableEditability = {
  editable: false,
  editableColumns: new Set(),
  canInsert: false,
  insertableColumns: new Set()
};

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
    const reason =
      table.kind === "view"
        ? "Views are read-only - they have no rows of their own to update."
        : table.kind === "materialized-view"
          ? "Materialized views are refreshed, not edited row-by-row."
          : "This isn't editable.";
    return {
      editable: false,
      reason,
      editableColumns: new Set(),
      canInsert: false,
      insertReason: reason,
      insertableColumns: new Set()
    };
  }

  if (!table.columns.some((column) => column.isPrimaryKey)) {
    const reason = "This table has no primary key, so a specific row can't be reliably targeted.";
    return {
      editable: false,
      reason,
      editableColumns: new Set(),
      canInsert: false,
      insertReason: reason,
      insertableColumns: new Set()
    };
  }

  if (!sessionAllows(capabilities, "supportsRowMutations")) {
    const reason = readOnlySessionReason(capabilities);
    return {
      editable: false,
      reason,
      editableColumns: new Set(),
      canInsert: false,
      insertReason: reason,
      insertableColumns: new Set()
    };
  }

  const canUpdate = tableAllows(table.permissions, "update");
  const canInsert = tableAllows(table.permissions, "insert");

  const nonStructuredColumns = table.columns.filter((column) => {
    const kind = classifyFilterColumnKind(column.dataType, engine);
    return kind !== "structured" && kind !== "binary" && kind !== "unknown" && kind !== "null";
  });

  const editableColumns = canUpdate
    ? new Set(
        nonStructuredColumns.filter((column) => !column.isPrimaryKey).map((column) => column.name)
      )
    : new Set<string>();

  // Unlike `editableColumns`, the primary key IS included here - a new row's key must be supplied
  // on insert unless the engine auto-generates it (docs/product-specs/row-editing.md).
  const insertableColumns = canInsert
    ? new Set(nonStructuredColumns.map((column) => column.name))
    : new Set<string>();

  return {
    editable: canUpdate,
    reason: canUpdate ? undefined : "This session doesn't have permission to update this table.",
    editableColumns,
    canInsert,
    insertReason: canInsert
      ? undefined
      : "This session doesn't have permission to insert into this table.",
    insertableColumns
  };
}
