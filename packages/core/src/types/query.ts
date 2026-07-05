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
