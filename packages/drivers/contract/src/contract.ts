import type {
  ConnectionTarget,
  DatabaseOverview,
  RowPage,
  RowSort,
  TableMetadata
} from "@qyre/core";

/** Severity of an adapter's asynchronous connection event - see {@link DatabaseAdapter.onConnectionEvent}. */
export type ConnectionEventLevel = "warn" | "error";

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
  /** Introspect a single table's columns and metadata. */
  getTable(schema: string, table: string): Promise<TableMetadata>;
  /** Fetch a page of rows for a table, optionally sorted by one column (F065). `sort.column` must
   * already be validated against the table's real columns by the caller - see
   * docs/product-specs/server-side-sort-export.md. */
  getRows(
    schema: string,
    table: string,
    page: number,
    pageSize: number,
    sort?: RowSort
  ): Promise<RowPage>;
  /** Execute a read-only (SELECT-style) query. Implementations must reject mutations. */
  runReadOnlyQuery(sql: string): Promise<RowPage>;
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
