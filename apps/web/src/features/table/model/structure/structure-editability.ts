import { DATABASE_ENGINES } from "@qyre/core/connection-constants";
import type { ConnectionCapabilities, DatabaseEngine, TableMetadata } from "@qyre/core";
import { sessionAllows } from "../../../../shared/lib/capabilities/capability-gates.js";

export interface TableStructureEditability {
  readonly canEditColumns: boolean;
  readonly canManageIndexes: boolean;
  readonly canEditTable: boolean;
}

const NOT_EDITABLE: TableStructureEditability = {
  canEditColumns: false,
  canManageIndexes: false,
  canEditTable: false
};

export function computeTableStructureEditability(
  table: TableMetadata | undefined,
  capabilities: ConnectionCapabilities | undefined,
  engine: DatabaseEngine | undefined
): TableStructureEditability {
  if (!table || (table.kind !== "table" && table.kind !== "collection")) return NOT_EDITABLE;

  const ddl = sessionAllows(capabilities, "supportsDdl");
  return {
    canEditColumns: ddl && engine !== DATABASE_ENGINES.mongodb,
    canManageIndexes: sessionAllows(capabilities, "supportsIndexManagement"),
    canEditTable: ddl
  };
}
