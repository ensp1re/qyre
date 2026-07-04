import type { RowPage } from "@humbdb/core";
import { autocompletion } from "@codemirror/autocomplete";
import { StandardSQL, sql as sqlLanguage } from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import { History, Play } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createSqlCompletionSource } from "../sql-completion.js";
import { CellValueDrawer } from "./cell-value-drawer.js";
import type { InspectableValue } from "./cell-value.js";
import { CellValue } from "./cell-value.js";
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
  /**
   * Table names for schema-aware autocomplete after FROM/JOIN (F013), sourced by the caller from
   * already-fetched schema data - this package must not fetch data itself (FRONTEND.md).
   */
  tableNames?: readonly string[];
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

/** A read-only SQL query box: SELECT-style statements only, enforced server-side. */
export function QueryRunner({
  sql,
  onSqlChange,
  onRun,
  isRunning,
  result,
  error,
  onOpenHistory,
  tableNames = []
}: QueryRunnerProps): ReactNode {
  const canRun = !isRunning && sql.trim().length > 0;
  const lineCount = sql.split("\n").length;
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? "");
  const shortcutLabel = isMac ? "⌘ Enter" : "Ctrl Enter";
  const [inspected, setInspected] = useState<{
    column: string;
    value: InspectableValue;
  } | null>(null);

  const editorParentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onSqlChangeRef = useRef(onSqlChange);
  const onRunRef = useRef(onRun);
  const canRunRef = useRef(canRun);
  const tableNamesRef = useRef(tableNames);
  onSqlChangeRef.current = onSqlChange;
  onRunRef.current = onRun;
  canRunRef.current = canRun;
  tableNamesRef.current = tableNames;

  useEffect(() => {
    if (!editorParentRef.current) return;

    const view = new EditorView({
      doc: sql,
      parent: editorParentRef.current,
      extensions: [
        basicSetup,
        sqlLanguage({ dialect: StandardSQL }),
        syntaxHighlighting(sqlHighlightStyle),
        autocompletion({ override: [createSqlCompletionSource(() => tableNamesRef.current)] }),
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
    <div
      data-testid="query-runner"
      className="flex h-full flex-col overflow-hidden rounded-[3px] border border-border"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun}
          title={`Run query (${shortcutLabel})`}
          className="flex items-center gap-1.5 rounded-[3px] bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isRunning ? (
            <Spinner className="h-2.5 w-2.5 text-primary-foreground" />
          ) : (
            <Play className="h-2.5 w-2.5" />
          )}
          {isRunning ? "Running..." : "Run"}
        </button>
        <span className="hidden rounded-[2px] border border-border px-1 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
          {shortcutLabel}
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
        <div ref={editorParentRef} data-testid="query-editor" className="min-w-0 flex-1" />
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
                        <CellValue
                          value={row[column]}
                          onInspect={(value) => setInspected({ column, value })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
