import type { DatabaseEngine, QueryExecutionResult, QueryPlanResult, RowPage } from "@qyre/core";
import { autocompletion } from "@codemirror/autocomplete";
import { StandardSQL, sql as sqlLanguage } from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useVirtualizer } from "@tanstack/react-virtual";
import { basicSetup } from "codemirror";
import { History, ListTree, Play, X } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../cn.js";
import { CellValueDrawer } from "../data-grid/cells/cell-value-drawer.js";
import type { InspectableValue } from "../data-grid/cells/cell-value.js";
import { CellValue } from "../data-grid/cells/cell-value.js";
import { ErrorState } from "../feedback/error-state.js";
import { Spinner } from "../feedback/spinner.js";
import { Button } from "../primitives/controls/button.js";
import {
  CommandGroup,
  CommandSeparator,
  CommandToolbar
} from "../primitives/controls/command-toolbar.js";
import { IconButton } from "../primitives/controls/icon-button.js";
import { ResizeHandle } from "../primitives/resize-handle.js";
import { QueryPlanPanel } from "./query-plan-panel.js";
import type { CompletionTable } from "./sql-completion.js";
import { createSqlCompletionSource } from "./sql-completion.js";

/** Exported so the caller owning persistence (F071's `usePanelSize`) can seed/clamp against the
 * same numbers this component uses, instead of duplicating them. */
export const RESULTS_DEFAULT_HEIGHT = 256;
const RESULTS_MIN_HEIGHT = 120;
const RESULTS_MAX_HEIGHT = 600;
type OutputMode = "results" | "plan" | "messages";

function moveOutputTabFocus(event: KeyboardEvent<HTMLDivElement>): void {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  if (tabs.length === 0) return;
  const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
  let next = current;
  if (event.key === "Home") next = 0;
  else if (event.key === "End") next = tabs.length - 1;
  else if (event.key === "ArrowRight") next = (Math.max(current, -1) + 1) % tabs.length;
  else next = (current <= 0 ? tabs.length : current) - 1;
  event.preventDefault();
  tabs[next]?.focus();
  tabs[next]?.click();
}

export interface QueryRunnerProps {
  sql: string;
  onSqlChange: (sql: string) => void;
  onRun: () => void;
  /** Cancels the currently running query (F126) - the Cancel button is only rendered while
   * `isRunning`. */
  onCancel: () => void;
  isRunning: boolean;
  /** A read query's `RowPage`, or a write-capable session's `QueryExecutionResult` (F108) - the
   * latter is distinguished by its `rowsAffected` field and rendered as an affected-row count
   * instead of a row table when it has no rows of its own (an INSERT/UPDATE/DELETE/DDL statement,
   * as opposed to a writable CTE that also returns rows via RETURNING). */
  result?: RowPage | QueryExecutionResult;
  error?: string;
  onExplain: () => void;
  isExplaining: boolean;
  explainResult?: QueryPlanResult;
  explainError?: string;
  /** Opens the query history drawer (F012) - rendered by the caller, not this component. */
  onOpenHistory: () => void;
  /**
   * Tables (with columns) for schema-aware autocomplete after FROM/JOIN and column completion
   * after `alias.`/`table.` (F013, F127), sourced by the caller from already-fetched schema data -
   * this package must not fetch data itself (FRONTEND.md).
   */
  tables?: readonly CompletionTable[];
  /** The connected engine, used to quote a suggested identifier in the right dialect (F127) when
   * it needs it. Defaults to `"postgres"`'s quoting rules if omitted. */
  engine?: DatabaseEngine;
  /** Results panel height in px (F071). Omitted keeps the previous fixed 256px (`max-h-64`) - both
   * this and `onResultsHeightChange` must be supplied together for the resize handle to appear. */
  resultsHeight?: number;
  onResultsHeightChange?: (height: number) => void;
}

const sqlHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--c-purple)" },
  { tag: tags.string, color: "var(--c-blue)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--c-green)" },
  { tag: tags.comment, color: "rgb(var(--muted-foreground))", fontStyle: "italic" },
  { tag: [tags.typeName, tags.propertyName], color: "var(--c-amber)" },
  { tag: tags.operator, color: "rgb(var(--foreground) / 0.8)" }
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "12px",
    backgroundColor: "rgb(var(--background))",
    color: "rgb(var(--foreground))"
  },
  "&.cm-focused": { outline: "none" },
  ".cm-content": {
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    caretColor: "var(--c-blue)",
    padding: "12px 0"
  },
  ".cm-line": { padding: "0 12px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--c-blue)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "rgb(var(--primary) / 0.25)"
  },
  ".cm-gutters": {
    backgroundColor: "rgb(var(--background))",
    color: "rgb(var(--muted-foreground) / 0.5)",
    border: "none",
    borderRight: "1px solid var(--border)"
  },
  ".cm-activeLine": { backgroundColor: "rgb(var(--accent) / 0.4)" },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "rgb(var(--muted-foreground))"
  },
  ".cm-tooltip": {
    backgroundColor: "rgb(var(--popover))",
    border: "1px solid var(--border)",
    borderRadius: "3px"
  },
  ".cm-tooltip.cm-tooltip-autocomplete ul": {
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    fontSize: "11px"
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "rgb(var(--accent))",
    color: "rgb(var(--accent-foreground))"
  }
});

