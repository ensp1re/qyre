import type { ConnectionStatus, RowFilter, RowSort } from "@qyre/core";
import {
  ConnectDrawer,
  ErrorBoundary,
  QueryHistoryDrawer,
  RESULTS_DEFAULT_HEIGHT,
  Sidebar,
  SIDEBAR_DEFAULT_WIDTH,
  Spinner,
  StatusBar,
  TabBar,
  TitleBar,
  type ShellTab
} from "@qyre/ui";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ConsoleTab } from "./components/console-tab.js";
import { FilesTab } from "./components/files-tab.js";
import { SchemaTab } from "./components/schema-tab.js";
import { SqlEditorTab } from "./components/sql-editor-tab.js";
import { TablesTab } from "./components/tables-tab.js";
import { useAllTables } from "./hooks/use-all-tables.js";
import { useConnect } from "./hooks/use-connect.js";
import { useClearConsole, useConsoleEvents } from "./hooks/use-console.js";
import { useFileContent, useFilesOverview } from "./hooks/use-files.js";
import { useHealth } from "./hooks/use-health.js";
import { useOverview } from "./hooks/use-overview.js";
import { usePanelSize } from "./hooks/use-panel-size.js";
import { useQueryHistory } from "./hooks/use-query-history.js";
import { useRecentTargets } from "./hooks/use-recent-targets.js";
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
  const [sort, setSort] = useState<RowSort | undefined>();
  const [filters, setFilters] = useState<RowFilter[] | undefined>();
  const [querySql, setQuerySql] = useState("");
  const [tab, setTab] = useState<ShellTab>("sql-editor");
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [lastQueryMs, setLastQueryMs] = useState<number>();
  const [selectedFilePath, setSelectedFilePath] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const [sidebarWidth, setSidebarWidth] = usePanelSize("qyre-sidebar-width", SIDEBAR_DEFAULT_WIDTH);
  const [resultsHeight, setResultsHeight] = usePanelSize(
    "qyre-results-height",
    RESULTS_DEFAULT_HEIGHT
  );
  const queryHistory = useQueryHistory();
  const recentTargets = useRecentTargets();
  const connect = useConnect();

  // F073: `npx qyre` with no target starts the server unconnected - jump straight into the connect
  // UI instead of leaving the developer looking at a passive "no database connected" message with
  // no obvious next step. Only auto-opens once per load (hasAutoOpenedConnect), so closing it to
  // look around doesn't get overridden by this effect re-running on the next health poll.
  const [hasAutoOpenedConnect, setHasAutoOpenedConnect] = useState(false);
  useEffect(() => {
    if (!healthLoading && status === "unconfigured" && !hasAutoOpenedConnect) {
      setConnectOpen(true);
      setHasAutoOpenedConnect(true);
    }
  }, [healthLoading, status, hasAutoOpenedConnect]);

  const overview = useOverview({ enabled: status === "connected" });
  // F063: some engines (MongoDB today) have no read-only SQL query runner - no SQL dialect for a
  // read-only backstop to run inside (see docs/product-specs/connect-and-inspect-mongodb.md's "Why
  // this engine is scoped differently"). Read from the adapter's declared capabilities instead of
  // an `engine === "mongodb"` string check, so a future non-SQL engine doesn't need its own
  // conditional here (docs/product-specs/adapter-capabilities.md). The tab is disabled rather than
  // left clickable and silently failing every query.
  const supportsSql = overview.data?.capabilities.supportsSql ?? true;
  const table = useTable(selected?.schema, selected?.table);
  const rows = useRows(selected?.schema, selected?.table, page, sort, filters);
  const allTables = useAllTables({ enabled: status === "connected" });
  const tableNames = (overview.data?.schemas ?? []).flatMap((schema) => schema.tables);
  const filesOverview = useFilesOverview({ enabled: status === "connected" });
  const fileContent = useFileContent(selectedFilePath);
  const consoleEvents = useConsoleEvents({ enabled: status === "connected" });
  const clearConsole = useClearConsole();
  const runQuery = useRunQuery();

  function selectTable(schema: string, tableName: string, initialFilters?: RowFilter[]): void {
    setSelected({ schema, table: tableName });
    setPage(0);
    setSort(undefined);
    setFilters(initialFilters);
    setTab("tables");
  }

  function refresh(): void {
    void refetchHealth();
    if (status === "connected") {
      void overview.refetch();
      void allTables.refetch();
      void filesOverview.refetch();
      void consoleEvents.refetch();
    }
  }

  function runSql(): void {
    const start = performance.now();
    runQuery.mutate(querySql, {
      onSuccess: () => {
        setLastQueryMs(Math.round(performance.now() - start));
        queryHistory.record(querySql);
      }
    });
  }

  function selectFromHistory(sql: string): void {
    setQuerySql(sql);
    setHistoryOpen(false);
  }

  // F064: switches the running server to a different database. useConnect's onSuccess already
  // invalidates every React Query cache; the reset here covers local component state React Query
  // doesn't own (the currently selected table/page - the new database likely doesn't have the
  // same tables, matching selectTable's existing reset-on-switch behavior). The SQL Editor's
  // current draft (querySql) is deliberately left untouched - see the product spec's rationale.
  async function connectToNewTarget(raw: string): Promise<void> {
    const result = await connect.mutateAsync(raw);
    recentTargets.record(raw, result.target);
    setSelected(undefined);
    setPage(0);
    setSort(undefined);
    setFilters(undefined);
    setConnectOpen(false);
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
        onOpenSettings={() => setConnectOpen(true)}
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
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TabBar
            active={tab}
            onChange={setTab}
            disabledTabs={
              !supportsSql
                ? {
                    "sql-editor":
                      "Not available for MongoDB connections - browse collections directly."
                  }
                : undefined
            }
          />

          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <ErrorBoundary
              key={tab}
              fallbackMessage="This tab hit an unexpected error rendering its content. Try switching tabs and back, or reload if it persists."
            >
              {status !== "connected" ? (
                <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  {healthLoading ? (
                    <>
                      <Spinner /> Checking connection...
                    </>
                  ) : (
                    "No database is connected yet. Launch Qyre with a Postgres, MySQL, SQLite, or MongoDB target to get started."
                  )}
                </p>
              ) : tab === "sql-editor" ? (
                <SqlEditorTab
                  sqlDisabled={!supportsSql}
                  sql={querySql}
                  onSqlChange={setQuerySql}
                  onRun={runSql}
                  runQuery={runQuery}
                  onOpenHistory={() => setHistoryOpen(true)}
                  tableNames={tableNames}
                  resultsHeight={resultsHeight}
                  onResultsHeightChange={setResultsHeight}
                />
              ) : tab === "tables" ? (
                <TablesTab
                  selected={selected}
                  table={table}
                  rows={rows}
                  page={page}
                  onPageChange={setPage}
                  onNavigateToForeignKey={(reference, value) =>
                    selectTable(reference.schema ?? selected?.schema ?? "", reference.table, [
                      { column: reference.column, op: "eq", value: String(value) }
                    ])
                  }
                  sort={sort}
                  onSortChange={(nextSort) => {
                    setSort(nextSort);
                    setPage(0);
                  }}
                  filters={filters}
                  onFiltersChange={(nextFilters) => {
                    setFilters(nextFilters);
                    setPage(0);
                  }}
                />
              ) : tab === "schema" ? (
                <SchemaTab allTables={allTables} databaseKey={health?.target ?? null} />
              ) : tab === "files" ? (
                <FilesTab
                  filesOverview={filesOverview}
                  fileContent={fileContent}
                  selectedFilePath={selectedFilePath}
                  onSelectFile={setSelectedFilePath}
                  onRunInEditor={
                    supportsSql
                      ? (sql) => {
                          setQuerySql(sql);
                          setTab("sql-editor");
                        }
                      : undefined
                  }
                />
              ) : tab === "console" ? (
                <ConsoleTab consoleEvents={consoleEvents} onClear={() => clearConsole.mutate()} />
              ) : null}
            </ErrorBoundary>
          </div>
        </div>
      </div>

      <StatusBar
        status={status}
        engine={overview.data?.engine}
        engineVersion={health?.engineVersion}
        schema={selected?.schema}
        lastQueryMs={lastQueryMs}
        pingLatencyMs={health?.pingLatencyMs}
        lastError={health?.lastError}
      />

      <QueryHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        entries={queryHistory.entries}
        onSelect={selectFromHistory}
      />

      <ConnectDrawer
        open={connectOpen}
        onOpenChange={setConnectOpen}
        currentTarget={health?.target ?? null}
        recentTargets={recentTargets.entries}
        onConnect={connectToNewTarget}
        isConnecting={connect.isPending}
      />
    </div>
  );
}
