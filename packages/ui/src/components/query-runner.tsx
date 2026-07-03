import type { RowPage } from "@humbdb/core";
import { History, Play } from "lucide-react";
import type { KeyboardEvent, ReactNode, UIEvent } from "react";
import { useRef } from "react";
import { formatCell } from "../format-cell.js";
import { ErrorState } from "./error-state.js";
import { Spinner } from "./spinner.js";

export interface QueryRunnerProps {
  sql: string;
  onSqlChange: (sql: string) => void;
  onRun: () => void;
  isRunning: boolean;
  result?: RowPage;
  error?: string;
  /** Opens the query history drawer (F012) - rendered by the caller, not this component. */
  onOpenHistory: () => void;
}

/** A read-only SQL query box: SELECT-style statements only, enforced server-side. */
export function QueryRunner({
  sql,
  onSqlChange,
  onRun,
  isRunning,
  result,
  error,
  onOpenHistory
}: QueryRunnerProps): ReactNode {
  const canRun = !isRunning && sql.trim().length > 0;
  const lineCount = sql.split("\n").length;
  const gutterRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (canRun) onRun();
    }
  }

  function handleScroll(event: UIEvent<HTMLTextAreaElement>): void {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  return (
    <div
      data-testid="query-runner"
      className="flex h-full flex-col overflow-hidden rounded-[3px] border border-border"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun}
          className="flex items-center gap-1.5 rounded-[3px] bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isRunning ? (
            <Spinner className="h-2.5 w-2.5 text-primary-foreground" />
          ) : (
            <Play className="h-2.5 w-2.5" />
          )}
          {isRunning ? "Running..." : "Run"}
        </button>
        <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
          ⌘ Enter
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label="Query history"
            onClick={onOpenHistory}
            className="rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <History className="h-3 w-3" />
          </button>
          <span className="font-mono text-[10px] text-muted-foreground">
            {lineCount} line{lineCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="flex min-h-[8rem] flex-1 overflow-hidden">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="shrink-0 select-none overflow-hidden border-r border-border bg-background pr-3 pt-3 text-right font-mono text-[11px] text-muted-foreground/30"
          style={{ minWidth: "44px" }}
        >
          {Array.from({ length: lineCount }, (_, index) => (
            <div key={index} style={{ lineHeight: "20px" }}>
              {index + 1}
            </div>
          ))}
        </div>
        <textarea
          value={sql}
          onChange={(event) => onSqlChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          placeholder="SELECT * FROM my_table LIMIT 10"
          spellCheck={false}
          className="flex-1 resize-none overflow-auto bg-background p-3 font-mono text-[12px] leading-5 text-foreground outline-none"
          style={{ caretColor: "var(--c-blue)" }}
        />
      </div>

      {error && (
        <div data-testid="query-error" className="h-40 shrink-0 border-t border-border">
          <ErrorState message={error} onRetry={onRun} />
        </div>
      )}

      {result && !error && (
        <div
          data-testid="query-result"
          className="max-h-64 shrink-0 overflow-auto border-t border-border"
        >
          {result.rows.length === 0 ? (
            <p className="p-3 font-mono text-[11px] text-muted-foreground">
              Query returned no rows.
            </p>
          ) : (
            <table className="w-full border-collapse font-mono text-[11px]">
              <thead className="sticky top-0 bg-card">
                <tr>
                  {result.columns.map((column) => (
                    <th
                      key={column}
                      className="whitespace-nowrap border-b border-r border-border px-3 py-1.5 text-left font-medium text-muted-foreground"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-border-subtle">
                    {result.columns.map((column) => (
                      <td
                        key={column}
                        className="whitespace-nowrap border-r border-border-subtle px-3 py-1.5 text-foreground/80"
                      >
                        {formatCell(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
