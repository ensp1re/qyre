import type {
  ColumnMetadata,
  DatabaseEngine,
  JsonExportMode,
  RowExportFormat,
  RowFilter
} from "@qyre/core";
import {
  Copy,
  Download,
  FileUp,
  Lock,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X
} from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Button } from "../../primitives/controls/button.js";
import {
  CommandGroup,
  CommandSeparator,
  CommandToolbar
} from "../../primitives/controls/command-toolbar.js";
import { IconButton } from "../../primitives/controls/icon-button.js";
import { Select } from "../../primitives/controls/select.js";
import { Spinner } from "../../feedback/spinner.js";
import { FilterBar } from "./filter-bar.js";
import { exportFormatLabel } from "./row-export.js";

interface RowsTableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchLoading: boolean;
  onSearchApply: () => void;
  onSearchClear: () => void;
  columns: ColumnMetadata[];
  engine: DatabaseEngine | undefined;
  filters: RowFilter[] | undefined;
  onFiltersChange: ((filters: RowFilter[] | undefined) => void) | undefined;
  editable: boolean | undefined;
  editingDisabledReason: string | undefined;
  canAddRow: boolean;
  onAddRow: (() => void) | undefined;
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
  searchLoading,
  onSearchApply,
  onSearchClear,
  columns,
  engine,
  filters,
  onFiltersChange,
  editable,
  editingDisabledReason,
  canAddRow,
  onAddRow,
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
  const commandIcon = "h-3 w-3";
  return (
    <CommandToolbar label="Table commands" className="px-3">
      <CommandGroup label="Find rows" className="min-w-0 gap-2">
        <div
          data-focus-surface
          className="flex h-6 min-w-24 items-center gap-1.5 rounded-[3px] bg-accent/70 px-2 font-mono text-[11px] text-muted-foreground transition-colors focus-within:bg-sidebar-accent focus-within:shadow-[inset_2px_0_0_rgb(var(--primary))] sm:w-36"
          aria-busy={searchLoading || undefined}
        >
          {searchLoading ? (
            <Spinner className="h-2.5 w-2.5 shrink-0 text-primary" />
          ) : (
            <Search className="h-2.5 w-2.5 shrink-0" />
          )}
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearchApply();
            }}
            placeholder="Search this page..."
            aria-label="Search rows"
            title="Typing searches this page; press Enter to search the whole table"
            className="w-full min-w-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
          {searchLoading && (
            <span role="status" aria-live="polite" className="sr-only">
              Searching all rows
            </span>
          )}
          {search && (
            <button
              type="button"
              data-command-item
              onClick={onSearchClear}
              aria-label="Clear search"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] outline-none transition-colors hover:bg-accent focus-visible:ring-1 focus-visible:ring-primary"
            >
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
      </CommandGroup>

      {!editable && editingDisabledReason && (
        <span
          title={editingDisabledReason}
          className="flex items-center gap-1 rounded-[3px] bg-accent/60 px-2 py-1 font-mono text-[10px] text-muted-foreground"
        >
          <Lock className="h-2.5 w-2.5" /> Read-only
        </span>
      )}

      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1">
        <CommandSeparator />
        <CommandGroup label={selected.size > 0 ? "Selected rows" : "Row actions"}>
          {canAddRow && (
            <Button
              data-command-item
              variant="ghost"
              size="sm"
              onClick={onAddRow}
              aria-label="Add row"
              title="Add row"
              className="h-6 min-h-6 gap-1 px-1.5 text-[11px]"
            >
              <Plus className={commandIcon} /> <span className="hidden xl:inline">Add row</span>
            </Button>
          )}
          {selected.size > 0 && (
            <>
              <span className="font-mono text-[10px]" style={{ color: "var(--c-blue)" }}>
                {selected.size} selected
              </span>
              <IconButton
                data-command-item
                variant="ghost"
                label="Clear selected rows"
                onClick={() => setSelected(new Set())}
                icon={<X className={commandIcon} />}
                className="h-6 w-6"
              />
              <Button
                data-command-item
                variant="ghost"
                size="sm"
                onClick={() => void onCopySelected()}
                aria-label="Copy selected rows as CSV"
                title="Copy selected rows as CSV"
                className="h-6 min-h-6 gap-1 px-1.5 text-[11px]"
              >
                <Copy className={commandIcon} /> <span className="hidden xl:inline">Copy CSV</span>
              </Button>
              {canStageDelete && (
                <Button
                  data-command-item
                  variant="ghost"
                  size="sm"
                  onClick={onStageSelectedForDelete}
                  aria-label={`Delete ${selected.size} selected`}
                  title="Stages the selection for deletion - still reversible until Commit"
                  className="h-6 min-h-6 gap-1 px-1.5 text-[11px] text-destructive hover:text-destructive"
                >
                  <Trash2 className={commandIcon} />
                  <span className="hidden xl:inline">Delete</span>
                </Button>
              )}
            </>
          )}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup label="Transfer and refresh">
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
              <IconButton
                data-command-item
                variant="ghost"
                label={`Export all rows as ${exportFormatLabel(activeExportFormat, jsonExportMode)}`}
                onClick={onExportRows}
                title="Exports every row matching the current sort and filters"
                icon={<Download className={commandIcon} />}
                className="h-6 w-6"
              />
            </div>
          )}
          {canExportSelectedRows && (
            <IconButton
              data-command-item
              variant="ghost"
              label="Export selected rows as CSV"
              onClick={onExportRows}
              title="Exports the selected rows on this page"
              icon={<Download className={commandIcon} />}
              className="h-6 w-6"
            />
          )}
          {onRefresh && (
            <IconButton
              data-command-item
              variant="ghost"
              label="Refresh rows"
              onClick={onRefresh}
              icon={<RefreshCw className={commandIcon} />}
              className="h-6 w-6"
            />
          )}
          {canImportCsv && onImportCsv && (
            <details className="relative">
              <summary
                data-command-item
                aria-label="More table actions"
                title="More table actions"
                className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-[3px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary [&::-webkit-details-marker]:hidden"
              >
                <MoreHorizontal className={commandIcon} />
              </summary>
              <div className="absolute right-0 top-full z-50 mt-1 min-w-36 rounded-[3px] border border-border bg-popover p-1 shadow-lg">
                <button
                  type="button"
                  onClick={onImportCsv}
                  className="flex w-full items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-[11px] text-foreground hover:bg-accent"
                >
                  <FileUp className={commandIcon} /> Import CSV
                </button>
              </div>
            </details>
          )}
        </CommandGroup>
      </div>
    </CommandToolbar>
  );
}
