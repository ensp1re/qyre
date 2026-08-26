import type {
  ColumnMetadata,
  DatabaseEngine,
  ForeignKeyReference,
  JsonExportMode,
  RowFilter,
  RowExportFormat,
  RowPage,
  TableKind
} from "@qyre/core";

export interface RowsTableProps {
  rowPage: RowPage;
  columns?: ColumnMetadata[];
  engine?: DatabaseEngine;
  tableName?: string;
  /** What the selected object actually is. Surfaced in the footer for anything that isn't an
   * ordinary table/collection, because a view legitimately has no row total and no editing - and
   * without saying so, both absences read as Qyre malfunctioning (F156). */
  tableKind?: TableKind;
  approxRowCount?: number;
  /** Exact count returned for an active server-side filter/search. */
  matchingRowCount?: number;
  page: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onRefresh?: () => void;
  /** Navigates to the table/column a foreign key cell references (F061), passed the clicked cell's
   * raw value so the caller can pre-filter the referenced table to just that row (F072). Omitted
   * (cells render as plain values, not links) when the caller has no such navigation to offer. */
  onNavigateToForeignKey?: (reference: ForeignKeyReference, value: unknown) => void;
  /** The sort currently applied server-side (F065), or undefined when unsorted - drives the header
   * arrow indicator. Omitted (along with `onSortChange`) disables the sort affordance entirely. */
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  /** Reports a header click's requested sort (cycles asc -> desc -> undefined/cleared on repeated
   * clicks of the same column); the caller re-fetches `rowPage` sorted accordingly (F065) - this
   * component no longer reorders rows itself. Omitted disables the sort affordance (headers render
   * as plain, non-interactive labels). */
  onSortChange?: (sort: { column: string; direction: "asc" | "desc" } | undefined) => void;
  /** Whole-result formats the connected adapter supports (F118). Defaults to CSV for callers that
   * haven't loaded capabilities yet. */
  exportFormats?: readonly RowExportFormat[];
  /** Distinguishes MongoDB's relaxed Extended JSON label from ordinary JSON. */
  jsonExportMode?: JsonExportMode;
  /** Triggers a whole-table export in the chosen format (F118), replacing the old page-only CSV
   * export. Omitted hides the whole-result control - this component doesn't fetch data itself (see
   * FRONTEND.md), so the actual request is the caller's responsibility. */
  onExportAllRows?: (format: RowExportFormat) => void;
  /** Downloads a CSV generated from the selected rows currently loaded in this component. The
   * caller owns the actual browser download so packages/ui stays presentation-oriented. */
  onExportSelectedRows?: (csv: string) => void;
  /** Opens F117's CSV import flow. Both props are required so a write-shaped control is hidden
   * entirely when the session or target lacks insert permission. */
  canImportCsv?: boolean;
  onImportCsv?: () => void;
  /** The structured filters currently applied server-side (F072), or undefined/empty when none.
   * Omitted (along with `onFiltersChange`) disables the filter bar and primary-key click-to-filter
   * entirely. */
  filters?: RowFilter[];
  /** Reports the full next filter set (add, remove, or a primary-key cell click replacing it with
   * a single drill-down filter) - the caller re-fetches `rowPage` filtered accordingly (F072). */
  onFiltersChange?: (filters: RowFilter[] | undefined) => void;
  /** Whole-table search committed with Enter; typing remains a current-page preview. */
  tableSearch?: string;
  onTableSearchChange?: (search: string | undefined) => void;
  /** Shows progress beside the search field while the committed whole-table query is fetching. */
  searchLoading?: boolean;
  /** Enables inline cell editing (F103) - omitted or false renders every cell exactly as before,
   * matching every other opt-in prop here. The caller derives this (and `editableColumns`) from
   * session capabilities, table permissions, `kind`, and primary-key presence - this component
   * never re-derives editability itself. */
  editable?: boolean;
  /** Column names eligible for inline editing when `editable` is true - primary-key columns are
   * never included (see docs/product-specs/row-editing.md). Ignored when `editable` is false. */
  editableColumns?: ReadonlySet<string>;
  /** Why editing is unavailable, shown as a small badge in the toolbar - omitted (with `editable`
   * false) shows no badge and no explanation, matching a table this component has no opinion on
   * (e.g. the caller hasn't loaded permissions yet). */
  editingDisabledReason?: string;
  /** The primary-key column names, used to compute each row's stable identity for the
   * pending-changes buffer below. Required (with `pendingChanges`) for any cell to be editable. */
  primaryKeyColumns?: readonly string[];
  /** The pending-changes buffer (F103/F104) - `RowsTable` stages edits/inserts into it and reads
   * staged values back for dirty-cell/draft-row display, but never calls the server itself; commit
   * wiring is F105. Omitted disables editing and Add-row/Duplicate-row regardless of `editable`/
   * `canInsert`. */
  pendingChanges?: {
    getEdit: (rowKey: string, column: string) => { next: unknown } | undefined;
    stageEdit: (rowKey: string, column: string, original: unknown, next: unknown) => void;
    revertEdit: (rowKey: string, column: string) => void;
    inserts: readonly { id: string; values: Readonly<Record<string, unknown>> }[];
    addInsert: (initialValues?: Record<string, unknown>) => string;
    updateInsertValue: (id: string, column: string, value: unknown) => void;
    removeInsert: (id: string) => void;
    deletes: ReadonlySet<string>;
    stageDelete: (rowKey: string) => void;
    unstageDelete: (rowKey: string) => void;
  };
  /** Whether Add-row/Duplicate-row (F104) render at all - hidden entirely (not disabled) when
   * false, matching `docs/product-specs/row-editing.md`. Independent of `editable`: a session can
   * have insert without update permission. */
  canInsert?: boolean;
  /** Columns an insert draft can set - primary-key columns are included here (unlike
   * `editableColumns`), since a new row's key must be supplied unless the engine auto-generates it.
   * Ignored when `canInsert` is false. */
  insertableColumns?: ReadonlySet<string>;
  /** Whether selected rows can be staged for deletion (F105) - hidden entirely (not disabled) when
   * false. Independent of `editable`/`canInsert`. */
  canDelete?: boolean;
}

/** Approximate row height in px (matches the `py-1.5` cell padding + 11px font) - only an estimate
 * the virtualizer (F051) uses to size the scrollbar before it measures real rows; rows are uniform
 * height here so it doesn't need per-row re-measurement. */
