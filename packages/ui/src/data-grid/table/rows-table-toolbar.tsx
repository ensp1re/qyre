import type {
  ColumnMetadata,
  DatabaseEngine,
  JsonExportMode,
  RowExportFormat,
  RowFilter
} from "@qyre/core";
import { Copy, Download, FileUp, Lock, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { FilterBar } from "./filter-bar.js";
import { exportFormatLabel } from "./row-export.js";

interface RowsTableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  columns: ColumnMetadata[];
  engine: DatabaseEngine | undefined;
  filters: RowFilter[] | undefined;
  onFiltersChange: ((filters: RowFilter[] | undefined) => void) | undefined;
  editable: boolean | undefined;
  editingDisabledReason: string | undefined;
  canAddRow: boolean;
  onAddRow: (() => void) | undefined;
  canInsertDocument: boolean | undefined;
  onInsertDocument: (() => void) | undefined;
  canImportCsv: boolean | undefined;
  onImportCsv: (() => void) | undefined;
  selected: Set<number>;
  setSelected: Dispatch<SetStateAction<Set<number>>>;
  onCopySelected: () => Promise<void>;
  canStageDelete: boolean;
  onStageSelectedForDelete: () => void;
  canExportSelectedRows: boolean;
  exportFormats: readonly RowExportFormat[];
  activeExportFormat: RowExportFormat | undefined;
  onExportFormatChange: (format: RowExportFormat) => void;
  jsonExportMode: JsonExportMode;
  onExportAllRows: ((format: RowExportFormat) => void) | undefined;
  onExportRows: () => void;
  onRefresh: (() => void) | undefined;
}

export function RowsTableToolbar({
  search,
  onSearchChange,
  columns,
  engine,
  filters,
  onFiltersChange,
  editable,
  editingDisabledReason,
  canAddRow,
  onAddRow,
  canInsertDocument,
  onInsertDocument,
  canImportCsv,
  onImportCsv,
  selected,
  setSelected,
  onCopySelected,
  canStageDelete,
  onStageSelectedForDelete,
  canExportSelectedRows,
  exportFormats,
  activeExportFormat,
  onExportFormatChange,
  jsonExportMode,
  onExportAllRows,
  onExportRows,
  onRefresh
}: RowsTableToolbarProps): ReactNode {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <div className="flex items-center gap-1.5 rounded-[3px] bg-accent px-2 py-1 font-mono text-[11px] text-muted-foreground">
        <Search className="h-2.5 w-2.5" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search this page..."
          aria-label="Search this page"
          title="Searches only the rows currently loaded on this page - use Filter to query the whole table"
          className="w-28 min-w-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground sm:w-36"
        />
        {search && (
          <button type="button" onClick={() => onSearchChange("")} aria-label="Clear search">
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
            onClick={onAddRow}
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
        {canImportCsv && onImportCsv && (
          <button
            type="button"
            onClick={onImportCsv}
            className="flex items-center gap-1 rounded-[3px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <FileUp className="h-3 w-3" /> Import CSV
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
              onClick={() => void onCopySelected()}
              className="flex items-center gap-1 rounded-[3px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Copy className="h-3 w-3" /> Copy as CSV
            </button>
            {canStageDelete && (
              <button
                type="button"
                onClick={onStageSelectedForDelete}
                className="flex items-center gap-1 rounded-[3px] px-2 py-1 text-[11px] hover:bg-accent"
                style={{ color: "var(--c-red)" }}
              >
                <Trash2 className="h-3 w-3" /> Delete {selected.size} selected
              </button>
            )}
          </>
        )}
        {!canExportSelectedRows && onExportAllRows && activeExportFormat && (
          <div className="flex items-center gap-1">
            {exportFormats.length > 1 && (
              <select
                value={activeExportFormat}
                onChange={(event) => onExportFormatChange(event.target.value as RowExportFormat)}
                aria-label="Export format"
                className="rounded-[3px] border border-border bg-card px-1.5 py-1 font-mono text-[10px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus:border-ring"
              >
                {exportFormats.map((format) => (
                  <option key={format} value={format}>
                    {exportFormatLabel(format, jsonExportMode)}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={onExportRows}
              aria-label={`Export all rows as ${exportFormatLabel(activeExportFormat, jsonExportMode)}`}
              title="Exports every row matching the current sort and filters"
              className="rounded-[3px] p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Download className="h-3 w-3" />
            </button>
          </div>
        )}
        {canExportSelectedRows && (
          <button
            type="button"
            onClick={onExportRows}
            aria-label="Export selected rows as CSV"
            title="Exports the selected rows on this page"
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
  );
}
