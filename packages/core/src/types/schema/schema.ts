import type { DatabaseEngine } from "../connection/connection.js";
import type { JsonExportMode, RowExportFormat } from "../query/query.js";

export interface SchemaMetadata {
  readonly name: string;
  readonly tables: string[];
}

export interface AdapterCapabilities {
  readonly supportsSql: boolean;
  readonly rowExportFormats: readonly RowExportFormat[];
  readonly jsonExportMode: JsonExportMode;
  readonly supportsAccessInspection: boolean;
}

export type ReadOnlyReason = "qyre-flag" | "replica" | "connection" | "grants" | null;

export interface ConnectionCapabilities extends AdapterCapabilities {
  readonly supportsRowMutations: boolean;
  readonly supportsDdl: boolean;
  readonly supportsIndexManagement: boolean;
  readonly supportsDatabaseManagement: boolean;
  readonly supportsTransactions: boolean;
  readonly readOnlyReason: ReadOnlyReason;
}

export interface TablePermissions {
  readonly select: boolean;
  readonly insert: boolean;
  readonly update: boolean;
  readonly delete: boolean;
}

export interface DatabaseOverview {
  readonly engine: DatabaseEngine;
  readonly schemas: SchemaMetadata[];
  readonly capabilities: ConnectionCapabilities;
}
