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
  Download,
  RefreshCw,
  Search,
  X
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { cn } from "../cn.js";
import { formatCell, friendlyTypeLabel } from "../primitives/format-cell.js";
import { TypeIcon } from "../primitives/type-icon.js";
import { CellValueDrawer } from "./cell-value-drawer.js";
import type { InspectableValue } from "./cell-value.js";
import { CellValue } from "./cell-value.js";
import { DateDetailPopover } from "./date-detail-popover.js";
import { FilterBar } from "./filter-bar.js";

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
  /** The structured filters currently applied server-side (F072), or undefined/empty when none.
   * Omitted (along with `onFiltersChange`) disables the filter bar and primary-key click-to-filter
   * entirely. */
  filters?: RowFilter[];
  /** Reports the full next filter set (add, remove, or a primary-key cell click replacing it with
   * a single drill-down filter) - the caller re-fetches `rowPage` filtered accordingly (F072). */
  onFiltersChange?: (filters: RowFilter[] | undefined) => void;
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
  filters,
  onFiltersChange
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

  async function copySelected(): Promise<void> {
    const rows = filtered.filter(({ index }) => selected.has(index)).map(({ row }) => row);
    await navigator.clipboard.writeText(toCsv(rowPage.columns, rows));
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

        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="font-mono text-[10px]" style={{ color: "var(--c-blue)" }}>
                {selected.size} selected
              </span>
              <button
                type="button"
                onClick={() => void copySelected()}
                className="flex items-center gap-1 rounded-[3px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Copy className="h-3 w-3" /> Copy as CSV
              </button>
            </>
          )}
          {onExportAllRows && (
            <button
              type="button"
              onClick={onExportAllRows}
              aria-label="Export all rows as CSV"
              title="Exports every row matching the current sort and filters"
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

      {rowPage.rows.length === 0 ? (
        <div data-testid="rows-table" className="flex-1 p-3">
          <p className="font-mono text-[11px] text-muted-foreground">No rows in this table.</p>
        </div>
      ) : (
        <div data-testid="rows-table" ref={scrollRef} className="flex-1 overflow-auto">
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                <th className="w-8 border-b border-r border-border px-2 py-2" />
                <th className="w-8 border-b border-r border-border px-2 py-2 text-right font-normal text-muted-foreground/40">
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
              {topPadding > 0 && (
                <tr>
                  <td colSpan={rowPage.columns.length + 2} style={{ height: topPadding }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const item = filtered[virtualRow.index];
                if (!item) return null;
                const { row, index } = item;
                return (
                  <tr
                    key={index}
                    data-index={virtualRow.index}
                    onClick={() => toggleRow(index)}
                    className={cn(
                      "cursor-pointer border-b border-border-subtle hover:bg-accent/40",
                      selected.has(index) && "bg-primary/5"
                    )}
                  >
                    <td className="w-8 border-r border-border-subtle px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(index)}
                        onChange={() => toggleRow(index)}
                        onClick={(event) => event.stopPropagation()}
                        className="h-3 w-3 accent-primary"
                        aria-label={`Select row ${virtualRow.index + 1}`}
                      />
                    </td>
                    <td className="w-8 border-r border-border-subtle px-2 py-1.5 text-right text-muted-foreground/30">
                      {virtualRow.index + 1}
                    </td>
                    {rowPage.columns.map((columnName) => {
                      const meta = columnByName.get(columnName);
                      const reference =
                        meta?.isForeignKey && onNavigateToForeignKey ? meta.references : undefined;
                      return (
                        <td
                          key={columnName}
                          className="whitespace-nowrap border-r border-border-subtle px-3 py-1.5 text-foreground/80"
                        >
                          {row[columnName] === null || row[columnName] === undefined ? (
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
