import type {
  ColumnDefinition,
  CommitMutationsResult,
  ConnectionCapabilities,
  ConnectionTarget,
  DatabaseOverview,
  DeleteRowsResult,
  InsertRowResult,
  MutationOp,
  QueryExecutionResult,
  RowFilter,
  RowPage,
  RowSort,
  TableMetadata,
  UpdateRowResult
} from "@qyre/core";

/** Severity of an adapter's asynchronous connection event - see {@link DatabaseAdapter.onConnectionEvent}. */
export type ConnectionEventLevel = "warn" | "error";

/**
 * The server-side registry a cancellable adapter method (`getRows`/`runReadOnlyQuery`/`runQuery`,
 * F126) registers a cancel callback with, keyed by the client-supplied `operationId` that request
 * also carried. `packages/server`'s implementation is the single source of truth; adapters only
 * see this narrow interface (register/unregister), never the registry's own cancel-triggering
 * side (`POST /api/operations/:id/cancel` calls that directly, not through the adapter).
 */
export interface CancellationRegistry {
  /** Registers `cancel` for `operationId`, overwriting any existing registration for the same id -
   * call once the adapter has enough state (a captured pid/threadId/comment tag) to actually
   * cancel the operation, not before. */
  register(operationId: string, cancel: () => Promise<void>): void;
  /** Removes the registration - call in a `finally` once the operation settles (success, error, or
   * cancellation), so a stale callback is never invoked for a since-completed operation. */
  unregister(operationId: string): void;
}

/**
 * Structured row-mutation operations (F099-F101), per docs/product-specs/row-editing.md. Each
 * member is independently optional - not the namespace's own presence/absence - so
 * F099/F100/F101 can each land one method across all four engines without forcing an all-or-
 * nothing implementation. `values`/`changes` are already validated/coerced against the table's
 * real columns by the caller before an adapter method is ever invoked - see
 * packages/server/src/services/row-mutation-validation.ts.
 */
export interface RowMutationApi {
  insertRow?(
    schema: string,
    table: string,
    values: Record<string, unknown>
  ): Promise<InsertRowResult>;
  /**
   * `expectedOriginal` (MongoDB's whole-document editor only, F125) is the document as it was
   * loaded before editing, in the same shape `changes` arrives in - when present, the adapter must
   * re-fetch the current document and reject with `matched: 0` if it no longer structurally matches
   * `expectedOriginal`, per docs/product-specs/row-editing.md's lost-update protection ("the server
   * re-fetches the document by _id and compares it... structurally, not by a version field"). SQL
   * engines ignore it - their `changes` is already a partial field-level diff, not a whole-document
   * replace, so there is nothing to compare against.
   */
  updateRowByKey?(
    schema: string,
    table: string,
    key: Record<string, unknown>,
    changes: Record<string, unknown>,
    expectedOriginal?: Record<string, unknown>
  ): Promise<UpdateRowResult>;
  deleteRowsByKey?(
    schema: string,
    table: string,
    keys: Array<Record<string, unknown>>
  ): Promise<DeleteRowsResult>;
  /** SQL engines only (F102) - runs every staged op in one native transaction, all-or-nothing.
   * Absent on MongoDB; the route responds 400 explaining batch commit doesn't apply there. */
  commitBatch?(ops: MutationOp[]): Promise<CommitMutationsResult>;
  /** MongoDB only (F125) - fetches one document by primary key as relaxed Extended JSON text
   * (`bson`'s `EJSON.stringify(doc, { relaxed: true })`), for the whole-document editor to load
   * fresh when it opens. Never reuses the grid's own already-fetched row data - that display format
   * is intentionally lossy/ambiguous for `ObjectId`/`Date` (F081), which editing cannot tolerate.
   * Returns `undefined` if no document with that key exists. */
  getDocumentText?(schema: string, table: string, id: string): Promise<string | undefined>;
}

/**
 * Table/collection-lifecycle DDL operations (F110), per docs/product-specs/schema-editing.md. Each
 * member is independently optional - not the namespace's own presence/absence - so F110 (table
 * lifecycle) can land ahead of F111 (column ops)/F112 (index ops) without forcing an all-or-nothing
 * implementation, mirroring {@link RowMutationApi}'s exact pattern. `columns`/`table`/`newName` are
 * already validated (identifier shape for new names, `dataType` against the engine's curated type
 * catalog) by the caller before an adapter method is ever invoked - see
 * packages/server/src/services/schema-ddl-validation.ts.
 */
export interface SchemaDdlApi {
  createTable?(schema: string, table: string, columns: ColumnDefinition[]): Promise<void>;
  renameTable?(schema: string, table: string, newName: string): Promise<void>;
  /** Deletes every row but keeps the table/collection itself. Postgres/MySQL: native `TRUNCATE`.
   * SQLite: `DELETE FROM` (no native TRUNCATE, and no automatic `VACUUM` - a full-database operation
   * out of scope for a single-table action). MongoDB: `deleteMany({})`. */
  truncateTable?(schema: string, table: string): Promise<void>;
  dropTable?(schema: string, table: string): Promise<void>;
}

