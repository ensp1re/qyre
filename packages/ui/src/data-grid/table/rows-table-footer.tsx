import type { TableKind } from "@qyre/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A view has no stored rows, so introspection returns no `approxRowCount` for one and the total
 * segment simply vanishes - which reads as Qyre failing rather than as a property of the object.
 * Naming the kind restores the missing "why", and does it without counting: the only way to total
 * a view is to run its whole query, which for a joined view means paying that cost on every
 * metadata load (F156). Ordinary tables and collections stay unlabeled - the common case needs no
 * annotation.
 */
const KIND_LABEL: Partial<Record<TableKind, string>> = {
  view: "view",
  "materialized-view": "materialized view"
};

interface RowsTableFooterProps {
  visibleCount: number;
  pageRowCount: number;
  approxRowCount: number | undefined;
  matchingRowCount: number | undefined;
  hasPageSearch: boolean;
  hasServerQuery: boolean;
  tableName: string | undefined;
  tableKind: TableKind | undefined;
  page: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export function RowsTableFooter({
  visibleCount,
  pageRowCount,
  approxRowCount,
  matchingRowCount,
  hasPageSearch,
  hasServerQuery,
  tableName,
  tableKind,
  page,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext
}: RowsTableFooterProps): ReactNode {
  return (
    <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-3 py-1.5">
      <span className="font-mono text-[10px] text-muted-foreground">
        {hasPageSearch
          ? `${visibleCount.toLocaleString()} of ${pageRowCount.toLocaleString()} rows on page`
          : hasServerQuery && matchingRowCount !== undefined
            ? `${pageRowCount.toLocaleString()} of ${matchingRowCount.toLocaleString()} matching rows`
            : `${pageRowCount.toLocaleString()} rows on page`}
        {hasPageSearch && matchingRowCount !== undefined
          ? ` · ${matchingRowCount.toLocaleString()} matching total`
          : hasPageSearch && approxRowCount !== undefined
            ? ` · ~${approxRowCount.toLocaleString()} total`
            : !hasServerQuery && approxRowCount !== undefined
              ? ` · ~${approxRowCount.toLocaleString()} total`
              : ""}
        {tableKind && KIND_LABEL[tableKind] && <> · {KIND_LABEL[tableKind]}</>}
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
  );
}
