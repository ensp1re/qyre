import type { ForeignKeyReference, RowFilter, RowSort } from "@qyre/core";
import { ErrorState, RowsTable, Spinner } from "@qyre/ui";
import type { ReactNode } from "react";
import { exportRowsUrl } from "./api/rows.js";
import type { useRows } from "./use-rows.js";
import type { useTable } from "./use-table.js";

export interface TablesTabProps {
  selected: { schema: string; table: string } | undefined;
  table: ReturnType<typeof useTable>;
  rows: ReturnType<typeof useRows>;
  page: number;
  onPageChange: (updater: (current: number) => number) => void;
  onNavigateToForeignKey?: (reference: ForeignKeyReference, value: unknown) => void;
  sort: RowSort | undefined;
  onSortChange: (sort: RowSort | undefined) => void;
  filters: RowFilter[] | undefined;
  onFiltersChange: (filters: RowFilter[] | undefined) => void;
}

/** Triggers a real browser download of the streamed export - not a fetch+Blob, so the download
 * streams straight to disk instead of buffering the whole table in JS memory (F066). */
function downloadExport(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.click();
}

/** Tables tab content - the selected table's paginated row browser. */
export function TablesTab({
  selected,
  table,
  rows,
  page,
  onPageChange,
  onNavigateToForeignKey,
  sort,
  onSortChange,
  filters,
  onFiltersChange
}: TablesTabProps): ReactNode {
  if (!selected) {
    return <p className="text-[13px] text-muted-foreground">Select a table from the sidebar.</p>;
  }

  if (rows.isLoading) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Spinner /> Loading rows...
      </p>
    );
  }

  if (rows.isError) {
    return (
      <ErrorState
        message={rows.error instanceof Error ? rows.error.message : "Failed to load rows."}
        onRetry={() => rows.refetch()}
      />
    );
  }

  if (!rows.data) return null;

  return (
    <RowsTable
      rowPage={rows.data.rowPage}
      columns={table.data?.columns}
      tableName={selected.table}
      approxRowCount={table.data?.rowCount}
      page={page}
      canGoPrevious={page > 0}
      canGoNext={rows.data.hasMore}
      onPrevious={() => onPageChange((current) => Math.max(0, current - 1))}
      onNext={() => onPageChange((current) => current + 1)}
      onRefresh={() => rows.refetch()}
      onNavigateToForeignKey={onNavigateToForeignKey}
      sortColumn={sort?.column}
      sortDirection={sort?.direction}
      onSortChange={onSortChange}
      onExportAllRows={() =>
        downloadExport(exportRowsUrl(selected.schema, selected.table, sort, filters))
      }
      filters={filters}
      onFiltersChange={onFiltersChange}
    />
  );
}
