import type { RowPage } from "@humb/core";
import { Play } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { formatCell } from "../format-cell.js";

export interface QueryRunnerProps {
  sql: string;
  onSqlChange: (sql: string) => void;
  onRun: () => void;
  isRunning: boolean;
  result?: RowPage;
  error?: string;
}

/** A read-only SQL query box: SELECT-style statements only, enforced server-side. */
export function QueryRunner({
  sql,
  onSqlChange,
  onRun,
  isRunning,
  result,
  error
}: QueryRunnerProps): ReactNode {
  const canRun = !isRunning && sql.trim().length > 0;
  const lineCount = sql.split("\n").length;

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (canRun) onRun();
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
          <Play className="h-2.5 w-2.5" />
          {isRunning ? "Running..." : "Run"}
        </button>
        <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
          ⌘ Enter
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {lineCount} line{lineCount === 1 ? "" : "s"}
        </span>
      </div>

      <textarea
        value={sql}
        onChange={(event) => onSqlChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="SELECT * FROM my_table LIMIT 10"
        spellCheck={false}
        className="min-h-[8rem] flex-1 resize-none bg-background p-3 font-mono text-[12px] leading-5 text-foreground outline-none"
        style={{ caretColor: "var(--c-blue)" }}
      />

      {error && (
        <p
          data-testid="query-error"
          className="border-t border-border px-3 py-2 font-mono text-[11px]"
          style={{ color: "var(--c-red)" }}
        >
          {error}
        </p>
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