/** A live, engine-specific connection to a single database. */
export interface DatabaseAdapter {
  /** The engine identifier, e.g. "postgres". */
  readonly engine: string;
  /** Establish the underlying connection/pool. */
  connect(): Promise<void>;
  /** Tear down the connection/pool and release resources. */
  disconnect(): Promise<void>;
  /** Lightweight connectivity check. */
  ping(): Promise<boolean>;
  /** Human-readable engine name + version, e.g. "PostgreSQL 16.1", "SQLite 3.45.0". */
  getVersion(): Promise<string>;
  /** Introspect the overall structure (schemas and tables). */
  getOverview(): Promise<DatabaseOverview>;
  /** Session-level capabilities for the connected role - see
   * docs/product-specs/permissions-and-capabilities.md. `getOverview()`'s `capabilities` field is
   * this method's result, not computed separately - callers needing just the capabilities (without
   * a full structure introspection) can call this directly. */
  getCapabilities(): Promise<ConnectionCapabilities>;
  /** Introspect a single table's columns and metadata. */
  getTable(schema: string, table: string): Promise<TableMetadata>;
  /** Every table's metadata across every schema, in the shape N sequential `getTable` calls would
   * produce - but via one/few set-based catalog queries per engine where the engine supports it
   * (Postgres/MySQL), or bounded (not fan-out) per-table introspection otherwise (SQLite/MongoDB).
   * Backs `GET /api/tables` (F027, F123) so a large database's Schema tab doesn't fan out an
   * unbounded `Promise.all` of per-table catalog round trips. `rowCount` may be an estimate rather
   * than an exact count where the engine's own `getTable` already treats it as one. */
  getAllTables(): Promise<TableMetadata[]>;
  /** Fetch a page of rows for a table, optionally sorted by one column (F065) and/or narrowed by
   * one or more AND-combined filters (F072). `sort.column`/each `filters[].column` must already be
   * validated against the table's real columns by the caller - see
   * docs/product-specs/server-side-sort-export.md and docs/product-specs/rows-table-filtering.md.
   * `operationId` (F126) is a client-supplied id enabling cancellation - when present and the
   * engine supports it, the implementation registers a cancel callback with
   * {@link DatabaseAdapter.operationRegistry} for the query's duration; omitted entirely, this
   * behaves exactly as before (no extra connection checkout, no registration overhead) - every
   * caller that doesn't care about cancellation (tests, internal calls) keeps the fast path. */
  getRows(
    schema: string,
    table: string,
    page: number,
    pageSize: number,
    sort?: RowSort,
    filters?: RowFilter[],
    operationId?: string
  ): Promise<RowPage>;
  /** Execute a read-only (SELECT-style) query. Implementations must reject mutations.
   * `operationId` - see {@link DatabaseAdapter.getRows}. */
  runReadOnlyQuery(sql: string, operationId?: string): Promise<RowPage>;
  /**
   * Execute a single SQL statement of any {@link StatementClassification} without the
   * `runReadOnlyQuery` read-only transaction wrapper - `mutation`/`ddl`/confirmed-`destructive`
   * statements only, per `POST /api/query`'s routing (F107, `docs/product-specs/sql-editor.md`'s
   * "Write-capable SQL execution"). `read`-classified statements still go through
   * `runReadOnlyQuery`, never this method. Postgres/MySQL/SQLite only - absent on MongoDB, which
   * has no SQL query runner at all (`supportsSql: false`). CRITICAL: unlike `runReadOnlyQuery`,
   * implementations must NOT apply any read-oriented DWIM rewrite (e.g. Postgres's
   * `coerceUnknownQuotedIdentifiers`) - that's acceptable for a read, but must never silently alter
   * a mutation's SQL. `operationId` - see {@link DatabaseAdapter.getRows}.
   */
  runQuery?(sql: string, operationId?: string): Promise<QueryExecutionResult>;
  /** Structured row-mutation operations (F099-F101) - absent means the engine has no write
   * mechanism at all; present-but-grants-insufficient is a normal per-call rejection, not a
   * missing namespace. See {@link RowMutationApi}. */
  mutations?: RowMutationApi;
  /** Table/collection-lifecycle DDL operations (F110) - absent means the engine has no DDL
   * mechanism Qyre models at all (none do today); present-but-grants-insufficient is a normal
   * per-call rejection, not a missing namespace. See {@link SchemaDdlApi}. */
  ddl?: SchemaDdlApi;
  /**
   * Optional hook for adapters whose underlying client emits connection events asynchronously,
   * outside of any single request - e.g. Postgres/MySQL's pool "error" event when an idle
   * connection is dropped server-side. The server assigns this after `connect()` so such events
   * reach the Console tab's structured event log instead of a bare `console.error`. Adapters with
   * no async connection events of their own (SQLite, MongoDB) simply never call it.
   */
  onConnectionEvent?: (level: ConnectionEventLevel, message: string) => void;
  /**
   * Optional hook for cancellation (F126) - the server assigns this after `connect()` (same
   * pattern as {@link onConnectionEvent}), and cancellable methods (`getRows`/`runReadOnlyQuery`/
   * `runQuery`) use it to register/unregister a cancel callback when called with an `operationId`.
   * Adapters with no real cancellation mechanism (SQLite, whose synchronous driver blocks the
   * whole event loop for a query's duration - there is no point at which a cancel request could
   * even be received) simply never call it.
   */
  operationRegistry?: CancellationRegistry;
}

/** Creates {@link DatabaseAdapter} instances for targets a given engine supports. */
export interface AdapterFactory {
  readonly engine: string;
  /** Whether this factory can handle the given connection target. */
  supports(target: ConnectionTarget): boolean;
  /** Create (but do not yet connect) an adapter for the target. */
  create(target: ConnectionTarget): DatabaseAdapter;
}
