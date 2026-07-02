import type { ConnectionStatus } from "@humb/core";
import {
  QueryRunner,
  RowsTable,
  Sidebar,
  StatusBar,
  TabBar,
  TableDetail,
  TitleBar,
  type ShellTab
} from "@humb/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { useHealth } from "./hooks/use-health.js";
import { useOverview } from "./hooks/use-overview.js";
import { useRows } from "./hooks/use-rows.js";
import { useRunQuery } from "./hooks/use-run-query.js";
import { useTable } from "./hooks/use-table.js";

export function App(): ReactNode {
  const {
    data: health,
    isLoading: healthLoading,
    isError: healthError,
    refetch: refetchHealth
  } = useHealth();
  const status: ConnectionStatus = healthError
    ? "disconnected"
    : (health?.database ?? "unconfigured");

  const [selected, setSelected] = useState<{ schema: string; table: string } | undefined>();
  const [page, setPage] = useState(0);
  const [querySql, setQuerySql] = useState("");
  const [tab, setTab] = useState<ShellTab>("sql-editor");

  const overview = useOverview({ enabled: status === "connected" });
  const table = useTable(selected?.schema, selected?.table);
  const rows = useRows(selected?.schema, selected?.table, page);
  const runQuery = useRunQuery();

  function selectTable(schema: string, tableName: string): void {
    setSelected({ schema, table: tableName });
    setPage(0);
    setTab("tables");
  }

  function refresh(): void {
    void refetchHealth();
    if (status === "connected") {
      void overview.refetch();
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TitleBar
        status={status}
        target={health?.target ?? null}
        onRefresh={refresh}
        isRefreshing={healthLoading}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          schemas={overview.data?.schemas ?? []}
          selected={selected}
          onSelect={selectTable}
          isLoading={status === "connected" && overview.isLoading}
          isError={overview.isError}
          onRetry={() => overview.refetch()}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TabBar active={tab} onChange={setTab} />

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {status !== "connected" ? (
              <p data-testid="connection-summary" className="text-[13px] text-muted-foreground">
                {healthLoading
                  ? "Checking connection..."
                  : "No database is connected yet. Launch Humb with a Postgres or SQLite target to get started."}
              </p>
            ) : tab === "sql-editor" ? (
              <QueryRunner
                sql={querySql}
                onSqlChange={setQuerySql}
                onRun={() => runQuery.mutate(querySql)}
                isRunning={runQuery.isPending}
                result={runQuery.data}
                error={runQuery.error instanceof Error ? runQuery.error.message : undefined}
              />
            ) : tab === "tables" ? (
              !selected ? (
                <p className="text-[13px] text-muted-foreground">
                  Select a table from the sidebar.
                </p>
              ) : rows.isLoading ? (
                <p className="text-[13px] text-muted-foreground">Loading rows...</p>
              ) : rows.isError ? (
                <p className="text-[13px] text-muted-foreground">
                  Failed to load rows.{" "}
                  <button
                    type="button"
                    onClick={() => rows.refetch()}
                    className="text-primary underline"
                  >
                    Retry
                  </button>
                </p>
              ) : rows.data ? (
                <RowsTable
                  rowPage={rows.data}
                  page={page}
                  canGoPrevious={page > 0}
                  canGoNext={rows.data.rows.length === rows.data.pageSize}
                  onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                  onNext={() => setPage((current) => current + 1)}
                />
              ) : null
            ) : tab === "schema" ? (
              !selected ? (
                <p className="text-[13px] text-muted-foreground">
                  Select a table from the sidebar.
                </p>
              ) : table.isLoading ? (
                <p className="text-[13px] text-muted-foreground">Loading table...</p>
              ) : table.isError ? (
                <p className="text-[13px] text-muted-foreground">
                  Failed to load table metadata.{" "}
                  <button
                    type="button"
                    onClick={() => table.refetch()}
                    className="text-primary underline"
                  >
                    Retry
                  </button>
                </p>
              ) : table.data ? (
                <TableDetail table={table.data} />
              ) : null
            ) : tab === "files" ? (
              <p className="text-[13px] text-muted-foreground">
                File browsing needs a scoped read-only endpoint - coming in DF-06.
              </p>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                The activity console needs a server-side event log - coming in DF-07.
              </p>
            )}
          </div>
        </div>
      </div>

      <StatusBar status={status} engine={overview.data?.engine} schema={selected?.schema} />
    </div>
  );
}
