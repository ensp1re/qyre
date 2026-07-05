import type { ForeignKeyReference } from "@humbdb/core";
import { ErrorState, RowsTable, Spinner } from "@humbdb/ui";
import type { ReactNode } from "react";
import type { useRows } from "../hooks/use-rows.js";
import type { useTable } from "../hooks/use-table.js";

export interface TablesTabProps {
  selected: { schema: string; table: string } | undefined;
  table: ReturnType<typeof useTable>;
  rows: ReturnType<typeof useRows>;
  page: number;
  onPageChange: (updater: (current: number) => number) => void;
  onNavigateToForeignKey?: (reference: ForeignKeyReference) => void;
}

/** Tables tab content - the selected table's paginated row browser. */
export function TablesTab({
  selected,
  table,
  rows,
  page,
  onPageChange,
  onNavigateToForeignKey
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
    />
  );
}
