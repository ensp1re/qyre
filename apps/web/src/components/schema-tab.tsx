import { ErrorState, SchemaGrid, Spinner } from "@humbdb/ui";
import type { ReactNode } from "react";
import type { useAllTables } from "../hooks/use-all-tables.js";

export interface SchemaTabProps {
  allTables: ReturnType<typeof useAllTables>;
}

/** Schema tab content - a full-database grid of every table's metadata. */
export function SchemaTab({ allTables }: SchemaTabProps): ReactNode {
  if (allTables.isLoading) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Spinner /> Loading tables...
      </p>
    );
  }

  if (allTables.isError) {
    return (
      <ErrorState
        message={allTables.error?.message ?? "Failed to load one or more tables."}
        onRetry={() => allTables.refetch()}
      />
    );
  }

  if (allTables.tables.length === 0) {
    return <p className="text-[13px] text-muted-foreground">No tables found.</p>;
  }

  return <SchemaGrid tables={allTables.tables} />;
}
