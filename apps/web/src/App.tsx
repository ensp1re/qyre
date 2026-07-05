import type { ConnectionStatus } from "@humbdb/core";
import {
  ErrorBoundary,
  QueryHistoryDrawer,
  Sidebar,
  Spinner,
  StatusBar,
  TabBar,
  TitleBar,
  type ShellTab
} from "@humbdb/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { ConsoleTab } from "./components/console-tab.js";
import { FilesTab } from "./components/files-tab.js";
import { SchemaTab } from "./components/schema-tab.js";
import { SqlEditorTab } from "./components/sql-editor-tab.js";
import { TablesTab } from "./components/tables-tab.js";
import { useAllTables } from "./hooks/use-all-tables.js";
import { useClearConsole, useConsoleEvents } from "./hooks/use-console.js";
import { useFileContent, useFilesOverview } from "./hooks/use-files.js";
import { useHealth } from "./hooks/use-health.js";
import { useOverview } from "./hooks/use-overview.js";
import { useQueryHistory } from "./hooks/use-query-history.js";
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
  const [selectedFilePath, setSelectedFilePath] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const queryHistory = useQueryHistory();

  const overview = useOverview({ enabled: status === "connected" });
  // MongoDB has no query runner in this pass - no SQL dialect for a read-only backstop to run
  // inside (see docs/product-specs/connect-and-inspect-mongodb.md's "Why this engine is scoped
  // differently"). The tab is disabled rather than left clickable and silently failing every
  // query.
  const isMongo = overview.data?.engine === "mongodb";
  const table = useTable(selected?.schema, selected?.table);
  const rows = useRows(selected?.schema, selected?.table, page);
  const allTables = useAllTables({ enabled: status === "connected" });
  const tableNames = (overview.data?.schemas ?? []).flatMap((schema) => schema.tables);
  const filesOverview = useFilesOverview({ enabled: status === "connected" });
  const fileContent = useFileContent(selectedFilePath);
  const consoleEvents = useConsoleEvents({ enabled: status === "connected" });
  const clearConsole = useClearConsole();
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
          <TabBar
            active={tab}
            onChange={setTab}
            disabledTabs={
              isMongo
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
                    "No database is connected yet. Launch Humb with a Postgres, MySQL, SQLite, or MongoDB target to get started."
                  )}
                </p>
              ) : tab === "sql-editor" ? (
                <SqlEditorTab
                  isMongo={isMongo}
                  sql={querySql}
                  onSqlChange={setQuerySql}
                  onRun={runSql}
                  runQuery={runQuery}
                  onOpenHistory={() => setHistoryOpen(true)}
                  tableNames={tableNames}
                />
              ) : tab === "tables" ? (
                <TablesTab
                  selected={selected}
                  table={table}
                  rows={rows}
                  page={page}
                  onPageChange={setPage}
                  onNavigateToForeignKey={(reference) =>
                    selectTable(reference.schema ?? selected?.schema ?? "", reference.table)
                  }
                />
              ) : tab === "schema" ? (
                <SchemaTab allTables={allTables} />
              ) : tab === "files" ? (
                <FilesTab
                  filesOverview={filesOverview}
                  fileContent={fileContent}
                  selectedFilePath={selectedFilePath}
                  onSelectFile={setSelectedFilePath}
                  onRunInEditor={
                    isMongo
                      ? undefined
                      : (sql) => {
                          setQuerySql(sql);
                          setTab("sql-editor");
                        }
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
    </div>
  );
}
