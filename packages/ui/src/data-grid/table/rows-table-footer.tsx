import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface RowsTableFooterProps {
  visibleCount: number;
  approxRowCount: number | undefined;
  tableName: string | undefined;
  page: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export function RowsTableFooter({
  visibleCount,
  approxRowCount,
  tableName,
  page,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext
}: RowsTableFooterProps): ReactNode {
  return (
    <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-3 py-1.5">
      <span className="font-mono text-[10px] text-muted-foreground">
        {visibleCount.toLocaleString()} of{" "}
        {approxRowCount !== undefined
          ? `~${approxRowCount.toLocaleString()}`
          : visibleCount.toLocaleString()}{" "}
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
  );
}
