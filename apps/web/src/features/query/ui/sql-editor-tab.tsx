import type { ConnectionCapabilities, StatementClassification } from "@qyre/core";
import { ConfirmDestructiveStatementDialog, QueryRunner, READ_ONLY_REASON_LABEL } from "@qyre/ui";
import type { ReactNode } from "react";
import {
  DestructiveConfirmationRequiredError,
  QueryCancelledError,
  ReadOnlySessionRejectionError
} from "../api/query.js";
import type { useRunQuery } from "../model/use-run-query.js";

export interface SqlEditorTabProps {
  /** True when the connected adapter's capabilities.supportsSql is false (F063) - e.g. MongoDB,
   * which has no read-only SQL query runner. */
  sqlDisabled: boolean;
  sql: string;
  onSqlChange: (sql: string) => void;
  onRun: () => void;
  /** Cancels the currently running query (F126) - shown as a Cancel control while `runQuery.isPending`. */
  onCancel: () => void;
  runQuery: ReturnType<typeof useRunQuery>;
  /** Session-level capabilities (F108) - used only to look up a friendly `readOnlyReason` message
   * when a read-only session's write attempt is rejected. */
  capabilities?: ConnectionCapabilities;
  onOpenHistory: () => void;
  tableNames: string[];
  resultsHeight: number;
  onResultsHeightChange: (height: number) => void;
  /** Set when the last run was rejected as destructive pending confirmation (F107/F108) - renders
   * the confirmation dialog instead of a raw error. */
  pendingConfirmation?: { sql: string; classification: StatementClassification };
  onConfirmDestructive: () => void;
  onCancelDestructive: () => void;
}

/** SQL Editor tab content - not available for engines with no SQL dialect (MongoDB today). */
export function SqlEditorTab({
  sqlDisabled,
  sql,
  onSqlChange,
  onRun,
  onCancel,
  runQuery,
  capabilities,
  onOpenHistory,
  tableNames,
  resultsHeight,
  onResultsHeightChange,
  pendingConfirmation,
  onConfirmDestructive,
  onCancelDestructive
}: SqlEditorTabProps): ReactNode {
  if (sqlDisabled) {
    return (
      <p className="text-[13px] text-muted-foreground">
        The SQL Editor is not available for MongoDB connections - browse collections directly from
        the Tables tab.
      </p>
    );
  }

  const rawError = runQuery.error;
  // A destructive-confirmation rejection isn't shown as a raw error - the confirmation dialog
  // below handles it. A read-only session's rejected write attempt shows the session's own
  // friendly readOnlyReason (F108) instead of the raw "Only read-only statements..." text, mirroring
  // StatusBar's badge copy exactly (@qyre/ui's shared READ_ONLY_REASON_LABEL).
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
        onRun={onRun}
        onCancel={onCancel}
        isRunning={runQuery.isPending}
        result={runQuery.data}
        error={error}
        onOpenHistory={onOpenHistory}
        tableNames={tableNames}
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
