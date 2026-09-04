import type {
  ConnectionCapabilities,
  DatabaseEngine,
  ForeignKeyReference,
  RowFilter,
  RowSort
} from "@qyre/core";
import {
  CommitBar,
  CsvImportDialog,
  ErrorState,
  RowsTable,
  Spinner,
  TableStructure
} from "@qyre/ui";
import { Rows3, Table2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { commitMutations } from "../api/mutations.js";
import { importCsv, inspectCsvImport, validateCsvImport } from "../api/csv-import.js";
import { exportRowsUrl } from "../api/rows.js";
import { buildMutationOps, buildPreviewLine } from "../model/editing/commit-preview.js";
import { computeCsvImportability } from "../model/transfer/csv-importability.js";
import { computeTableEditability } from "../model/editing/editability.js";
import { computeTableStructureEditability } from "../model/structure/structure-editability.js";
import { usePendingChanges } from "../model/editing/pending-changes.js";
import { useTableDdlMutations } from "../model/structure/use-table-ddl.js";
import { useTableView } from "../model/data/use-table-view.js";
import type { useRows } from "../model/data/use-rows.js";
import type { useTable } from "../model/data/use-table.js";
import { columnTypeCatalogForEngine } from "../../../shared/lib/ddl/column-type-catalog.js";
import { ViewButton } from "../../../shared/ui/view-button.js";

export interface TablesTabProps {
  selected: { schema: string; table: string } | undefined;
  table: ReturnType<typeof useTable>;
  engine?: DatabaseEngine;
  capabilities?: ConnectionCapabilities;
  rows: ReturnType<typeof useRows>;
  page: number;
  onPageChange: (updater: (current: number) => number) => void;
  onNavigateToForeignKey?: (reference: ForeignKeyReference, value: unknown) => void;
  sort: RowSort | undefined;
  onSortChange: (sort: RowSort | undefined) => void;
  filters: RowFilter[] | undefined;
  onFiltersChange: (filters: RowFilter[] | undefined) => void;
  search: string | undefined;
  onSearchChange: (search: string | undefined) => void;
  onTableRenamed?: (newName: string) => void;
  onTableDropped?: () => void;
}

function downloadExport(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.click();
}

function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function TablesTab({
  selected,
  table,
  engine,
  capabilities,
  rows,
  page,
  onPageChange,
  onNavigateToForeignKey,
  sort,
  onSortChange,
  filters,
  onFiltersChange,
  search,
  onSearchChange,
  onTableRenamed,
  onTableDropped
}: TablesTabProps): ReactNode {
  const pendingChanges = usePendingChanges();
  const { view, setView } = useTableView();
  const ddl = useTableDdlMutations(selected?.schema ?? "", selected?.table ?? "");
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<
    { message: string; failedIndex?: number } | undefined
  >(undefined);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const commitRef = useRef<() => void>(() => {});

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        commitRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!selected) {
    return (
      <p className="p-4 text-[13px] text-muted-foreground">Select a table from the sidebar.</p>
    );
  }
  const selectedTable = selected;

  const viewToggle = (
    <div className="flex h-8 shrink-0 items-center border-b border-border bg-card px-2">
      <div className="flex h-full items-stretch">
        <ViewButton
          active={view === "rows"}
          onClick={() => setView("rows")}
          icon={<Rows3 className="h-3 w-3" />}
          label="Rows"
        />
        <ViewButton
          active={view === "structure"}
          onClick={() => setView("structure")}
          icon={<Table2 className="h-3 w-3" />}
          label="Structure"
        />
      </div>
      <span className="ml-auto truncate font-mono text-[10px] text-quiet-foreground">
        {selected.schema}.<span className="text-foreground/75">{selected.table}</span>
      </span>
    </div>
  );

  if (view === "structure") {
    if (table.isLoading) {
      return (
        <div className="flex h-full flex-col">
          {viewToggle}
          <div className="flex flex-1 items-center justify-center">
            <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Spinner /> Loading table...
            </p>
          </div>
        </div>
      );
    }
    if (table.isError) {
      return (
        <div className="flex h-full flex-col">
          {viewToggle}
          <ErrorState
            message={table.error instanceof Error ? table.error.message : "Failed to load table."}
            onRetry={() => table.refetch()}
          />
        </div>
      );
    }
    if (!table.data) return null;

    const structureEditability = computeTableStructureEditability(table.data, capabilities, engine);

    return (
      <div className="flex h-full flex-col">
        {viewToggle}
        <div className="min-h-0 flex-1 overflow-auto">
          <TableStructure
            table={table.data}
            engine={engine}
            columnTypes={columnTypeCatalogForEngine(engine)}
            canEditColumns={structureEditability.canEditColumns}
            canManageIndexes={structureEditability.canManageIndexes}
            canEditTable={structureEditability.canEditTable}
            onAddColumn={ddl.addColumn}
            onEditColumn={ddl.editColumn}
            onDropColumn={ddl.dropColumn}
            onCreateIndex={ddl.createIndex}
            onDropIndex={ddl.dropIndex}
            onRenameTable={async (newName) => {
              await ddl.renameTable(newName);
              onTableRenamed?.(newName);
            }}
            onTruncateTable={ddl.truncateTable}
            onDropTable={async () => {
              await ddl.dropTable();
              onTableDropped?.();
            }}
          />
        </div>
      </div>
    );
  }

  if (rows.isLoading) {
    return (
      <div className="flex h-full flex-col">
        {viewToggle}
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Spinner /> Loading rows...
          </p>
          <button
            type="button"
            onClick={rows.cancel}
            className="rounded-[3px] border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (rows.isError) {
    return (
      <div className="flex h-full flex-col">
        {viewToggle}
        <ErrorState
          message={rows.error instanceof Error ? rows.error.message : "Failed to load rows."}
          onRetry={() => rows.refetch()}
        />
      </div>
    );
  }

  if (!rows.data) return null;

  const editability = computeTableEditability(table.data, capabilities, engine);
  const csvImportability = computeCsvImportability(table.data, capabilities, engine);
  const primaryKeyColumns = (table.data?.columns ?? [])
    .filter((column) => column.isPrimaryKey)
    .map((column) => column.name);

  const ops = buildMutationOps(
    selected.schema,
    selected.table,
    pendingChanges.edits,
    pendingChanges.inserts,
    pendingChanges.deletes
  );
  const previewLines = ops.map((op) =>
    buildPreviewLine(op, engine === "mongodb" ? "mongodb" : undefined)
  );

  async function handleCommit(): Promise<void> {
    setCommitting(true);
    setCommitError(undefined);
    try {
      const result = await commitMutations(ops);
      if (result.committed) {
        pendingChanges.clear();
        rows.refetch();
      } else {
        const applied = result.appliedCount ?? 0;
        setCommitError({
          message:
            engine === "mongodb" && applied > 0
              ? `MongoDB commit stopped at operation ${result.failedIndex + 1}; ${applied} earlier operation(s) were applied. Rows were refreshed.`
              : engine === "mongodb"
                ? `MongoDB commit stopped at operation ${result.failedIndex + 1}; no changes were applied.`
                : `Commit failed and was rolled back at operation ${result.failedIndex + 1}.`,
          failedIndex: result.failedIndex
        });
        if (engine === "mongodb" && applied > 0) {
          pendingChanges.clear();
          rows.refetch();
        }
      }
    } catch (err) {
      setCommitError({ message: err instanceof Error ? err.message : "Commit failed." });
    } finally {
      setCommitting(false);
    }
  }

  function handleDiscard(): void {
    pendingChanges.clear();
    setCommitError(undefined);
  }

  commitRef.current = () => {
    if (ops.length > 0 && !committing) void handleCommit();
  };

  return (
    <div className="flex h-full flex-col">
      {viewToggle}
      <div className="min-h-0 flex-1">
        <RowsTable
          rowPage={rows.data.rowPage}
          columns={table.data?.columns}
          engine={engine}
          tableName={selected.table}
          tableKind={table.data?.kind}
          approxRowCount={table.data?.rowCount}
          matchingRowCount={rows.data.rowPage.total}
          page={page}
          canGoPrevious={page > 0}
          canGoNext={rows.data.hasMore}
          onPrevious={() => onPageChange((current) => Math.max(0, current - 1))}
          onNext={() => onPageChange((current) => current + 1)}
          onRefresh={() => rows.refetch()}
          onNavigateToForeignKey={onNavigateToForeignKey}
          sortColumn={sort?.column}
          sortDirection={sort?.direction}
          onSortChange={onSortChange}
          exportFormats={capabilities?.rowExportFormats}
          jsonExportMode={capabilities?.jsonExportMode}
          onExportAllRows={(format) =>
            void exportRowsUrl(selected.schema, selected.table, format, sort, filters, search).then(
              downloadExport
            )
          }
          onExportSelectedRows={(csv) => downloadCsv(`${selected.table}-selected.csv`, csv)}
          canImportCsv={csvImportability.canImport && ops.length === 0}
          onImportCsv={() => setCsvImportOpen(true)}
          filters={filters}
          onFiltersChange={onFiltersChange}
          tableSearch={search}
          onTableSearchChange={onSearchChange}
          searchLoading={Boolean(search) && rows.isFetching}
          editable={editability.editable}
          editableColumns={editability.editableColumns}
          editingDisabledReason={editability.reason}
          primaryKeyColumns={primaryKeyColumns}
          pendingChanges={pendingChanges}
          canInsert={editability.canInsert}
          insertableColumns={editability.insertableColumns}
          canDelete={editability.canDelete}
        />
      </div>
      <CommitBar
        insertCount={pendingChanges.inserts.length}
        updateCount={pendingChanges.edits.size}
        deleteCount={pendingChanges.deletes.size}
        previewLines={previewLines}
        onCommit={() => void handleCommit()}
        onDiscard={handleDiscard}
        committing={committing}
        error={commitError?.message}
        failedIndex={commitError?.failedIndex}
      />
      {csvImportOpen && (
        <CsvImportDialog
          tableName={selected.table}
          columns={csvImportability.columns}
          onInspect={(file) => inspectCsvImport(selectedTable.schema, selectedTable.table, file)}
          onValidate={(file, nextMapping) =>
            validateCsvImport(selectedTable.schema, selectedTable.table, file, nextMapping)
          }
          onImport={(file, nextMapping) =>
            importCsv(selectedTable.schema, selectedTable.table, file, nextMapping)
          }
          onImported={() => rows.refetch()}
          onClose={() => setCsvImportOpen(false)}
        />
      )}
    </div>
  );
}
