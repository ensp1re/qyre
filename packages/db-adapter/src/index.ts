/**
 * Engine-agnostic database adapter contracts.
 *
 * Concrete engines (e.g. `@humb/db-postgres`) implement {@link DatabaseAdapter}.
 * This package must not depend on any concrete database driver. See ARCHITECTURE.md.
 */
import type { ConnectionTarget, DatabaseOverview, RowPage, TableMetadata } from "@humb/core";

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
  /** Introspect the overall structure (schemas and tables). */
  getOverview(): Promise<DatabaseOverview>;
  /** Introspect a single table's columns and metadata. */
  getTable(schema: string, table: string): Promise<TableMetadata>;
  /** Fetch a page of rows for a table. */
  getRows(schema: string, table: string, page: number, pageSize: number): Promise<RowPage>;
  /** Execute a read-only (SELECT-style) query. Implementations must reject mutations. */
  runReadOnlyQuery(sql: string): Promise<RowPage>;
}

/** Creates {@link DatabaseAdapter} instances for targets a given engine supports. */
export interface AdapterFactory {
  readonly engine: string;
  /** Whether this factory can handle the given connection target. */
  supports(target: ConnectionTarget): boolean;
  /** Create (but do not yet connect) an adapter for the target. */
  create(target: ConnectionTarget): DatabaseAdapter;
}

/** Thrown when no registered adapter supports a connection target. */
export class UnsupportedEngineError extends Error {
  constructor(engine: string) {
    super(`No database adapter is registered for engine "${engine}".`);
    this.name = "UnsupportedEngineError";
  }
}

/** Resolve the first factory that supports the target, or throw. */
export function resolveAdapter(
  factories: readonly AdapterFactory[],
  target: ConnectionTarget
): DatabaseAdapter {
  const factory = factories.find((candidate) => candidate.supports(target));
  if (!factory) {
    throw new UnsupportedEngineError(target.engine);
  }
  return factory.create(target);
}
