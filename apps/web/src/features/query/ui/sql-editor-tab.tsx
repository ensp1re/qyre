import { QueryRunner } from "@qyre/ui";
import type { ReactNode } from "react";
import type { useRunQuery } from "../model/use-run-query.js";

export interface SqlEditorTabProps {
  /** True when the connected adapter's capabilities.supportsSql is false (F063) - e.g. MongoDB,
   * which has no read-only SQL query runner. */
  sqlDisabled: boolean;
  sql: string;
  onSqlChange: (sql: string) => void;
  onRun: () => void;
  runQuery: ReturnType<typeof useRunQuery>;
  onOpenHistory: () => void;
  tableNames: string[];
  resultsHeight: number;
  onResultsHeightChange: (height: number) => void;
}

/** SQL Editor tab content - not available for engines with no SQL dialect (MongoDB today). */
export function SqlEditorTab({
  sqlDisabled,
  sql,
  onSqlChange,
  onRun,
  runQuery,
  onOpenHistory,
  tableNames,
  resultsHeight,
  onResultsHeightChange
}: SqlEditorTabProps): ReactNode {
  if (sqlDisabled) {
    return (
      <p className="text-[13px] text-muted-foreground">
        The SQL Editor is not available for MongoDB connections - browse collections directly from
        the Tables tab.
      </p>
    );
  }

  return (
    <QueryRunner
      sql={sql}
      onSqlChange={onSqlChange}
      onRun={onRun}
      isRunning={runQuery.isPending}
      result={runQuery.data}
      error={runQuery.error instanceof Error ? runQuery.error.message : undefined}
      onOpenHistory={onOpenHistory}
      tableNames={tableNames}
      resultsHeight={resultsHeight}
      onResultsHeightChange={onResultsHeightChange}
    />
  );
}
