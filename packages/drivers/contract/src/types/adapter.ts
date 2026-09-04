import type {
  ConnectionCapabilities,
  ConnectionTarget,
  ColumnMetadata,
  DatabaseEngine,
  DatabaseOverview,
  QueryExecutionResult,
  QueryPlanResult,
  RowFilter,
  RowPage,
  RowSort,
  TableMetadata
} from "@qyre/core";
import type { DatabaseAdminApi } from "./admin.js";
import type { CancellationRegistry, PermissionDenialKind } from "./operations.js";
import type { RowMutationApi } from "./mutations.js";
import type { SchemaDdlApi } from "./schema.js";

export type ConnectionEventLevel = "warn" | "error";

export interface ResolvedRowSearch {
  readonly value: string;
  readonly columns: readonly ColumnMetadata[];
}

export interface DatabaseAdapter {
  readonly engine: DatabaseEngine;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
  getVersion(): Promise<string>;
  getOverview(): Promise<DatabaseOverview>;
  getCapabilities(): Promise<ConnectionCapabilities>;
  classifyPermissionDenied(error: unknown): PermissionDenialKind | undefined;
  getTable(schema: string, table: string): Promise<TableMetadata>;
  getAllTables(): Promise<TableMetadata[]>;
  getRows(
    schema: string,
    table: string,
    page: number,
    pageSize: number,
    sort?: RowSort,
    filters?: RowFilter[],
    search?: ResolvedRowSearch,
    operationId?: string
  ): Promise<RowPage>;
  streamRows(
    schema: string,
    table: string,
    columns: readonly ColumnMetadata[],
    sort?: RowSort,
    filters?: RowFilter[],
    search?: ResolvedRowSearch
  ): AsyncIterable<Record<string, unknown>>;
  formatSqlInsert?(
    schema: string,
    table: string,
    columns: readonly string[],
    row: Record<string, unknown>
  ): string;
  serializeJsonRow?(row: Record<string, unknown>): string;
  runReadOnlyQuery(sql: string, operationId?: string): Promise<RowPage>;
  runQuery?(sql: string, operationId?: string): Promise<QueryExecutionResult>;
  explainQuery?(sql: string, analyze?: boolean): Promise<QueryPlanResult>;
  mutations?: RowMutationApi;
  ddl?: SchemaDdlApi;
  admin?: DatabaseAdminApi;
  onConnectionEvent?: (level: ConnectionEventLevel, message: string) => void;
  operationRegistry?: CancellationRegistry;
}

export interface AdapterFactory {
  readonly engine: DatabaseEngine;
  supports(target: ConnectionTarget): boolean;
  create(target: ConnectionTarget): DatabaseAdapter;
}
