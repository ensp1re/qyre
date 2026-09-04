import { DATABASE_ENGINES } from "@qyre/core/connection-constants";
import type { ConnectionCapabilities, DatabaseEngine, TableMetadata } from "@qyre/core";
import { mutationEditorCapability } from "@qyre/core/mutation-editor-capabilities";
import {
  sessionAllows,
  tableAllows
} from "../../../../shared/lib/capabilities/capability-gates.js";

export interface TableEditability {
  readonly editable: boolean;
  readonly reason?: string;
  readonly editableColumns: ReadonlySet<string>;
  readonly canInsert: boolean;
  readonly insertReason?: string;
  readonly insertableColumns: ReadonlySet<string>;
  readonly canDelete: boolean;
}

const NOT_EDITABLE: TableEditability = {
  editable: false,
  editableColumns: new Set(),
  canInsert: false,
  insertableColumns: new Set(),
  canDelete: false
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

export function computeTableEditability(
  table: TableMetadata | undefined,
  capabilities: ConnectionCapabilities | undefined,
  engine: DatabaseEngine | undefined
): TableEditability {
  if (!table) return NOT_EDITABLE;

  const expectedKind = engine === DATABASE_ENGINES.mongodb ? "collection" : "table";
  if (table.kind !== expectedKind) {
    const reason =
      table.kind === "view"
        ? "Views are read-only - they have no rows of their own to update."
        : table.kind === "materialized-view"
          ? "Materialized views are refreshed, not edited row-by-row."
          : engine === DATABASE_ENGINES.mongodb
            ? "Only MongoDB collections can be edited."
            : "This isn't editable.";
    return {
      editable: false,
      reason,
      editableColumns: new Set(),
      canInsert: false,
      insertReason: reason,
      insertableColumns: new Set(),
      canDelete: false
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
      insertableColumns: new Set(),
      canDelete: false
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
      insertableColumns: new Set(),
      canDelete: false
    };
  }

  const canUpdate = tableAllows(table.permissions, "update");
  const canInsert = tableAllows(table.permissions, "insert");
  const canDelete = tableAllows(table.permissions, "delete");

  const mutationEditableColumns = table.columns.filter((column) => {
    if (
      engine === DATABASE_ENGINES.mongodb &&
      (column.name.includes(".") ||
        column.name.startsWith("$") ||
        ["__proto__", "constructor", "prototype"].includes(column.name))
    ) {
      return false;
    }
    return mutationEditorCapability(column.dataType, engine, column).editable;
  });

  const editableColumns = canUpdate
    ? new Set(
        mutationEditableColumns
          .filter((column) => !column.isPrimaryKey)
          .map((column) => column.name)
      )
    : new Set<string>();

  const insertableColumns = canInsert
    ? new Set(mutationEditableColumns.map((column) => column.name))
    : new Set<string>();

  return {
    editable: canUpdate,
    reason: canUpdate ? undefined : "This session doesn't have permission to update this table.",
    editableColumns,
    canInsert,
    insertReason: canInsert
      ? undefined
      : "This session doesn't have permission to insert into this table.",
    insertableColumns,
    canDelete
  };
}
