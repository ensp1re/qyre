import type { ConnectionStatus, RowFilter } from "@qyre/core";
import {
  ConnectDrawer,
  ErrorBoundary,
  QueryHistoryDrawer,
  RESULTS_DEFAULT_HEIGHT,
  SettingsScreen,
  Sidebar,
  SIDEBAR_DEFAULT_WIDTH,
  Spinner,
  StatusBar,
  TabBar,
  TitleBar
} from "@qyre/ui";
import type { ReactNode } from "react";
import { useEffect, useReducer } from "react";
import { useCapabilities } from "../features/connection/model/use-capabilities.js";
import { useConnect } from "../features/connection/model/use-connect.js";
import { useHealth } from "../features/connection/model/use-health.js";
import { useRecentTargets } from "../features/connection/model/use-recent-targets.js";
import { useClearConsole, useConsoleEvents } from "../features/console/model/use-console.js";
import { ConsoleTab } from "../features/console/ui/console-tab.js";
import { useFileContent, useFilesOverview } from "../features/files/model/use-files.js";
import { FilesTab } from "../features/files/ui/files-tab.js";
import { useQueryHistory } from "../features/query/model/use-query-history.js";
import { useRunQuery } from "../features/query/model/use-run-query.js";
import { SqlEditorTab } from "../features/query/ui/sql-editor-tab.js";
import { useAllTables } from "../features/schema/model/use-all-tables.js";
import { useOverview } from "../features/schema/model/use-overview.js";
import { SchemaTab } from "../features/schema/ui/schema-tab.js";
import { useRows } from "../features/table/model/use-rows.js";
import { useTable } from "../features/table/model/use-table.js";
import { TablesTab } from "../features/table/ui/tables-tab.js";
import { usePanelSize } from "./model/use-panel-size.js";
import { useTheme } from "./model/use-theme.js";
import { createInitialWorkspaceState, workspaceReducer } from "./model/workspace-state.js";

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

  const [workspace, dispatch] = useReducer(
    workspaceReducer,
    window.innerWidth,
    createInitialWorkspaceState
  );
  const {
    selected,
    page,
    sort,
    filters,
    querySql,
    tab,
    sidebarOpen,
    lastQueryMs,
    selectedFilePath,
    historyOpen,
    connectOpen,
    hasAutoOpenedConnect,
    settingsOpen
  } = workspace;
  const { theme, toggleTheme, setTheme } = useTheme();
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
  useEffect(() => {
    if (!healthLoading && status === "unconfigured" && !hasAutoOpenedConnect) {
      dispatch({ type: "connectAutoOpened" });
    }
  }, [healthLoading, status, hasAutoOpenedConnect]);

  const overview = useOverview({ enabled: status === "connected" });
  // F097: shares the same ["overview"] query cache as `overview` above (no extra request) - the
  // canonical entry point every write-affordance gates on, per
  // docs/product-specs/permissions-and-capabilities.md.
  const capabilities = useCapabilities({ enabled: status === "connected" });
  // F063: some engines (MongoDB today) have no read-only SQL query runner - no SQL dialect for a
  // read-only backstop to run inside (see docs/product-specs/connect-and-inspect-mongodb.md's "Why
  // this engine is scoped differently"). Read from the adapter's declared capabilities instead of
  // an `engine === "mongodb"` string check, so a future non-SQL engine doesn't need its own
  // conditional here (docs/product-specs/adapter-capabilities.md). Unsupported tabs are hidden from
  // the shell instead of shown as disabled dead ends; the effect below moves the active tab away
  // from SQL once capabilities load for a non-SQL engine.
  const supportsSql = overview.data?.capabilities.supportsSql ?? true;
  useEffect(() => {
    if (status === "connected" && !supportsSql) {
      dispatch({ type: "sqlUnavailableForConnection" });
    }
  }, [status, supportsSql]);
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
    dispatch({
      type: "tableSelected",
      selected: { schema, table: tableName },
      filters: initialFilters
    });
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
        dispatch({ type: "queryCompleted", durationMs: Math.round(performance.now() - start) });
        queryHistory.record(querySql);
      }
    });
  }

  function selectFromHistory(sql: string): void {
    dispatch({ type: "historySelected", sql });
  }

  // F064: switches the running server to a different database. useConnect's onSuccess already
  // invalidates every React Query cache; the reset here covers local component state React Query
  // doesn't own (the currently selected table/page - the new database likely doesn't have the
  // same tables, matching selectTable's existing reset-on-switch behavior). The SQL Editor's
  // current draft (querySql) is deliberately left untouched - see the product spec's rationale.
  async function connectToNewTarget(raw: string): Promise<void> {
    const result = await connect.mutateAsync(raw);
    recentTargets.record(raw, result.target);
    dispatch({ type: "connectionChanged" });
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
        onToggleSidebar={() => dispatch({ type: "sidebarChanged", open: !sidebarOpen })}
        onOpenConnection={() => dispatch({ type: "connectChanged", open: true })}
        onOpenSettings={() => dispatch({ type: "settingsChanged", open: true })}
      />

      {settingsOpen ? (
        <SettingsScreen
          theme={theme}
          onThemeChange={setTheme}
          onClose={() => dispatch({ type: "settingsChanged", open: false })}
          connectionStatus={status}
          connectionTarget={health?.target ?? null}
          onOpenConnection={() => dispatch({ type: "connectChanged", open: true })}
          queryHistoryCount={queryHistory.entries.length}
          onClearQueryHistory={queryHistory.clear}
          recentConnectionsCount={recentTargets.entries.length}
          onClearRecentConnections={recentTargets.clear}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <Sidebar
            schemas={overview.data?.schemas ?? []}
            selected={selected}
            onSelect={selectTable}
            isLoading={status === "connected" && overview.isLoading}
            isError={overview.isError}
            onRetry={() => overview.refetch()}
            open={sidebarOpen}
            onOpenChange={(open) => dispatch({ type: "sidebarChanged", open })}
            width={sidebarWidth}
            onWidthChange={setSidebarWidth}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <TabBar
              active={tab}
              onChange={(nextTab) => dispatch({ type: "tabChanged", tab: nextTab })}
              hiddenTabs={!supportsSql ? ["sql-editor"] : undefined}
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
                    onSqlChange={(sql) => dispatch({ type: "queryChanged", sql })}
                    onRun={runSql}
                    runQuery={runQuery}
                    onOpenHistory={() => dispatch({ type: "historyChanged", open: true })}
                    tableNames={tableNames}
                    resultsHeight={resultsHeight}
                    onResultsHeightChange={setResultsHeight}
                  />
                ) : tab === "tables" ? (
                  <TablesTab
                    selected={selected}
                    table={table}
                    engine={overview.data?.engine}
                    rows={rows}
                    page={page}
                    onPageChange={(update) => dispatch({ type: "pageChanged", page: update(page) })}
                    onNavigateToForeignKey={(reference, value) =>
                      selectTable(reference.schema ?? selected?.schema ?? "", reference.table, [
                        { column: reference.column, op: "eq", value: String(value) }
                      ])
                    }
                    sort={sort}
                    onSortChange={(nextSort) => dispatch({ type: "sortChanged", sort: nextSort })}
                    filters={filters}
                    onFiltersChange={(nextFilters) =>
                      dispatch({ type: "filtersChanged", filters: nextFilters })
                    }
                  />
                ) : tab === "schema" ? (
                  <SchemaTab allTables={allTables} databaseKey={health?.target ?? null} />
                ) : tab === "files" ? (
                  <FilesTab
                    filesOverview={filesOverview}
                    fileContent={fileContent}
                    selectedFilePath={selectedFilePath}
                    onSelectFile={(path) => dispatch({ type: "fileSelected", path })}
                    onRunInEditor={
                      supportsSql
                        ? (sql) => {
                            dispatch({ type: "queryLoaded", sql });
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
      )}

      <StatusBar
        status={status}
        engine={overview.data?.engine}
        engineVersion={health?.engineVersion}
        schema={selected?.schema}
        target={health?.target ?? null}
        lastQueryMs={lastQueryMs}
        pingLatencyMs={health?.pingLatencyMs}
        lastError={health?.lastError}
        capabilities={capabilities.data}
      />

      <QueryHistoryDrawer
        open={historyOpen}
        onOpenChange={(open) => dispatch({ type: "historyChanged", open })}
        entries={queryHistory.entries}
        onSelect={selectFromHistory}
      />

      <ConnectDrawer
        open={connectOpen}
        onOpenChange={(open) => dispatch({ type: "connectChanged", open })}
        currentTarget={health?.target ?? null}
        recentTargets={recentTargets.entries}
        onConnect={connectToNewTarget}
        isConnecting={connect.isPending}
      />
    </div>
  );
}
