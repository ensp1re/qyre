import type { QueryPlanResult } from "@qyre/core";
import type { ReactNode } from "react";
import { ErrorState } from "../feedback/error-state.js";
import { Spinner } from "../feedback/spinner.js";

export interface QueryPlanPanelProps {
  result?: QueryPlanResult;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  height?: number;
  embedded?: boolean;
}

export function QueryPlanPanel({
  result,
  loading,
  error,
  onRetry,
  height,
  embedded
}: QueryPlanPanelProps): ReactNode {
  const style = height === undefined ? undefined : { height };
  const className =
    height === undefined
      ? `max-h-64 shrink-0 overflow-auto ${embedded ? "" : "border-t border-border"}`
      : `shrink-0 overflow-auto ${embedded ? "" : "border-t border-border"}`;

  if (loading) {
    return (
      <div data-testid="query-plan" style={style} className={className}>
        <div className="flex min-h-40 items-center justify-center gap-2 font-mono text-[11px] text-muted-foreground">
          <Spinner /> Generating query plan...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="query-plan" style={style} className={className}>
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (!result) return null;

  return (
    <div data-testid="query-plan" style={style} className={className}>
      <div className="sticky top-0 flex items-center gap-2 border-b border-border bg-card px-3 py-1.5">
        <span className="text-[11px] font-medium text-foreground">Query plan</span>
        <span className="rounded-[2px] border border-border px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
          {result.classification}
        </span>
        {result.analyzed && (
          <span className="rounded-[2px] border border-[color:var(--c-amber)]/40 px-1 py-0.5 font-mono text-[10px] text-[color:var(--c-amber)]">
            analyzed
          </span>
        )}
      </div>
      {result.lines.length === 0 ? (
        <p className="p-3 font-mono text-[11px] text-muted-foreground">
          The database returned no plan details.
        </p>
      ) : (
        <pre className="m-0 whitespace-pre-wrap p-3 font-mono text-[11px] leading-5 text-foreground/80">
          {result.lines.join("\n")}
        </pre>
      )}
    </div>
  );
}
