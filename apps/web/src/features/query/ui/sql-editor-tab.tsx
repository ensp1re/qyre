import type { ConnectionCapabilities, DatabaseEngine } from "@qyre/core";
import type { CompletionTable } from "@qyre/ui";
import type { DestructiveQueryConfirmation } from "@qyre/ui";
import {
  ConfirmDestructiveStatementDialog,
  QueryRunner,
  READ_ONLY_REASON_LABEL,
  toCsv,
  type QueryResultExportFormat
} from "@qyre/ui";
import type { ReactNode } from "react";
import { useEffect } from "react";
import {
  DestructiveConfirmationRequiredError,
  QueryCancelledError,
  ReadOnlySessionRejectionError
} from "../api/query.js";
import type { useRunQuery } from "../model/use-run-query.js";
import { useExplainQuery } from "../model/use-explain-query.js";

function downloadQueryResults(
  format: QueryResultExportFormat,
  columns: string[],
  rows: Array<Record<string, unknown>>
): void {
  const contents = format === "csv" ? toCsv(columns, rows) : JSON.stringify(rows, null, 2);
  const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `qyre-query-results.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}

export interface SqlEditorTabProps {
  sqlDisabled: boolean;
  sql: string;
  onSqlChange: (sql: string) => void;
  onRun: () => void;
  onCancel: () => void;
  runQuery: ReturnType<typeof useRunQuery>;
  capabilities?: ConnectionCapabilities;
  onOpenHistory: () => void;
  tables: CompletionTable[];
  engine?: DatabaseEngine;
  resultsHeight: number;
  onResultsHeightChange: (height: number) => void;
  pendingConfirmation?: DestructiveQueryConfirmation;
  onConfirmDestructive: () => void;
  onCancelDestructive: () => void;
}

export function SqlEditorTab({
  sqlDisabled,
  sql,
  onSqlChange,
  onRun,
  onCancel,
  runQuery,
  capabilities,
  onOpenHistory,
  tables,
  engine,
  resultsHeight,
  onResultsHeightChange,
  pendingConfirmation,
  onConfirmDestructive,
  onCancelDestructive
}: SqlEditorTabProps): ReactNode {
  const explainQuery = useExplainQuery();
  const resetExplainQuery = explainQuery.reset;

  useEffect(() => {
    resetExplainQuery();
  }, [engine, resetExplainQuery, sql]);

  if (sqlDisabled) {
    return (
      <p className="p-4 text-[13px] text-muted-foreground">
        The SQL Editor is not available for MongoDB connections - browse collections directly from
        the Tables tab.
      </p>
    );
  }

  const rawError = runQuery.error;
  const explainError = explainQuery.error instanceof Error ? explainQuery.error.message : undefined;
  const error =
    rawError instanceof DestructiveConfirmationRequiredError
      ? undefined
      : rawError instanceof QueryCancelledError
        ? "Query cancelled."
        : rawError instanceof ReadOnlySessionRejectionError
          ? ((capabilities?.readOnlyReason &&
              READ_ONLY_REASON_LABEL[capabilities.readOnlyReason]) ??
            rawError.message)
          : rawError instanceof Error
            ? rawError.message
            : undefined;

  return (
    <>
      <QueryRunner
        sql={sql}
        onSqlChange={onSqlChange}
        onRun={() => {
          explainQuery.reset();
          onRun();
        }}
        onCancel={onCancel}
        isRunning={runQuery.isPending}
        result={runQuery.data}
        error={error}
        onExportResults={(format) => {
          const result = runQuery.data;
          if (result && result.rows.length > 0) {
            downloadQueryResults(format, result.columns, result.rows);
          }
        }}
        onExplain={() => explainQuery.mutate({ sql, analyze: false })}
        isExplaining={explainQuery.isPending}
        explainResult={explainQuery.data}
        explainError={explainError}
        onOpenHistory={onOpenHistory}
        tables={tables}
        engine={engine}
        resultsHeight={resultsHeight}
        onResultsHeightChange={onResultsHeightChange}
      />
      {pendingConfirmation && (
        <ConfirmDestructiveStatementDialog
          sql={pendingConfirmation.sql}
          classification={pendingConfirmation.classification}
          running={runQuery.isPending}
          onConfirm={onConfirmDestructive}
          onCancel={onCancelDestructive}
        />
      )}
    </>
  );
}
