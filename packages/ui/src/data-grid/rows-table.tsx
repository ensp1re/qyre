import type {
  ColumnMetadata,
  DatabaseEngine,
  ForeignKeyReference,
  RowFilter,
  RowPage
} from "@qyre/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  CopyPlus,
  Download,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X
} from "lucide-react";
import type { PointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../cn.js";
import { formatCell, friendlyTypeLabel } from "../primitives/format-cell.js";
import { TypeIcon } from "../primitives/type-icon.js";
import { CellValueDrawer } from "./cell-value-drawer.js";
import type { InspectableValue } from "./cell-value.js";
import { CellValue } from "./cell-value.js";
import { DateDetailPopover } from "./date-detail-popover.js";
import { EditableCell } from "./editable-cell.js";
import { FilterBar } from "./filter-bar.js";
import { NewRowCell } from "./new-row-cell.js";

export interface RowsTableProps {
  rowPage: RowPage;
  columns?: ColumnMetadata[];
  engine?: DatabaseEngine;
  tableName?: string;
  approxRowCount?: number;
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
  /** Triggers a whole-table CSV export (F066), replacing the old page-only export. Omitted hides
   * the export button - this component doesn't fetch data itself (see FRONTEND.md), so the actual
   * request is the caller's responsibility. */
  onExportAllRows?: () => void;
  /** Downloads a CSV generated from the selected rows currently loaded in this component. The
   * caller owns the actual browser download so packages/ui stays presentation-oriented. */
  onExportSelectedRows?: (csv: string) => void;
  /** The structured filters currently applied server-side (F072), or undefined/empty when none.
   * Omitted (along with `onFiltersChange`) disables the filter bar and primary-key click-to-filter
   * entirely. */
  filters?: RowFilter[];
  /** Reports the full next filter set (add, remove, or a primary-key cell click replacing it with
   * a single drill-down filter) - the caller re-fetches `rowPage` filtered accordingly (F072). */
  onFiltersChange?: (filters: RowFilter[] | undefined) => void;
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
  /** MongoDB's whole-document editing (F125) - a separate affordance set from the SQL grid's own
   * `editable`/`canInsert`/`canDelete` (always false for MongoDB, see
   * `apps/web/src/features/table/model/editability.ts`). `canEditDocument` renders a per-row "Edit
   * document" action in the same slot Duplicate-row uses for SQL (the two never coexist - only one
   * engine's affordance set is ever true), calling `onEditDocument` with that row's raw data. */
  canEditDocument?: boolean;
  onEditDocument?: (row: Record<string, unknown>) => void;
  /** Renders a toolbar "Insert document" action, calling `onInsertDocument` with no arguments - the
   * caller owns opening the document editor in insert mode. */
  canInsertDocument?: boolean;
  onInsertDocument?: () => void;
}

/** Approximate row height in px (matches the `py-1.5` cell padding + 11px font) - only an estimate
 * the virtualizer (F051) uses to size the scrollbar before it measures real rows; rows are uniform
 * height here so it doesn't need per-row re-measurement. */
const ROW_HEIGHT_ESTIMATE = 30;

const FORMULA_LEADING_CHARS = /^[=+\-@]/;

/** Used by the selected-rows "Copy as CSV" action only (F066 moved the whole-table export
 * server-side - see onExportAllRows) - copying a hand-picked subset of currently-loaded rows still
 * makes sense entirely client-side. */
export function toCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  const escape = (value: unknown): string => {
    const text = formatCell(value);
    // Prefix a leading apostrophe so Excel/Sheets treats a value like `=cmd()` as text, not a
    // formula - CSV export can otherwise be used to inject formulas into the analyst's spreadsheet.
    const safeText = FORMULA_LEADING_CHARS.test(text) ? `'${text}` : text;
    return /[",\n]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText;
  };
  const lines = [columns.map(escape).join(",")];
  for (const row of rows) lines.push(columns.map((column) => escape(row[column])).join(","));
  return lines.join("\n");
}

/** Stable identity for a row, derived from its primary-key column values (F103) - how a staged
 * edit is matched back to the same logical row regardless of page/sort/filter changes. Mirrors
 * `apps/web/src/features/table/model/pending-changes.ts`'s `computeRowKey` exactly (packages/ui
 * can't depend on apps/web, and this is small enough that duplicating it beats a shared package for
 * three lines) - both sides must stay in sync if the shape ever changes. */
function computeRowKey(row: Record<string, unknown>, primaryKeyColumns: readonly string[]): string {
  return JSON.stringify([...primaryKeyColumns].sort().map((column) => [column, row[column]]));
}

/** A page of table rows: client-side search over the fetched page, plus server-driven sort (F065)
 * and pagination. */
export function RowsTable({
  rowPage,
  columns = [],
  engine,
  tableName,
  approxRowCount,
  page,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  onRefresh,
  onNavigateToForeignKey,
  sortColumn,
  sortDirection,
  onSortChange,
  onExportAllRows,
  onExportSelectedRows,
  filters,
  onFiltersChange,
  editable,
  editableColumns,
  editingDisabledReason,
  primaryKeyColumns,
  pendingChanges,
  canInsert,
  insertableColumns,
  canDelete,
  canEditDocument,
  onEditDocument,
  canInsertDocument,
  onInsertDocument
}: RowsTableProps): ReactNode {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [inspected, setInspected] = useState<{
    column: string;
    value: InspectableValue;
  } | null>(null);
  const [dateInspected, setDateInspected] = useState<{
    value: unknown;
    anchorRect: DOMRect;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragSelectionMode = useRef<"select" | "deselect" | null>(null);

  const columnByName = useMemo(
    () => new Map(columns.map((column) => [column.name, column])),
    [columns]
  );

  const indexed = useMemo(() => rowPage.rows.map((row, index) => ({ row, index })), [rowPage.rows]);

  // Rows arrive already sorted server-side (F065) when a sort is active - this only narrows by the
  // free-text filter below, it never reorders.
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return indexed;
    return indexed.filter(({ row }) =>
      Object.values(row).some((value) => formatCell(value).toLowerCase().includes(query))
    );
  }, [indexed, search]);

  const visibleIndexes = useMemo(() => filtered.map(({ index }) => index), [filtered]);
  const selectedVisibleCount = visibleIndexes.filter((index) => selected.has(index)).length;
  const allVisibleSelected =
    visibleIndexes.length > 0 && selectedVisibleCount === visibleIndexes.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  useEffect(() => {
    setSelected(new Set());
  }, [rowPage.rows, search]);

  useEffect(() => {
    const stopDrag = () => {
      dragSelectionMode.current = null;
    };
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, []);

  // F051: only the visible rows (plus overscan) mount as DOM nodes, instead of every row in the
  // current page - a wide table at the SQL Editor's 1000-row cap (F050) would otherwise mount
  // thousands of cells.
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 8
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const topPadding = virtualRows[0]?.start ?? 0;
  const bottomPadding =
    rowVirtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0);

  function handleSort(column: string): void {
    if (!onSortChange) return;
    if (sortColumn !== column) {
      onSortChange({ column, direction: "asc" });
    } else if (sortDirection === "asc") {
      onSortChange({ column, direction: "desc" });
    } else {
      onSortChange(undefined);
    }
  }

  /** Clicking a primary-key cell's value drills into just that row (F072) - replaces the active
   * filter set rather than adding to it, since appending to whatever filters happened to already
   * be active would be surprising. */
  function filterToPrimaryKeyValue(column: string, value: unknown): void {
    onFiltersChange?.([{ column, op: "eq", value: formatCell(value) }]);
  }

  function toggleRow(index: number): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function setRowSelected(index: number, shouldSelect: boolean): void {
    setSelected((current) => {
      if (current.has(index) === shouldSelect) return current;
      const next = new Set(current);
      if (shouldSelect) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  function toggleVisibleRows(): void {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const index of visibleIndexes) next.delete(index);
      } else {
        for (const index of visibleIndexes) next.add(index);
      }
      return next;
    });
  }

  function isInteractiveTarget(target: EventTarget | null): boolean {
    return target instanceof Element
      ? Boolean(target.closest("button,input,a,select,textarea,label"))
      : false;
  }

  function startRowSelectionDrag(index: number, event: PointerEvent<HTMLTableRowElement>) {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;
    const shouldSelect = !selected.has(index);
    dragSelectionMode.current = shouldSelect ? "select" : "deselect";
    setRowSelected(index, shouldSelect);
    event.preventDefault();
  }

  function applyRowSelectionDrag(index: number): void {
    if (!dragSelectionMode.current) return;
    setRowSelected(index, dragSelectionMode.current === "select");
  }

  async function copySelected(): Promise<void> {
    const rows = filtered.filter(({ index }) => selected.has(index)).map(({ row }) => row);
    await navigator.clipboard.writeText(toCsv(rowPage.columns, rows));
  }

  const canExportSelectedRows = selected.size > 0 && Boolean(onExportSelectedRows);

  function exportRows(): void {
    if (!canExportSelectedRows) {
      onExportAllRows?.();
      return;
    }
    const rows = filtered.filter(({ index }) => selected.has(index)).map(({ row }) => row);
    onExportSelectedRows?.(toCsv(rowPage.columns, rows));
  }

  // F104: Add-row/Duplicate-row are hidden entirely (not disabled) when the session/table can't
  // insert - see docs/product-specs/row-editing.md.
  const canAddRow = Boolean(canInsert && pendingChanges);

  /** Pre-fills a new draft from an existing row's insertable columns, primary key excluded - a
   * duplicate never proposes an exact copy of another row's key, which would just collide on
   * insert; the user (or the engine, if auto-generated) supplies a new one. */
  function duplicateRow(row: Record<string, unknown>): void {
    if (!pendingChanges || !insertableColumns) return;
    const initialValues: Record<string, unknown> = {};
    for (const columnName of insertableColumns) {
      if (primaryKeyColumns?.includes(columnName)) continue;
      const value = row[columnName];
      if (value !== null && value !== undefined) initialValues[columnName] = value;
    }
    pendingChanges.addInsert(initialValues);
  }

  // F105: staging is hidden entirely (not disabled) when the session/table can't delete, mirroring
  // canAddRow above.
  const canStageDelete = Boolean(canDelete && pendingChanges && primaryKeyColumns);

  /** Stages every currently-selected row for deletion - clicking this button IS the explicit
   * confirming click docs/product-specs/row-editing.md requires for delete, distinct from mere
   * selection (which stays a read-only, side-effect-free action everywhere else in this table). */
  function stageSelectedForDelete(): void {
    if (!pendingChanges || !primaryKeyColumns) return;
    for (const { row, index } of filtered) {
      if (!selected.has(index)) continue;
      pendingChanges.stageDelete(computeRowKey(row, primaryKeyColumns));
    }
    setSelected(new Set());
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 rounded-[3px] bg-accent px-2 py-1 font-mono text-[11px] text-muted-foreground">
          <Search className="h-2.5 w-2.5" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search this page..."
            aria-label="Search this page"
            title="Searches only the rows currently loaded on this page - use Filter to query the whole table"
            className="w-28 min-w-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground sm:w-36"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

        {onFiltersChange && (
          <FilterBar
            columns={columns}
            engine={engine}
            filters={filters}
            onFiltersChange={onFiltersChange}
          />
        )}

        {!editable && editingDisabledReason && (
          <span
            title={editingDisabledReason}
            className="flex items-center gap-1 rounded-[3px] bg-accent/60 px-2 py-1 font-mono text-[10px] text-muted-foreground"
          >
            <Lock className="h-2.5 w-2.5" /> Read-only
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {canAddRow && (
            <button
              type="button"
              onClick={() => pendingChanges?.addInsert()}
              className="flex items-center gap-1 rounded-[3px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Add row
            </button>
          )}
          {canInsertDocument && onInsertDocument && (
            <button
              type="button"
              onClick={onInsertDocument}
              className="flex items-center gap-1 rounded-[3px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Insert document
            </button>
          )}
          {selected.size > 0 && (
            <>
              <span className="font-mono text-[10px]" style={{ color: "var(--c-blue)" }}>
                {selected.size} selected
              </span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                aria-label="Clear selected rows"
                title="Clear selected rows"
                className="rounded-[3px] p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => void copySelected()}
                className="flex items-center gap-1 rounded-[3px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Copy className="h-3 w-3" /> Copy as CSV
              </button>
              {canStageDelete && (
                <button
                  type="button"
                  onClick={stageSelectedForDelete}
                  className="flex items-center gap-1 rounded-[3px] px-2 py-1 text-[11px] hover:bg-accent"
                  style={{ color: "var(--c-red)" }}
                >
                  <Trash2 className="h-3 w-3" /> Delete {selected.size} selected
                </button>
              )}
            </>
          )}
          {(onExportAllRows || canExportSelectedRows) && (
            <button
              type="button"
              onClick={exportRows}
              aria-label={
                canExportSelectedRows ? "Export selected rows as CSV" : "Export all rows as CSV"
              }
              title={
                canExportSelectedRows
                  ? "Exports the selected rows on this page"
                  : "Exports every row matching the current sort and filters"
              }
              className="rounded-[3px] p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Download className="h-3 w-3" />
            </button>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              aria-label="Refresh rows"
              className="rounded-[3px] p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {rowPage.rows.length === 0 && !(pendingChanges && pendingChanges.inserts.length > 0) ? (
        <div data-testid="rows-table" className="flex-1 p-3">
          <p className="font-mono text-[11px] text-muted-foreground">No rows in this table.</p>
        </div>
      ) : (
        <div data-testid="rows-table" ref={scrollRef} className="flex-1 overflow-auto">
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                <th className="w-8 border-b border-r border-border px-2 py-2 text-center">
                  <label className="inline-flex cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      disabled={visibleIndexes.length === 0}
                      onChange={toggleVisibleRows}
                      ref={(input) => {
                        if (input) input.indeterminate = someVisibleSelected;
                      }}
                      aria-label="Select all rows on this page"
                      aria-checked={
                        someVisibleSelected ? "mixed" : allVisibleSelected ? "true" : "false"
                      }
                      className="h-3 w-3 accent-primary"
                    />
                  </label>
                </th>
                <th
                  className={cn(
                    "border-b border-r border-border px-2 py-2 text-right font-normal text-muted-foreground/40",
                    canAddRow ? "w-14" : "w-8"
                  )}
                >
                  #
                </th>
                {rowPage.columns.map((columnName) => {
                  const meta = columnByName.get(columnName);
                  return (
                    <th
                      key={columnName}
                      onClick={onSortChange ? () => handleSort(columnName) : undefined}
                      className={cn(
                        "group whitespace-nowrap border-b border-r border-border px-3 py-1.5 text-left font-medium text-muted-foreground",
                        onSortChange ? "cursor-pointer hover:text-foreground" : undefined
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {columnName}
                        {onSortChange && (
                          <ArrowUpDown
                            className={cn(
                              "h-2.5 w-2.5 transition-opacity",
                              sortColumn === columnName
                                ? "text-primary opacity-100"
                                : "opacity-0 group-hover:opacity-40"
                            )}
                          />
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 font-mono text-[9px] font-normal text-muted-foreground/60">
                        {meta && <TypeIcon dataType={meta.dataType} />}
                        <span>{meta ? friendlyTypeLabel(meta.dataType) : "unknown"}</span>
                        {meta?.isPrimaryKey && (
                          <span className="font-bold" style={{ color: "var(--c-amber)" }}>
                            PK
                          </span>
                        )}
                        {meta?.isForeignKey && (
                          <span className="font-bold" style={{ color: "var(--c-blue)" }}>
                            FK
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {canAddRow &&
                pendingChanges &&
                pendingChanges.inserts.map((insert) => (
                  <tr
                    key={insert.id}
                    className="border-b border-border-subtle"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--c-green) 8%, transparent)"
                    }}
                  >
                    <td className="w-8 border-r border-border-subtle px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => pendingChanges.removeInsert(insert.id)}
                        aria-label="Discard new row"
                        title="Discard new row"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                    <td
                      className="w-14 border-r border-border-subtle px-2 py-1.5 text-right font-bold"
                      style={{ color: "var(--c-green)" }}
                    >
                      new
                    </td>
                    {rowPage.columns.map((columnName) => {
                      const meta = columnByName.get(columnName);
                      const isInsertable = insertableColumns?.has(columnName);
                      return (
                        <td
                          key={columnName}
                          className="whitespace-nowrap border-r border-border-subtle px-3 py-1.5"
                        >
                          {isInsertable ? (
                            <NewRowCell
                              value={insert.values[columnName]}
                              dataType={meta?.dataType ?? "unknown"}
                              engine={engine}
                              nullable={meta?.nullable ?? true}
                              onChange={(next) =>
                                pendingChanges.updateInsertValue(insert.id, columnName, next)
                              }
                            />
                          ) : (
                            <span className="italic text-muted-foreground/30">not editable</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              {topPadding > 0 && (
                <tr>
                  <td colSpan={rowPage.columns.length + 2} style={{ height: topPadding }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const item = filtered[virtualRow.index];
                if (!item) return null;
                const { row, index } = item;
                const rowKey =
                  pendingChanges && primaryKeyColumns
                    ? computeRowKey(row, primaryKeyColumns)
                    : undefined;
                const markedForDelete = Boolean(rowKey && pendingChanges?.deletes.has(rowKey));
                return (
                  <tr
                    key={index}
                    data-index={virtualRow.index}
                    onPointerDown={(event) => startRowSelectionDrag(index, event)}
                    onPointerEnter={() => applyRowSelectionDrag(index)}
                    className={cn(
                      "cursor-pointer select-none border-b border-border-subtle hover:bg-accent/40",
                      selected.has(index) && "bg-primary/5"
                    )}
                    style={
                      markedForDelete
                        ? { backgroundColor: "color-mix(in srgb, var(--c-red) 8%, transparent)" }
                        : undefined
                    }
                  >
                    <td className="w-8 border-r border-border-subtle px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(index)}
                        onChange={() => toggleRow(index)}
                        onClick={(event) => event.stopPropagation()}
                        disabled={markedForDelete}
                        className="h-3 w-3 accent-primary"
                        aria-label={`Select row ${virtualRow.index + 1}`}
                      />
                    </td>
                    <td
                      className={cn(
                        "border-r border-border-subtle px-1 py-1.5 text-right text-muted-foreground/30",
                        canAddRow || markedForDelete || canEditDocument ? "w-14" : "w-8"
                      )}
                    >
                      <div className="flex items-center justify-end gap-1">
                        {markedForDelete ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (rowKey) pendingChanges?.unstageDelete(rowKey);
                            }}
                            aria-label={`Undo delete row ${virtualRow.index + 1}`}
                            title="Undo delete"
                            className="font-mono text-[9px] font-bold hover:underline"
                            style={{ color: "var(--c-red)" }}
                          >
                            undo
                          </button>
                        ) : canEditDocument && onEditDocument ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onEditDocument(row);
                            }}
                            aria-label={`Edit document ${virtualRow.index + 1}`}
                            title="Edit document"
                            className="text-muted-foreground/60 hover:text-foreground"
                          >
                            <Pencil className="h-2.5 w-2.5" />
                          </button>
                        ) : (
                          canAddRow && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                duplicateRow(row);
                              }}
                              aria-label={`Duplicate row ${virtualRow.index + 1}`}
                              title="Duplicate row"
                              className="text-muted-foreground/60 hover:text-foreground"
                            >
                              <CopyPlus className="h-2.5 w-2.5" />
                            </button>
                          )
                        )}
                        <span className={markedForDelete ? "line-through" : undefined}>
                          {virtualRow.index + 1}
                        </span>
                      </div>
                    </td>
                    {rowPage.columns.map((columnName) => {
                      const meta = columnByName.get(columnName);
                      const reference =
                        meta?.isForeignKey && onNavigateToForeignKey ? meta.references : undefined;
                      // FK-with-navigation and PK-with-filter-click keep their existing single-click
                      // behavior even when this column is otherwise editable - PK columns are never
                      // in `editableColumns` in the first place (F103), so only the FK case actually
                      // needs this explicit precedence check.
                      const isEditableCell =
                        editable &&
                        !reference &&
                        !meta?.isPrimaryKey &&
                        editableColumns?.has(columnName) &&
                        pendingChanges &&
                        primaryKeyColumns &&
                        !markedForDelete;
                      const staged =
                        isEditableCell && rowKey
                          ? pendingChanges.getEdit(rowKey, columnName)
                          : undefined;
                      return (
                        <td
                          key={columnName}
                          className={cn(
                            "whitespace-nowrap border-r border-border-subtle px-3 py-1.5 text-foreground/80",
                            markedForDelete && "line-through opacity-60"
                          )}
                        >
                          {isEditableCell && rowKey ? (
                            <EditableCell
                              displayValue={staged ? staged.next : row[columnName]}
                              dataType={meta?.dataType ?? "unknown"}
                              engine={engine}
                              nullable={meta?.nullable ?? true}
                              dirty={Boolean(staged)}
                              onCommit={(next) =>
                                pendingChanges.stageEdit(rowKey, columnName, row[columnName], next)
                              }
                              onRevert={() => pendingChanges.revertEdit(rowKey, columnName)}
                            />
                          ) : row[columnName] === null || row[columnName] === undefined ? (
                            <span className="italic text-muted-foreground/30">null</span>
                          ) : reference ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onNavigateToForeignKey?.(reference, row[columnName]);
                              }}
                              title={`Go to ${reference.table}.${reference.column}`}
                              className="underline decoration-dotted underline-offset-2 hover:text-primary"
                              style={{ color: "var(--c-blue)" }}
                            >
                              {formatCell(row[columnName])}
                            </button>
                          ) : meta?.isPrimaryKey && onFiltersChange ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                filterToPrimaryKeyValue(columnName, row[columnName]);
                              }}
                              title={`Filter to this row (${columnName})`}
                              className="underline decoration-dotted underline-offset-2 hover:text-primary"
                              style={{ color: "var(--c-amber)" }}
                            >
                              {formatCell(row[columnName])}
                            </button>
                          ) : (
                            <CellValue
                              value={row[columnName]}
                              dataType={meta?.dataType}
                              onInspect={(value) => setInspected({ column: columnName, value })}
                              onInspectDate={(value, anchorRect) =>
                                setDateInspected({ value, anchorRect })
                              }
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {bottomPadding > 0 && (
                <tr>
                  <td colSpan={rowPage.columns.length + 2} style={{ height: bottomPadding }} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-3 py-1.5">
        <span className="font-mono text-[10px] text-muted-foreground">
          {filtered.length.toLocaleString()} of{" "}
          {approxRowCount !== undefined
            ? `~${approxRowCount.toLocaleString()}`
            : filtered.length.toLocaleString()}{" "}
          rows
          {tableName && <> · {tableName}</>}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canGoPrevious}
            onClick={onPrevious}
            aria-label="Previous page"
            className="rounded-[2px] p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="px-1 font-mono text-[10px] text-muted-foreground">Page {page + 1}</span>
          <button
            type="button"
            disabled={!canGoNext}
            onClick={onNext}
            aria-label="Next page"
            className="rounded-[2px] p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {inspected && (
        <CellValueDrawer
          column={inspected.column}
          value={inspected.value}
          onClose={() => setInspected(null)}
        />
      )}

      {dateInspected && (
        <DateDetailPopover
          value={dateInspected.value}
          anchorRect={dateInspected.anchorRect}
          onClose={() => setDateInspected(null)}
        />
      )}
    </div>
  );
}
