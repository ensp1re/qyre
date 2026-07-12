import type {
  ConnectionCapabilities,
  DatabaseEngine,
  ForeignKeyReference,
  RowFilter,
  RowSort
} from "@qyre/core";
import { CommitBar, DocumentEditorDrawer, ErrorState, RowsTable, Spinner } from "@qyre/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  deleteDocument,
  fetchDocumentText,
  insertDocument,
  saveDocument
} from "../api/document.js";
import { commitMutations } from "../api/mutations.js";
import { exportRowsUrl } from "../api/rows.js";
import { buildMutationOps, buildPreviewLine } from "../model/commit-preview.js";
import { computeDocumentEditability } from "../model/document-editability.js";
import { computeTableEditability } from "../model/editability.js";
import { usePendingChanges } from "../model/pending-changes.js";
import type { useRows } from "../model/use-rows.js";
import type { useTable } from "../model/use-table.js";

type DocumentEditorState = { mode: "edit"; id: string } | { mode: "insert" } | undefined;

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
}

/** Triggers a real browser download of the streamed export - not a fetch+Blob, so the download
 * streams straight to disk instead of buffering the whole table in JS memory (F066). */
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

/**
 * Tables tab content - the selected table's paginated row browser, editable inline on SQL engines
 * when session/table permissions allow (F103). `usePendingChanges` is called unconditionally (React
 * hooks rules) even before `selected` is known - the caller keys this whole component by the
 * selected table (see App.tsx) so switching tables remounts it, discarding any staged edits along
 * with every other piece of this component's state, per docs/product-specs/row-editing.md's
 * "switching tables doesn't carry the buffer over" scoping.
 */
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
  onFiltersChange
}: TablesTabProps): ReactNode {
  const pendingChanges = usePendingChanges();
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<
    { message: string; failedIndex?: number } | undefined
  >(undefined);
  const [documentEditor, setDocumentEditor] = useState<DocumentEditorState>(undefined);
  const [documentText, setDocumentText] = useState<string | undefined>(undefined);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [documentDeleting, setDocumentDeleting] = useState(false);
  const [documentError, setDocumentError] = useState<string | undefined>(undefined);

  if (!selected) {
    return <p className="text-[13px] text-muted-foreground">Select a table from the sidebar.</p>;
  }
  // A plain `const`, not the `selected` prop itself: TypeScript only retains narrowing across a
  // nested function's closure boundary for locals it can prove are never reassigned, not for
  // function parameters/props - the handlers below (defined as nested `function` declarations)
  // need this to use `.schema`/`.table` without a redundant `selected &&` check each time.
  const selectedTable = selected;

  if (rows.isLoading) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Spinner /> Loading rows...
        <button
          type="button"
          onClick={rows.cancel}
          className="ml-1 rounded-[3px] border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          Cancel
        </button>
      </p>
    );
  }

  if (rows.isError) {
    return (
      <ErrorState
        message={rows.error instanceof Error ? rows.error.message : "Failed to load rows."}
        onRetry={() => rows.refetch()}
      />
    );
  }

  if (!rows.data) return null;

  const editability = computeTableEditability(table.data, capabilities, engine);
  const documentEditability = computeDocumentEditability(table.data, capabilities, engine);
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
  const previewLines = ops.map(buildPreviewLine);

  async function handleCommit(): Promise<void> {
    setCommitting(true);
    setCommitError(undefined);
    try {
      const result = await commitMutations(ops);
      if (result.committed) {
        pendingChanges.clear();
        rows.refetch();
      } else {
        setCommitError({
          message: `Commit failed and was rolled back at operation ${result.failedIndex + 1}.`,
          failedIndex: result.failedIndex
        });
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

  function openEditDocument(row: Record<string, unknown>): void {
    const id = String(row._id);
    setDocumentEditor({ mode: "edit", id });
    setDocumentError(undefined);
    setDocumentText(undefined);
    setDocumentLoading(true);
    fetchDocumentText(selectedTable.schema, selectedTable.table, id)
      .then((text) => setDocumentText(text))
      .catch((err: unknown) =>
        setDocumentError(err instanceof Error ? err.message : "Failed to load document.")
      )
      .finally(() => setDocumentLoading(false));
  }

  function openInsertDocument(): void {
    setDocumentEditor({ mode: "insert" });
    setDocumentError(undefined);
    setDocumentText("");
  }

  function closeDocumentEditor(): void {
    setDocumentEditor(undefined);
    setDocumentText(undefined);
    setDocumentError(undefined);
  }

  async function handleSaveDocument(text: string): Promise<void> {
    if (!documentEditor) return;
    setDocumentSaving(true);
    setDocumentError(undefined);
    try {
      if (documentEditor.mode === "insert") {
        await insertDocument(selectedTable.schema, selectedTable.table, text);
        closeDocumentEditor();
        rows.refetch();
        return;
      }
      // `documentText` is guaranteed loaded once `Save` is reachable (the drawer only enables it
      // once `loading` is false), so it's the original the editor loaded - the lost-update
      // protection's baseline.
      const result = await saveDocument(
        selectedTable.schema,
        selectedTable.table,
        documentEditor.id,
        text,
        documentText ?? ""
      );
      if (result.matched === 0) {
        setDocumentError("This document was already changed or removed.");
      } else {
        closeDocumentEditor();
        rows.refetch();
      }
    } catch (err) {
      setDocumentError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setDocumentSaving(false);
    }
  }

  async function handleDeleteDocument(): Promise<void> {
    if (!documentEditor || documentEditor.mode !== "edit") return;
    setDocumentDeleting(true);
    setDocumentError(undefined);
    try {
      await deleteDocument(selectedTable.schema, selectedTable.table, documentEditor.id);
      closeDocumentEditor();
      rows.refetch();
    } catch (err) {
      setDocumentError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDocumentDeleting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <RowsTable
          rowPage={rows.data.rowPage}
          columns={table.data?.columns}
          engine={engine}
          tableName={selected.table}
          approxRowCount={table.data?.rowCount}
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
          onExportAllRows={() =>
            downloadExport(exportRowsUrl(selected.schema, selected.table, sort, filters))
          }
          onExportSelectedRows={(csv) => downloadCsv(`${selected.table}-selected.csv`, csv)}
          filters={filters}
          onFiltersChange={onFiltersChange}
          editable={editability.editable}
          editableColumns={editability.editableColumns}
          editingDisabledReason={editability.reason}
          primaryKeyColumns={primaryKeyColumns}
          pendingChanges={pendingChanges}
          canInsert={editability.canInsert}
          insertableColumns={editability.insertableColumns}
          canDelete={editability.canDelete}
          canEditDocument={documentEditability.canEdit}
          onEditDocument={openEditDocument}
          canInsertDocument={documentEditability.canInsert}
          onInsertDocument={openInsertDocument}
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
      {documentEditor && (
        <DocumentEditorDrawer
          mode={documentEditor.mode}
          initialText={documentEditor.mode === "insert" ? "" : documentText}
          loading={documentEditor.mode === "edit" && documentLoading}
          saving={documentSaving}
          deleting={documentDeleting}
          error={documentError}
          canDelete={documentEditability.canDelete}
          documentId={documentEditor.mode === "edit" ? documentEditor.id : undefined}
          onSave={(text) => void handleSaveDocument(text)}
          onDelete={documentEditor.mode === "edit" ? () => void handleDeleteDocument() : undefined}
          onClose={closeDocumentEditor}
        />
      )}
    </div>
  );
}
