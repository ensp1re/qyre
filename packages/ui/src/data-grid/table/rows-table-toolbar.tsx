import type {
  ColumnMetadata,
  DatabaseEngine,
  JsonExportMode,
  RowExportFormat,
  RowFilter
} from "@qyre/core";
import { Copy, Download, FileUp, Lock, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Select } from "../../primitives/controls/select.js";
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
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-2 py-2 lg:gap-2 lg:px-3">
      <div className="flex items-center gap-1.5 rounded-[3px] bg-accent px-2 py-1 font-mono text-[11px] text-muted-foreground">
        <Search className="h-2.5 w-2.5" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search this page..."
          aria-label="Search this page"
          title="Searches only the rows currently loaded on this page - use Filter to query the whole table"
          className="w-24 min-w-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground sm:w-28 lg:w-36"
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

      <div className="ml-auto flex flex-wrap items-center gap-1 lg:gap-2">
        {canAddRow && (
          <button
            type="button"
            onClick={onAddRow}
            aria-label="Add row"
            title="Add row"
            className="flex items-center gap-0 rounded-[3px] p-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground lg:gap-1 lg:px-2"
          >
            <Plus className="h-3 w-3" /> <span className="hidden lg:inline">Add row</span>
          </button>
        )}
        {canInsertDocument && onInsertDocument && (
          <button
            type="button"
            onClick={onInsertDocument}
            aria-label="Insert document"
            title="Insert document"
            className="flex items-center gap-0 rounded-[3px] p-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground lg:gap-1 lg:px-2"
          >
            <Plus className="h-3 w-3" />
            <span className="hidden lg:inline">Insert document</span>
          </button>
        )}
        {canImportCsv && onImportCsv && (
          <button
            type="button"
            onClick={onImportCsv}
            aria-label="Import CSV"
            title="Import CSV"
            className="flex items-center gap-0 rounded-[3px] p-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground lg:gap-1 lg:px-2"
          >
            <FileUp className="h-3 w-3" /> <span className="hidden lg:inline">Import CSV</span>
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
              aria-label="Copy selected rows as CSV"
              title="Copy selected rows as CSV"
              className="flex items-center gap-0 rounded-[3px] p-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground lg:gap-1 lg:px-2"
            >
              <Copy className="h-3 w-3" /> <span className="hidden lg:inline">Copy as CSV</span>
            </button>
            {canStageDelete && (
              <button
                type="button"
                onClick={onStageSelectedForDelete}
                aria-label={`Delete ${selected.size} selected`}
                title="Stages the selection for deletion - still reversible until Commit"
                className="flex items-center gap-0 rounded-[3px] border-l border-border-subtle p-1 text-[11px] hover:bg-accent lg:gap-1 lg:px-2 lg:pl-2.5"
                style={{ color: "var(--c-red)" }}
              >
                <Trash2 className="h-3 w-3" />
                <span className="hidden lg:inline">Delete {selected.size} selected</span>
              </button>
            )}
          </>
        )}
        {!canExportSelectedRows && onExportAllRows && activeExportFormat && (
          <div className="flex items-center gap-1">
            {exportFormats.length > 1 && (
              <Select
                value={activeExportFormat}
                onValueChange={(value) => onExportFormatChange(value as RowExportFormat)}
                label="Export format"
                options={exportFormats.map((format) => ({
                  value: format,
                  label: exportFormatLabel(format, jsonExportMode)
                }))}
                className="min-h-6 w-16 bg-card py-0.5 lg:w-24"
              />
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
