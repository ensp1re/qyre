import type { ColumnMetadata, RowPage } from "@humbdb/core";
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
import { formatCell } from "../format-cell.js";
import { CellValueDrawer } from "./cell-value-drawer.js";
import type { InspectableValue } from "./cell-value.js";
import { CellValue } from "./cell-value.js";
import { TypeIcon } from "./type-icon.js";

export interface RowsTableProps {
  rowPage: RowPage;
  columns?: ColumnMetadata[];
  tableName?: string;
  approxRowCount?: number;
  page: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onRefresh?: () => void;
}

type SortDir = "asc" | "desc" | null;

/** Approximate row height in px (matches the `py-1.5` cell padding + 11px font) - only an estimate
 * the virtualizer (F051) uses to size the scrollbar before it measures real rows; rows are uniform
 * height here so it doesn't need per-row re-measurement. */
const ROW_HEIGHT_ESTIMATE = 30;

const FORMULA_LEADING_CHARS = /^[=+\-@]/;

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

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** A page of table rows: client-side search/sort over the fetched page, plus pagination. */
export function RowsTable({
  rowPage,
  columns = [],
  tableName,
  approxRowCount,
  page,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  onRefresh
}: RowsTableProps): ReactNode {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [inspected, setInspected] = useState<{
    column: string;
    value: InspectableValue;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const columnByName = useMemo(
    () => new Map(columns.map((column) => [column.name, column])),
    [columns]
  );

  const indexed = useMemo(() => rowPage.rows.map((row, index) => ({ row, index })), [rowPage.rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return indexed;
    return indexed.filter(({ row }) =>
      Object.values(row).some((value) => formatCell(value).toLowerCase().includes(query))
    );
  }, [indexed, search]);

  const sorted = useMemo(() => {
    if (!sortCol || !sortDir) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const left = formatCell(a.row[sortCol]);
      const right = formatCell(b.row[sortCol]);
      const cmp = left < right ? -1 : left > right ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortCol, sortDir]);

  // F051: only the visible rows (plus overscan) mount as DOM nodes, instead of every row in the
  // current page - a wide table at the SQL Editor's 1000-row cap (F050) would otherwise mount
  // thousands of cells.
  const rowVirtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 8
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const topPadding = virtualRows[0]?.start ?? 0;
  const bottomPadding =
    rowVirtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0);

  function handleSort(column: string): void {
    if (sortCol !== column) {
      setSortCol(column);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortCol(null);
      setSortDir(null);
    }
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
    const rows = sorted.filter(({ index }) => selected.has(index)).map(({ row }) => row);
    await navigator.clipboard.writeText(toCsv(rowPage.columns, rows));
  }

  function exportCsv(): void {
    downloadCsv(
      `${tableName ?? "rows"}.csv`,
      toCsv(
        rowPage.columns,
        sorted.map(({ row }) => row)
      )
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 rounded-[3px] bg-accent px-2 py-1 font-mono text-[11px] text-muted-foreground">
          <Search className="h-2.5 w-2.5" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter this page..."
            aria-label="Filter this page"
            title="Filters only the rows currently loaded on this page, not the whole table"
            className="w-28 min-w-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground sm:w-36"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Clear filter">
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

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
          <button
            type="button"
            onClick={exportCsv}
            aria-label="Export this page as CSV"
            title="Exports the rows currently loaded on this page, not the whole table"
            className="rounded-[3px] p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Download className="h-3 w-3" />
          </button>
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

      {columns.length > 0 && (
        <div className="flex shrink-0 overflow-x-auto overflow-y-hidden border-b border-border bg-card">
          <div className="w-8 shrink-0 border-r border-border" />
          <div className="w-8 shrink-0 border-r border-border" />
          {rowPage.columns.map((columnName) => {
            const meta = columnByName.get(columnName);
            return (
              <div
                key={columnName}
                className="flex min-w-[120px] shrink-0 items-center gap-1 whitespace-nowrap border-r border-border px-3 py-1 font-mono text-[9px] text-muted-foreground"
              >
                {meta && <TypeIcon dataType={meta.dataType} />}
                <span>{meta?.dataType ?? "unknown"}</span>
                {meta?.isPrimaryKey && (
                  <span className="ml-1 font-bold" style={{ color: "var(--c-amber)" }}>
                    PK
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

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
                {rowPage.columns.map((columnName) => (
                  <th
                    key={columnName}
                    onClick={() => handleSort(columnName)}
                    className="group cursor-pointer whitespace-nowrap border-b border-r border-border px-3 py-2 text-left font-medium text-muted-foreground hover:text-foreground"
                  >
                    <div className="flex items-center gap-1.5">
                      {columnName}
                      <ArrowUpDown
                        className={cn(
                          "h-2.5 w-2.5 transition-opacity",
                          sortCol === columnName
                            ? "text-primary opacity-100"
                            : "opacity-0 group-hover:opacity-40"
                        )}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topPadding > 0 && (
                <tr>
                  <td colSpan={rowPage.columns.length + 2} style={{ height: topPadding }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const item = sorted[virtualRow.index];
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
                    {rowPage.columns.map((columnName) => (
                      <td
                        key={columnName}
                        className="whitespace-nowrap border-r border-border-subtle px-3 py-1.5 text-foreground/80"
                      >
                        {row[columnName] === null || row[columnName] === undefined ? (
                          <span className="italic text-muted-foreground/30">null</span>
                        ) : (
                          <CellValue
                            value={row[columnName]}
                            onInspect={(value) => setInspected({ column: columnName, value })}
                          />
                        )}
                      </td>
                    ))}
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
          {sorted.length.toLocaleString()} of{" "}
          {approxRowCount !== undefined
            ? `~${approxRowCount.toLocaleString()}`
            : sorted.length.toLocaleString()}{" "}
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
    </div>
  );
}
