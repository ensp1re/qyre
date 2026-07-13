import type {
  ColumnMetadata,
  ConnectionCapabilities,
  DatabaseEngine,
  TableMetadata
} from "@qyre/core";
import { classifyFilterColumnKind } from "@qyre/core/filter-capabilities";
import { sessionAllows, tableAllows } from "../../../shared/lib/capabilities/capability-gates.js";

export interface CsvImportability {
  readonly canImport: boolean;
  readonly columns: ColumnMetadata[];
}

const NOT_IMPORTABLE: CsvImportability = { canImport: false, columns: [] };

/** Import is insert-only, so unlike row update/delete it does not require a primary key. */
export function computeCsvImportability(
  table: TableMetadata | undefined,
  capabilities: ConnectionCapabilities | undefined,
  engine: DatabaseEngine | undefined
): CsvImportability {
  if (!table || !engine) return NOT_IMPORTABLE;
  if (table.kind !== "table" && table.kind !== "collection") return NOT_IMPORTABLE;
  if (!sessionAllows(capabilities, "supportsRowMutations")) return NOT_IMPORTABLE;
  if (!tableAllows(table.permissions, "insert")) return NOT_IMPORTABLE;

  const columns = table.columns.filter((column) => {
    const kind = classifyFilterColumnKind(column.dataType, engine);
    return kind !== "structured" && kind !== "binary" && kind !== "unknown" && kind !== "null";
  });
  return { canImport: columns.length > 0, columns };
}
