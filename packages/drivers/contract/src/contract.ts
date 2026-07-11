import type {
  ConnectionCapabilities,
  ConnectionTarget,
  DatabaseOverview,
  InsertRowResult,
  RowFilter,
  RowPage,
  RowSort,
  TableMetadata,
  UpdateRowResult
} from "@qyre/core";

/** Severity of an adapter's asynchronous connection event - see {@link DatabaseAdapter.onConnectionEvent}. */
export type ConnectionEventLevel = "warn" | "error";

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
  updateRowByKey?(
    schema: string,
    table: string,
    key: Record<string, unknown>,
    changes: Record<string, unknown>
  ): Promise<UpdateRowResult>;
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
   * docs/product-specs/server-side-sort-export.md and docs/product-specs/rows-table-filtering.md. */
  getRows(
    schema: string,
    table: string,
    page: number,
    pageSize: number,
    sort?: RowSort,
    filters?: RowFilter[]
  ): Promise<RowPage>;
  /** Execute a read-only (SELECT-style) query. Implementations must reject mutations. */
  runReadOnlyQuery(sql: string): Promise<RowPage>;
  /** Structured row-mutation operations (F099-F101) - absent means the engine has no write
   * mechanism at all; present-but-grants-insufficient is a normal per-call rejection, not a
   * missing namespace. See {@link RowMutationApi}. */
  mutations?: RowMutationApi;
  /**
   * Optional hook for adapters whose underlying client emits connection events asynchronously,
   * outside of any single request - e.g. Postgres/MySQL's pool "error" event when an idle
   * connection is dropped server-side. The server assigns this after `connect()` so such events
   * reach the Console tab's structured event log instead of a bare `console.error`. Adapters with
   * no async connection events of their own (SQLite, MongoDB) simply never call it.
   */
  onConnectionEvent?: (level: ConnectionEventLevel, message: string) => void;
}

/** Creates {@link DatabaseAdapter} instances for targets a given engine supports. */
export interface AdapterFactory {
  readonly engine: string;
  /** Whether this factory can handle the given connection target. */
  supports(target: ConnectionTarget): boolean;
  /** Create (but do not yet connect) an adapter for the target. */
  create(target: ConnectionTarget): DatabaseAdapter;
}
