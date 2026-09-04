import type { ConnectionStatus, RowFilter, StatementClassification } from "@qyre/core";
import {
  ConnectDrawer,
  ErrorBoundary,
  QueryHistoryDrawer,
  RESULTS_DEFAULT_HEIGHT,
  SettingsScreen,
  Sidebar,
  SIDEBAR_DEFAULT_WIDTH,
  Spinner,
  TabBar,
  WorkspaceActions
} from "@qyre/ui";
import type { ReactNode } from "react";
import { useEffect, useReducer, useRef, useState } from "react";
import { cancelOperation } from "../shared/api/operations.js";
import { useCapabilities } from "../features/connection/model/session/use-capabilities.js";
import { useConnect } from "../features/connection/model/session/use-connect.js";
import { databaseManagementReason } from "../features/connection/model/admin/database-management-reason.js";
import { useDatabaseAdminMutations } from "../features/connection/model/admin/use-database-admin.js";
import { useDatabases } from "../features/connection/model/admin/use-databases.js";
import { useHealth } from "../features/connection/model/session/use-health.js";
import { parseTargetDatabase } from "../features/connection/model/targets/parse-target-database.js";
import { useRecentTargets } from "../features/connection/model/targets/use-recent-targets.js";
import { useSwitchDatabase } from "../features/connection/model/admin/use-switch-database.js";
import { sessionAllows } from "../shared/lib/capabilities/capability-gates.js";
import { useClearConsole, useConsoleEvents } from "../features/console/model/use-console.js";
import { ConsoleTab } from "../features/console/ui/console-tab.js";
import { useFileContent, useFilesOverview } from "../features/files/model/use-files.js";
import { FilesTab } from "../features/files/ui/files-tab.js";
import { DestructiveConfirmationRequiredError } from "../features/query/api/query.js";
import { useQueryHistory } from "../features/query/model/use-query-history.js";
import { useRunQuery } from "../features/query/model/use-run-query.js";
import { SqlEditorTab } from "../features/query/ui/sql-editor-tab.js";
import { useAllTables } from "../features/schema/model/use-all-tables.js";
import { useOverview } from "../features/schema/model/use-overview.js";
import { SchemaTab } from "../features/schema/ui/schema-tab.js";
import { useRows } from "../features/table/model/data/use-rows.js";
import { useTable } from "../features/table/model/data/use-table.js";
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
    tableSearch,
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
  const switchDatabase = useSwitchDatabase();
  const databaseAdmin = useDatabaseAdminMutations();

  useEffect(() => {
    if (!healthLoading && status === "unconfigured" && !hasAutoOpenedConnect) {
      dispatch({ type: "connectAutoOpened" });
    }
  }, [healthLoading, status, hasAutoOpenedConnect]);

  const overview = useOverview({ enabled: status === "connected" });
  const capabilities = useCapabilities({ enabled: status === "connected" });
  const serverDatabasesSupported =
    status === "connected" &&
    overview.data !== undefined &&
    overview.data.engine !== "sqlite" &&
    overview.data.engine !== "mongodb";
  const databases = useDatabases(serverDatabasesSupported);
  const canManageDatabases = sessionAllows(capabilities.data, "supportsDatabaseManagement");
  const canManageSchemas = overview.data?.engine === "postgres" && canManageDatabases;
  const supportsSql = overview.data?.capabilities.supportsSql ?? true;
  useEffect(() => {
    if (status === "connected" && !supportsSql) {
      dispatch({ type: "sqlUnavailableForConnection" });
    }
  }, [status, supportsSql]);
  const table = useTable(selected?.schema, selected?.table);
  const rows = useRows(selected?.schema, selected?.table, page, sort, filters, tableSearch);
  const allTables = useAllTables({ enabled: status === "connected" });
  const completionTables = allTables.tables.map((table) => ({
    name: table.name,
    columns: table.columns.map((column) => column.name)
  }));
  const filesOverview = useFilesOverview({ enabled: status === "connected" });
  const fileContent = useFileContent(selectedFilePath);
  const consoleEvents = useConsoleEvents({ enabled: status === "connected" });
  const clearConsole = useClearConsole();
  const runQuery = useRunQuery();
  const [pendingConfirmation, setPendingConfirmation] = useState<
    { sql: string; classification: StatementClassification } | undefined
  >(undefined);
  const runOperationIdRef = useRef<string | undefined>(undefined);

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
    const operationId = crypto.randomUUID();
    runOperationIdRef.current = operationId;
    runQuery.mutate(
      { sql: querySql, confirmed: false, operationId },
      {
        onSuccess: (result) => {
          dispatch({ type: "queryCompleted", durationMs: Math.round(performance.now() - start) });
          queryHistory.record(querySql, result.classification);
        },
        onError: (error) => {
          if (error instanceof DestructiveConfirmationRequiredError) {
            setPendingConfirmation({ sql: querySql, classification: error.classification });
          }
        },
        onSettled: () => {
          runOperationIdRef.current = undefined;
        }
      }
    );
  }

  function cancelRun(): void {
    const operationId = runOperationIdRef.current;
    if (operationId) void cancelOperation(operationId);
  }

  function confirmDestructiveRun(): void {
    if (!pendingConfirmation) return;
    const start = performance.now();
    const sql = pendingConfirmation.sql;
    const operationId = crypto.randomUUID();
    runOperationIdRef.current = operationId;
    runQuery.mutate(
      { sql, confirmed: true, operationId },
      {
        onSuccess: (result) => {
          dispatch({ type: "queryCompleted", durationMs: Math.round(performance.now() - start) });
          queryHistory.record(sql, result.classification);
        },
        onSettled: () => {
          runOperationIdRef.current = undefined;
          setPendingConfirmation(undefined);
        }
      }
    );
  }

  function cancelDestructiveRun(): void {
    setPendingConfirmation(undefined);
  }

  function selectFromHistory(sql: string): void {
    dispatch({ type: "historySelected", sql });
  }

  async function connectToNewTarget(raw: string): Promise<void> {
    const result = await connect.mutateAsync(raw);
    recentTargets.record(raw, result.target);
    dispatch({ type: "connectionChanged" });
  }

  async function switchToDatabase(database: string): Promise<void> {
    await switchDatabase.mutateAsync(database);
    dispatch({ type: "connectionChanged" });
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <a
        href="#workspace-content"
        className="fixed left-2 top-2 z-[100] -translate-y-16 rounded-[3px] bg-primary px-2 py-1 text-[11px] text-primary-foreground focus:translate-y-0"
      >
        Skip to workspace
      </a>

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
            canManageSchemas={canManageSchemas}
            onCreateSchema={canManageSchemas ? databaseAdmin.createSchema : undefined}
            onDropSchema={canManageSchemas ? databaseAdmin.dropSchema : undefined}
            status={status}
            target={health?.target ?? null}
            engine={overview.data?.engine}
            engineVersion={health?.engineVersion}
            capabilities={capabilities.data}
            onOpenConnection={() => dispatch({ type: "connectChanged", open: true })}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <TabBar
              active={tab}
              onChange={(nextTab) => dispatch({ type: "tabChanged", tab: nextTab })}
              hiddenTabs={!supportsSql ? ["sql-editor"] : undefined}
              actions={
                <WorkspaceActions
                  theme={theme}
                  onToggleTheme={toggleTheme}
                  onRefresh={refresh}
                  isRefreshing={healthLoading}
                  onToggleSidebar={() => dispatch({ type: "sidebarChanged", open: !sidebarOpen })}
                  onOpenConnection={() => dispatch({ type: "connectChanged", open: true })}
                  onOpenSettings={() => dispatch({ type: "settingsChanged", open: true })}
                  lastQueryMs={lastQueryMs}
                />
              }
            />

            <main
              id="workspace-content"
              tabIndex={-1}
              className="min-h-0 flex-1 overflow-hidden outline-none"
            >
              <ErrorBoundary
                key={tab}
                fallbackMessage="This tab hit an unexpected error rendering its content. Try switching tabs and back, or reload if it persists."
              >
                {status !== "connected" ? (
                  <p className="flex items-center gap-1.5 p-4 text-[13px] text-muted-foreground">
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
                    onCancel={cancelRun}
                    runQuery={runQuery}
                    capabilities={capabilities.data}
                    onOpenHistory={() => dispatch({ type: "historyChanged", open: true })}
                    tables={completionTables}
                    engine={overview.data?.engine}
                    resultsHeight={resultsHeight}
                    onResultsHeightChange={setResultsHeight}
                    pendingConfirmation={pendingConfirmation}
                    onConfirmDestructive={confirmDestructiveRun}
                    onCancelDestructive={cancelDestructiveRun}
                  />
                ) : tab === "tables" ? (
                  <TablesTab
                    key={selected ? `${selected.schema}.${selected.table}` : "none"}
                    selected={selected}
                    table={table}
                    engine={overview.data?.engine}
                    capabilities={capabilities.data}
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
                    search={tableSearch}
                    onSearchChange={(search) => dispatch({ type: "tableSearchChanged", search })}
                    onTableRenamed={(newName) => dispatch({ type: "tableRenamed", newName })}
                    onTableDropped={() => dispatch({ type: "tableDropped" })}
                  />
                ) : tab === "schema" ? (
                  <SchemaTab
                    allTables={allTables}
                    databaseKey={health?.target ?? null}
                    schemas={overview.data?.schemas ?? []}
                    selectedSchema={selected?.schema}
                    engine={overview.data?.engine}
                    capabilities={capabilities.data}
                  />
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
            </main>
          </div>
        </div>
      )}

      <QueryHistoryDrawer
        open={historyOpen}
        onOpenChange={(open) => dispatch({ type: "historyChanged", open })}
        entries={queryHistory.entries}
        onSelect={selectFromHistory}
        onClear={queryHistory.clear}
      />

      <ConnectDrawer
        open={connectOpen}
        onOpenChange={(open) => dispatch({ type: "connectChanged", open })}
        currentTarget={health?.target ?? null}
        recentTargets={recentTargets.entries}
        onConnect={connectToNewTarget}
        isConnecting={connect.isPending}
        databases={serverDatabasesSupported ? databases.data : undefined}
        databasesLoading={databases.isLoading}
        databasesError={databases.isError ? "Failed to load databases." : undefined}
        currentDatabase={parseTargetDatabase(health?.target)}
        canManageDatabases={canManageDatabases}
        databaseManagementReason={databaseManagementReason(capabilities.data)}
        onSwitchDatabase={switchToDatabase}
        onCreateDatabase={databaseAdmin.createDatabase}
        onDropDatabase={databaseAdmin.dropDatabase}
      />
    </div>
  );
}
