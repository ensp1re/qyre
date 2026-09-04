import type { ColumnMetadata, DatabaseEngine, TableKind, TableMetadata } from "@qyre/core";
import { AlertTriangle, Pencil, Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { ConfirmTypedNameDialog } from "../../primitives/confirm-typed-name-dialog.js";
import { AddColumnDialog } from "../dialogs/add-column-dialog.js";
import type { CreateTableColumnInput } from "../dialogs/create-table-dialog.js";
import { CreateIndexDialog, type CreateIndexInput } from "../dialogs/create-index-dialog.js";
import { EditColumnDialog, type EditColumnUpdate } from "../dialogs/edit-column-dialog.js";
import { TableDetail } from "./table-detail.js";
import { ColumnRow, IndexRow } from "./table-structure-rows.js";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const KIND_BADGE_LABEL: Partial<Record<TableKind, string>> = {
  view: "VIEW",
  "materialized-view": "MATERIALIZED VIEW"
};

type DialogState =
  | { kind: "addColumn" }
  | { kind: "editColumn"; column: ColumnMetadata }
  | { kind: "dropColumn"; columnName: string }
  | { kind: "createIndex" }
  | { kind: "truncateTable" }
  | { kind: "dropTable" }
  | undefined;

export interface TableStructureProps {
  table: TableMetadata;
  engine: DatabaseEngine | undefined;
  columnTypes: readonly string[];
  canEditColumns: boolean;
  canManageIndexes: boolean;
  canEditTable: boolean;
  onAddColumn: (column: CreateTableColumnInput) => Promise<void>;
  onEditColumn: (columnName: string, update: EditColumnUpdate) => Promise<void>;
  onDropColumn: (columnName: string) => Promise<void>;
  onCreateIndex: (index: CreateIndexInput) => Promise<void>;
  onDropIndex: (indexName: string) => Promise<void>;
  onRenameTable: (newName: string) => Promise<void>;
  onTruncateTable: () => Promise<void>;
  onDropTable: () => Promise<void>;
}

export function TableStructure({
  table,
  engine,
  columnTypes,
  canEditColumns,
  canManageIndexes,
  canEditTable,
  onAddColumn,
  onEditColumn,
  onDropColumn,
  onCreateIndex,
  onDropIndex,
  onRenameTable,
  onTruncateTable,
  onDropTable
}: TableStructureProps): ReactNode {
  const [dialog, setDialog] = useState<DialogState>(undefined);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | undefined>(undefined);
  const [droppingIndex, setDroppingIndex] = useState<string | undefined>(undefined);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState(table.name);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | undefined>(undefined);

  const columnsEditable = canEditColumns && engine !== "mongodb";
  const isMutableKind = table.kind === "table" || table.kind === "collection";
  const canWriteAnything = columnsEditable || canManageIndexes || canEditTable;

  if (!isMutableKind || !canWriteAnything) {
    return <TableDetail table={table} />;
  }

  function openDialog(next: DialogState): void {
    setDialog(next);
    setDialogError(undefined);
  }

  function closeDialog(): void {
    setDialog(undefined);
    setDialogError(undefined);
  }

  async function handleAddColumn(column: CreateTableColumnInput): Promise<void> {
    setDialogBusy(true);
    setDialogError(undefined);
    try {
      await onAddColumn(column);
      closeDialog();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Failed to add column.");
    } finally {
      setDialogBusy(false);
    }
  }

  async function handleEditColumn(columnName: string, update: EditColumnUpdate): Promise<void> {
    setDialogBusy(true);
    setDialogError(undefined);
    try {
      await onEditColumn(columnName, update);
      closeDialog();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Failed to update column.");
    } finally {
      setDialogBusy(false);
    }
  }

  async function handleDropColumn(columnName: string): Promise<void> {
    setDialogBusy(true);
    setDialogError(undefined);
    try {
      await onDropColumn(columnName);
      closeDialog();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Failed to drop column.");
    } finally {
      setDialogBusy(false);
    }
  }

  async function handleCreateIndex(index: CreateIndexInput): Promise<void> {
    setDialogBusy(true);
    setDialogError(undefined);
    try {
      await onCreateIndex(index);
      closeDialog();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Failed to create index.");
    } finally {
      setDialogBusy(false);
    }
  }

  async function handleDropIndex(indexName: string): Promise<void> {
    setDroppingIndex(indexName);
    try {
      await onDropIndex(indexName);
    } catch {
      // A failed drop leaves the refreshed index list unchanged.
    } finally {
      setDroppingIndex(undefined);
    }
  }

  async function handleTruncateTable(): Promise<void> {
    setDialogBusy(true);
    setDialogError(undefined);
    try {
      await onTruncateTable();
      closeDialog();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Failed to truncate table.");
    } finally {
      setDialogBusy(false);
    }
  }

  async function handleDropTable(): Promise<void> {
    setDialogBusy(true);
    setDialogError(undefined);
    try {
      await onDropTable();
      closeDialog();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Failed to drop table.");
    } finally {
      setDialogBusy(false);
    }
  }

  function startRename(): void {
    setRenaming(true);
    setRenameText(table.name);
    setRenameError(undefined);
  }

  async function saveRename(): Promise<void> {
    if (renameText === table.name || !IDENTIFIER_PATTERN.test(renameText)) return;
    setRenameBusy(true);
    setRenameError(undefined);
    try {
      await onRenameTable(renameText);
      setRenaming(false);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Failed to rename table.");
    } finally {
      setRenameBusy(false);
    }
  }

  const renameValid = renameText === table.name || IDENTIFIER_PATTERN.test(renameText);

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div className="overflow-hidden rounded-[3px] border border-border">
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
          {renaming ? (
            <>
              <input
                value={renameText}
                onChange={(event) => setRenameText(event.target.value)}
                autoFocus
                aria-label="New table name"
                className="min-w-0 flex-1 rounded-[2px] border border-border bg-secondary px-1.5 py-0.5 font-mono text-[12px] text-foreground outline-none focus:border-foreground/40"
              />
              <button
                type="button"
                onClick={() => void saveRename()}
                disabled={renameBusy || renameText === table.name || !renameValid}
                className="rounded-[2px] border border-foreground/20 bg-accent px-2 py-0.5 font-mono text-[10px] font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {renameBusy ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setRenaming(false)}
                disabled={renameBusy}
                aria-label="Cancel rename"
                className="rounded-[2px] p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          ) : (
            <>
              <span className="font-mono text-[12px] font-medium text-foreground">
                {table.name}
              </span>
              {KIND_BADGE_LABEL[table.kind] && (
                <span className="rounded-[2px] border border-border px-1 text-[8px] tracking-wide text-muted-foreground">
                  {KIND_BADGE_LABEL[table.kind]}
                </span>
              )}
              {canEditTable && (
                <button
                  type="button"
                  onClick={startRename}
                  aria-label="Rename table"
                  className="rounded-[2px] p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              {table.rowCount !== undefined && (
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  ~{table.rowCount.toLocaleString()} row{table.rowCount === 1 ? "" : "s"}
                </span>
              )}
            </>
          )}
        </div>
        {renameError && (
          <p
            className="flex items-start gap-1.5 border-b border-border px-3 py-1.5 font-mono text-[10px]"
            style={{ color: "var(--c-red)" }}
          >
            <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
            {renameError}
          </p>
        )}

        <div className="bg-background">
          {table.columns.map((column, index) => (
            <ColumnRow
              key={column.name}
              column={column}
              bordered={index !== 0}
              editable={columnsEditable}
              onEdit={() => openDialog({ kind: "editColumn", column })}
              onDrop={() => openDialog({ kind: "dropColumn", columnName: column.name })}
            />
          ))}
        </div>
        {columnsEditable && (
          <div className="border-t border-border bg-card px-3 py-1.5">
            <button
              type="button"
              onClick={() => openDialog({ kind: "addColumn" })}
              className="flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Add column
            </button>
          </div>
        )}

        <div className="border-t border-border bg-card px-3 py-2">
          <ul className="flex flex-col gap-1 font-mono text-[10px] text-muted-foreground">
            {(table.indexes ?? []).map((index) => (
              <IndexRow
                key={index.name}
                index={index}
                canManage={canManageIndexes}
                dropping={droppingIndex === index.name}
                onDrop={() => void handleDropIndex(index.name)}
              />
            ))}
          </ul>
          {canManageIndexes && (
            <button
              type="button"
              onClick={() => openDialog({ kind: "createIndex" })}
              className="mt-1 flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Create index
            </button>
          )}
        </div>

        {canEditTable && (
          <div className="flex items-center gap-2 border-t border-border bg-card px-3 py-2">
            <button
              type="button"
              onClick={() => openDialog({ kind: "truncateTable" })}
              className="rounded-[2px] border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Truncate table
            </button>
            <button
              type="button"
              onClick={() => openDialog({ kind: "dropTable" })}
              className="rounded-[2px] border px-2 py-0.5 font-mono text-[10px]"
              style={{ borderColor: "var(--c-red)", color: "var(--c-red)" }}
            >
              Drop table
            </button>
          </div>
        )}
      </div>

      {dialog?.kind === "addColumn" && (
        <AddColumnDialog
          table={table.name}
          columnTypes={columnTypes}
          creating={dialogBusy}
          error={dialogError}
          onCreate={(column) => void handleAddColumn(column)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "editColumn" && (
        <EditColumnDialog
          table={table.name}
          columnName={dialog.column.name}
          currentDataType={dialog.column.dataType}
          currentNullable={dialog.column.nullable}
          columnTypes={columnTypes}
          saving={dialogBusy}
          error={dialogError}
          onSave={(update) => void handleEditColumn(dialog.column.name, update)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "dropColumn" && (
        <ConfirmTypedNameDialog
          title={`Drop column ${dialog.columnName}`}
          description={`Type the column's name to confirm dropping "${dialog.columnName}" from ${table.name}. This can't be undone.`}
          targetName={dialog.columnName}
          confirmLabel="Drop column"
          busy={dialogBusy}
          error={dialogError}
          onConfirm={() => void handleDropColumn(dialog.columnName)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "createIndex" && (
        <CreateIndexDialog
          table={table.name}
          availableColumns={table.columns.map((column) => column.name)}
          creating={dialogBusy}
          error={dialogError}
          onCreate={(index) => void handleCreateIndex(index)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "truncateTable" && (
        <ConfirmTypedNameDialog
          title={`Truncate ${table.name}`}
          description={`Type the table's name to confirm deleting every row from "${table.name}". The table itself stays; this can't be undone.`}
          targetName={table.name}
          confirmLabel="Truncate table"
          busy={dialogBusy}
          error={dialogError}
          onConfirm={() => void handleTruncateTable()}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "dropTable" && (
        <ConfirmTypedNameDialog
          title={`Drop ${table.name}`}
          description={`Type the table's name to confirm dropping "${table.name}" entirely. This can't be undone.`}
          targetName={table.name}
          confirmLabel="Drop table"
          busy={dialogBusy}
          error={dialogError}
          onConfirm={() => void handleDropTable()}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