/** A capability-gated SQL editor and docked output workspace; execution policy is server-enforced. */
export function QueryRunner({
  sql,
  onSqlChange,
  onRun,
  onCancel,
  isRunning,
  result,
  error,
  onExplain,
  isExplaining,
  explainResult,
  explainError,
  onOpenHistory,
  tables = [],
  engine = "postgres",
  resultsHeight,
  onResultsHeightChange
}: QueryRunnerProps): ReactNode {
  const resizableResults = resultsHeight !== undefined && onResultsHeightChange !== undefined;
  const isBusy = isRunning || isExplaining;
  const canRun = !isBusy && sql.trim().length > 0;
  const canExplain = !isBusy && sql.trim().length > 0;
  const hasResults = result !== undefined && !error;
  const hasPlan = isExplaining || explainResult !== undefined || explainError !== undefined;
  const hasMessages = error !== undefined;
  const lineCount = sql.split("\n").length;
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? "");
  const shortcutLabel = isMac ? "⌘ Enter" : "Ctrl Enter";
  const [outputMode, setOutputMode] = useState<OutputMode>(() =>
    hasMessages ? "messages" : hasPlan ? "plan" : "results"
  );
  const [inspected, setInspected] = useState<{
    column: string;
    value: InspectableValue;
  } | null>(null);

  const editorParentRef = useRef<HTMLDivElement>(null);
  const resultScrollRef = useRef<HTMLDivElement>(null);
  const resultRowCount = result?.rows.length ?? 0;
  // F051: only the visible rows (plus overscan) mount as DOM nodes - a wide result set at the
  // 1000-row query cap (F050) would otherwise mount thousands of cells.
  const resultRowVirtualizer = useVirtualizer({
    count: resultRowCount,
    getScrollElement: () => resultScrollRef.current,
    estimateSize: () => 30,
    overscan: 8
  });
  const resultVirtualRows = resultRowVirtualizer.getVirtualItems();
  const resultTopPadding = resultVirtualRows[0]?.start ?? 0;
  const resultBottomPadding =
    resultRowVirtualizer.getTotalSize() -
    (resultVirtualRows[resultVirtualRows.length - 1]?.end ?? 0);
  const viewRef = useRef<EditorView | null>(null);
  const onSqlChangeRef = useRef(onSqlChange);
  const onRunRef = useRef(onRun);
  const canRunRef = useRef(canRun);
  const tablesRef = useRef(tables);
  const engineRef = useRef(engine);
  onSqlChangeRef.current = onSqlChange;
  onRunRef.current = onRun;
  canRunRef.current = canRun;
  tablesRef.current = tables;
  engineRef.current = engine;

  useEffect(() => {
    if (hasMessages) setOutputMode("messages");
    else if (hasPlan) setOutputMode("plan");
    else if (hasResults) setOutputMode("results");
  }, [hasMessages, hasPlan, hasResults, result, explainResult]);

  const showResults = hasResults && outputMode === "results";
  const showPlan = hasPlan && outputMode === "plan";
  const showMessages = hasMessages && outputMode === "messages";
  const hasOutput = hasResults || hasPlan || hasMessages;

  useEffect(() => {
    if (!editorParentRef.current) return;

    const view = new EditorView({
      doc: sql,
      parent: editorParentRef.current,
      extensions: [
        basicSetup,
        sqlLanguage({ dialect: StandardSQL }),
        syntaxHighlighting(sqlHighlightStyle),
        autocompletion({
          override: [
            createSqlCompletionSource(
              () => tablesRef.current,
              () => engineRef.current
            )
          ]
        }),
        // Prec.highest so this beats basicSetup's own defaultKeymap binding for the same chord
        // (Mod-Enter is bound there to insertBlankLine) - otherwise that fires first and this
        // handler never runs.
        Prec.highest(
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                if (canRunRef.current) onRunRef.current();
                return true;
              }
            }
          ])
        ),
        EditorView.lineWrapping,
        editorTheme,
        // CodeMirror's content div is role="textbox" with no accessible name by default - an axe
        // scan (F056) flagged it as an unlabeled input.
        EditorView.contentAttributes.of({ "aria-label": "SQL query editor" }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onSqlChangeRef.current(update.state.doc.toString());
        })
      ]
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mounted once; the `sql` prop's own changes are synced by the effect below instead of
    // recreating the whole editor (which would lose undo history/selection on every keystroke).
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== sql) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: sql } });
    }
  }, [sql]);

  return (
    <div data-testid="query-runner" className="flex h-full flex-col overflow-hidden">
      <CommandToolbar label="SQL editor commands">
        <CommandGroup label="Execute query">
          <Button
            data-command-item
            size="sm"
            variant="primary"
            onClick={onRun}
            disabled={!canRun}
            title={`Run query (${shortcutLabel})`}
            className="h-6 min-h-6 px-2 text-[11px]"
          >
            {isRunning ? (
              <Spinner className="h-2.5 w-2.5 text-primary-foreground" />
            ) : (
              <Play className="h-2.5 w-2.5" />
            )}
            {isRunning ? "Running..." : "Run"}
          </Button>
          <Button
            data-command-item
            size="sm"
            variant="ghost"
            onClick={onExplain}
            disabled={!canExplain}
            title="Explain query"
            className="h-6 min-h-6 px-2 text-[11px]"
          >
            {isExplaining ? (
              <Spinner className="h-2.5 w-2.5" />
            ) : (
              <ListTree className="h-2.5 w-2.5" />
            )}
            {isExplaining ? "Explaining..." : "Explain"}
          </Button>
          {isRunning && (
            <Button
              data-command-item
              size="sm"
              variant="ghost"
              onClick={onCancel}
              title="Cancel query"
              className="h-6 min-h-6 px-2 text-[11px] text-destructive hover:text-destructive"
            >
              <X className="h-2.5 w-2.5" />
              Cancel
            </Button>
          )}
        </CommandGroup>
        <CommandSeparator />
        <span className="hidden rounded-[2px] border border-border px-1 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
          {shortcutLabel}
        </span>
        <CommandGroup label="Editor utilities" className="ml-auto">
          <IconButton
            data-command-item
            variant="ghost"
            label="Query history"
            onClick={onOpenHistory}
            icon={<History className="h-3 w-3" />}
            className="h-6 w-6"
          />
          <span className="font-mono text-[10px] text-muted-foreground">
            {lineCount} line{lineCount === 1 ? "" : "s"}
          </span>
        </CommandGroup>
      </CommandToolbar>

      <div className="flex min-h-[8rem] flex-1 overflow-hidden">
        <div ref={editorParentRef} data-testid="query-editor" className="min-w-0 flex-1" />
      </div>

      {hasOutput && !showMessages && resizableResults && (
        <ResizeHandle
          orientation="horizontal"
          value={resultsHeight}
          min={RESULTS_MIN_HEIGHT}
          max={RESULTS_MAX_HEIGHT}
          onChange={onResultsHeightChange}
          invert
          aria-label={showPlan ? "Resize query plan panel" : "Resize query results panel"}
        />
      )}

      {hasOutput && (
        <div
          role="tablist"
          aria-label="Query output"
          onKeyDown={moveOutputTabFocus}
          className="flex h-7 shrink-0 items-stretch border-t border-b border-border bg-card"
        >
          {hasResults && (
            <OutputTab
              active={outputMode === "results"}
              onClick={() => setOutputMode("results")}
              label={`Results${result ? ` ${result.rows.length}` : ""}`}
            />
          )}
          {hasPlan && (
            <OutputTab
              active={outputMode === "plan"}
              onClick={() => setOutputMode("plan")}
              label="Plan"
            />
          )}
          {hasMessages && (
            <OutputTab
              active={outputMode === "messages"}
              onClick={() => setOutputMode("messages")}
              label="Messages"
              destructive
            />
          )}
        </div>
      )}

      {showMessages && error && (
        <div data-testid="query-error" className="h-40 shrink-0">
          <ErrorState message={error} onRetry={onRun} />
        </div>
      )}

      {showResults && result && (
        <div
          data-testid="query-result"
          ref={resultScrollRef}
          style={resizableResults ? { height: resultsHeight } : undefined}
          className={
            resizableResults ? "shrink-0 overflow-auto" : "max-h-64 shrink-0 overflow-auto"
          }
        >
          {result.rows.length === 0 ? (
            <p className="p-3 font-mono text-[11px] text-muted-foreground">
              {"rowsAffected" in result
                ? `${result.rowsAffected} row${result.rowsAffected === 1 ? "" : "s"} affected.`
                : "Query returned no rows."}
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
                {resultTopPadding > 0 && (
                  <tr>
                    <td colSpan={result.columns.length} style={{ height: resultTopPadding }} />
                  </tr>
                )}
                {resultVirtualRows.map((virtualRow) => {
                  const row = result.rows[virtualRow.index];
                  if (!row) return null;
                  return (
                    <tr
                      key={virtualRow.index}
                      data-index={virtualRow.index}
                      className="border-b border-border-subtle"
                    >
                      {result.columns.map((column) => (
                        <td
                          key={column}
                          className="whitespace-nowrap border-r border-border-subtle px-3 py-1.5 text-foreground/80"
                        >
                          <CellValue
                            value={row[column]}
                            onInspect={(value) => setInspected({ column, value })}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {resultBottomPadding > 0 && (
                  <tr>
                    <td colSpan={result.columns.length} style={{ height: resultBottomPadding }} />
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showPlan && (
        <QueryPlanPanel
          result={explainResult}
          loading={isExplaining}
          error={explainError}
          onRetry={onExplain}
          height={resizableResults ? resultsHeight : undefined}
          embedded
        />
      )}

      {inspected && (
        <CellValueDrawer
          column={inspected.column}
          value={inspected.value}
          onClose={() => setInspected(null)}
        />
      )}
    </div>
  );
}

function OutputTab({
  active,
  onClick,
  label,
  destructive
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  destructive?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      role="tab"
      tabIndex={active ? 0 : -1}
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative border-r border-border px-3 font-mono text-[10px] outline-none transition-colors focus-visible:bg-accent",
        active
          ? "bg-background text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        destructive && "text-destructive"
      )}
    >
      {label}
    </button>
  );
}
