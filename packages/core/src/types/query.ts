/** A page of rows returned for a table or read-only query. */
export interface RowPage {
  readonly columns: string[];
  readonly rows: Array<Record<string, unknown>>;
  readonly page: number;
  readonly pageSize: number;
  readonly total?: number;
}

/**
 * Result of executing one write-capable SQL statement (F107) via `DatabaseAdapter.runQuery` -
 * either row-returning (`rows` populated, `rowsAffected` mirrors `rows.length`) or a bare
 * affected-row count for a statement with no result set (`rows` empty, `rowsAffected` is the
 * engine-reported changed/affected count - 0 for DDL). Read-shaped statements still go through
 * `runReadOnlyQuery`/`RowPage`, not this type - see `docs/product-specs/sql-editor.md`'s
 * "Write-capable SQL execution" section.
 */
export interface QueryExecutionResult {
  readonly columns: string[];
  readonly rows: Array<Record<string, unknown>>;
  readonly rowsAffected: number;
}

/**
 * A single SQL statement's write classification (F106), from `@qyre/driver-contract`'s
 * `classifyStatement` text heuristic. Lives in `@qyre/core` (not `@qyre/driver-contract`, which
 * depends on this package) so `apps/web` can type `POST /api/query`'s response/request shapes
 * (F108) without depending on the adapter-layer `@qyre/driver-contract` package -
 * `@qyre/driver-contract`'s `read-only.ts` re-exports this same type for its existing consumers.
 */
export type StatementClassification = "read" | "mutation" | "ddl" | "destructive";

/** Response shape of `POST /api/operations/:id/cancel` (F126). `cancelled: false` isn't an error -
 * it just means there was nothing left to cancel (the operation already finished, the engine has
 * no real cancellation mechanism, or the id was never registered). */
export interface CancelOperationResult {
  readonly cancelled: boolean;
}

/** Which direction to sort rows in `GET /api/tables/:schema/:table/rows` (F065). */
export type SortDirection = "asc" | "desc";

/** A validated column/direction pair to sort a table's rows by (F065). The column must already be
 * checked against the table's real column names before this is constructed - see
 * docs/product-specs/server-side-sort-export.md's injection-surface note. */
export interface RowSort {
  readonly column: string;
  readonly direction: SortDirection;
}

/** The fixed whitelist of filter operators `GET /api/tables/:schema/:table/rows` accepts (F072).
 * See docs/product-specs/rows-table-filtering.md. */
export const FILTER_OPS = [
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "contains",
  "isNull",
  "isNotNull"
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

/** A validated column/operator/value filter to narrow a table's rows by (F072). The column must
 * already be checked against the table's real column names before this is constructed, same as
 * {@link RowSort}'s `column`. `value` is absent for `isNull`/`isNotNull`, which don't use one. */
export interface RowFilter {
  readonly column: string;
  readonly op: FilterOp;
  readonly value?: string;
}
