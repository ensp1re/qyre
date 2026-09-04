import type {
  AccessOverview,
  ColumnDefinition,
  ColumnMetadata,
  ColumnUpdateResult,
  CommitMutationsResult,
  ConnectionCapabilities,
  ConnectionTarget,
  DatabaseOverview,
  DeleteRowsResult,
  IndexDefinition,
  InsertRowResult,
  MutationOp,
  QueryExecutionResult,
  QueryPlanResult,
  RowFilter,
  RowPage,
  RowSort,
  TableMetadata,
  UpdateRowResult
} from "@qyre/core";

export type ConnectionEventLevel = "warn" | "error";

export type PermissionDenialKind = "permission" | "ownership" | "read-only";

export interface CancellationRegistry {
  /** Register a callback once the operation is cancellable. */
  register(operationId: string, cancel: () => Promise<void>): void;
  /** Remove a settled operation's callback. */
  unregister(operationId: string): void;
}

export interface RowMutationApi {
  insertRow?(
    schema: string,
    table: string,
    values: Record<string, unknown>
  ): Promise<InsertRowResult>;
  updateRowByKey?(
    schema: string,
    table: string,
    key: Record<string, unknown>,
    changes: Record<string, unknown>,
    expectedOriginal?: Record<string, unknown>
  ): Promise<UpdateRowResult>;
  /** Update MongoDB fields with optimistic conflict detection. */
  updateFieldsByKey?(
    schema: string,
    table: string,
    key: Record<string, unknown>,
    changes: Record<string, unknown>,
    originalValues: Record<string, unknown>,
    missingOriginalFields: readonly string[]
  ): Promise<UpdateRowResult>;
  deleteRowsByKey?(
    schema: string,
    table: string,
    keys: Array<Record<string, unknown>>
  ): Promise<DeleteRowsResult>;
  commitBatch?(ops: MutationOp[]): Promise<CommitMutationsResult>;
  getDocumentText?(schema: string, table: string, id: string): Promise<string | undefined>;
}

export interface SchemaDdlApi {
  createTable?(schema: string, table: string, columns: ColumnDefinition[]): Promise<void>;
  renameTable?(schema: string, table: string, newName: string): Promise<void>;
  truncateTable?(schema: string, table: string): Promise<void>;
  dropTable?(schema: string, table: string): Promise<void>;

  addColumn?(schema: string, table: string, column: ColumnDefinition): Promise<void>;
  renameColumn?(schema: string, table: string, column: string, newName: string): Promise<void>;
  /** Apply only the requested column changes. */
  alterColumn?(
    schema: string,
    table: string,
    column: string,
    changes: Partial<Pick<ColumnDefinition, "dataType" | "nullable" | "default">>
  ): Promise<void>;
  /** Apply a column rename and/or alter as one operation. */
  renameAndAlterColumn?(
    schema: string,
    table: string,
    column: string,
    update: {
      newName?: string;
      changes?: Partial<Pick<ColumnDefinition, "dataType" | "nullable" | "default">>;
    }
  ): Promise<ColumnUpdateResult>;
  dropColumn?(schema: string, table: string, column: string): Promise<void>;

  createIndex?(schema: string, table: string, definition: IndexDefinition): Promise<void>;
  dropIndex?(schema: string, table: string, indexName: string): Promise<void>;
}

export interface DatabaseAdminApi {
  inspectAccess?(): Promise<AccessOverview>;
  listDatabases?(): Promise<string[]>;
  createDatabase?(name: string): Promise<void>;
  dropDatabase?(name: string): Promise<void>;
  createSchema?(name: string): Promise<void>;
  dropSchema?(name: string): Promise<void>;
}

export interface ResolvedRowSearch {
  readonly value: string;
  readonly columns: readonly ColumnMetadata[];
}

export interface DatabaseAdapter {
  readonly engine: string;
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
  /** Stream rows and release the engine resource when the iterator settles. */
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
  /** Execute a query with the engine's read-only backstop. */
  runReadOnlyQuery(sql: string, operationId?: string): Promise<RowPage>;
  /** Execute one non-read SQL statement without read-oriented rewrites. */
  runQuery?(sql: string, operationId?: string): Promise<QueryExecutionResult>;
  /** Build and execute a database-native plan. */
  explainQuery?(sql: string, analyze?: boolean): Promise<QueryPlanResult>;
  mutations?: RowMutationApi;
  ddl?: SchemaDdlApi;
  admin?: DatabaseAdminApi;
  /** Receives asynchronous engine connection events. */
  onConnectionEvent?: (level: ConnectionEventLevel, message: string) => void;
  /** Registry used by cancellable operations. */
  operationRegistry?: CancellationRegistry;
}

export interface AdapterFactory {
  readonly engine: string;
  supports(target: ConnectionTarget): boolean;
  create(target: ConnectionTarget): DatabaseAdapter;
}
