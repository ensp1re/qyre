import { QueryRunner } from "@humbdb/ui";
import type { ReactNode } from "react";
import type { useRunQuery } from "../hooks/use-run-query.js";

export interface SqlEditorTabProps {
  isMongo: boolean;
  sql: string;
  onSqlChange: (sql: string) => void;
  onRun: () => void;
  runQuery: ReturnType<typeof useRunQuery>;
  onOpenHistory: () => void;
  tableNames: string[];
}

/** SQL Editor tab content - not available for MongoDB connections (no SQL dialect). */
export function SqlEditorTab({
  isMongo,
  sql,
  onSqlChange,
  onRun,
  runQuery,
  onOpenHistory,
  tableNames
}: SqlEditorTabProps): ReactNode {
  if (isMongo) {
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
    />
  );
}
