import type { ConnectionStatus } from "@humb/core";
import {
  QueryRunner,
  RowsTable,
  SchemaGrid,
  Sidebar,
  Spinner,
  StatusBar,
  TabBar,
  TitleBar,
  type ShellTab
} from "@humb/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { useAllTables } from "./hooks/use-all-tables.js";
import { useHealth } from "./hooks/use-health.js";
import { useOverview } from "./hooks/use-overview.js";
import { useRows } from "./hooks/use-rows.js";
import { useRunQuery } from "./hooks/use-run-query.js";
import { useTable } from "./hooks/use-table.js";
import { useTheme } from "./hooks/use-theme.js";

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
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [lastQueryMs, setLastQueryMs] = useState<number>();
  const { theme, toggleTheme } = useTheme();

  const overview = useOverview({ enabled: status === "connected" });
  const table = useTable(selected?.schema, selected?.table);
  const rows = useRows(selected?.schema, selected?.table, page);
  const allTables = useAllTables(overview.data?.schemas);
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

  function runSql(): void {
    const start = performance.now();
    runQuery.mutate(querySql, {
      onSuccess: () => setLastQueryMs(Math.round(performance.now() - start))
    });
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TitleBar
        status={status}
        target={health?.target ?? null}
        theme={theme}
        onToggleTheme={toggleTheme}
        onRefresh={refresh}
        isRefreshing={healthLoading}
        onToggleSidebar={() => setSidebarOpen((current) => !current)}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          target={health?.target ?? null}
          status={status}
          schemas={overview.data?.schemas ?? []}
          selected={selected}
          onSelect={selectTable}
          isLoading={status === "connected" && overview.isLoading}
          isError={overview.isError}
          onRetry={() => overview.refetch()}
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TabBar active={tab} onChange={setTab} />

          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {status !== "connected" ? (
              <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                {healthLoading ? (
                  <>
                    <Spinner /> Checking connection...
                  </>
                ) : (
                  "No database is connected yet. Launch Humb with a Postgres or SQLite target to get started."
                )}
              </p>
            ) : tab === "sql-editor" ? (
              <QueryRunner
                sql={querySql}
                onSqlChange={setQuerySql}
                onRun={runSql}
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
                <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <Spinner /> Loading rows...
                </p>
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
                  columns={table.data?.columns}
                  tableName={selected.table}
                  approxRowCount={table.data?.rowCount}
                  page={page}
                  canGoPrevious={page > 0}
                  canGoNext={rows.data.rows.length === rows.data.pageSize}
                  onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                  onNext={() => setPage((current) => current + 1)}
                  onRefresh={() => rows.refetch()}
                />
              ) : null
            ) : tab === "schema" ? (
              allTables.isLoading ? (
                <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <Spinner /> Loading tables...
                </p>
              ) : allTables.isError ? (
                <p className="text-[13px] text-muted-foreground">
                  Failed to load one or more tables.{" "}
                  <button
                    type="button"
                    onClick={() => allTables.refetch()}
                    className="text-primary underline"
                  >
                    Retry
                  </button>
                </p>
              ) : allTables.tables.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No tables found.</p>
              ) : (
                <SchemaGrid tables={allTables.tables} />
              )
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

      <StatusBar
        status={status}
        engine={overview.data?.engine}
        schema={selected?.schema}
        lastQueryMs={lastQueryMs}
      />
    </div>
  );
}
