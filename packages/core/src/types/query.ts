/** A page of rows returned for a table or read-only query. */
export interface RowPage {
  readonly columns: string[];
  readonly rows: Array<Record<string, unknown>>;
  readonly page: number;
  readonly pageSize: number;
  readonly total?: number;
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
