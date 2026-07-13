import type {
  ColumnMetadata,
  DatabaseEngine,
  IndexMetadata,
  TableKind,
  TableMetadata
} from "@qyre/core";
import { AlertTriangle, Link, Pencil, Plus, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { TypeIcon } from "../primitives/type-icon.js";
import { ConfirmTypedNameDialog } from "../primitives/confirm-typed-name-dialog.js";
import { AddColumnDialog } from "./add-column-dialog.js";
import type { CreateTableColumnInput } from "./create-table-dialog.js";
import { CreateIndexDialog, type CreateIndexInput } from "./create-index-dialog.js";
import { EditColumnDialog, type EditColumnUpdate } from "./edit-column-dialog.js";
import { TableDetail } from "./table-detail.js";

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
  /** The curated per-engine type catalog (F110) - empty for MongoDB, which has no column DDL. */
  columnTypes: readonly string[];
  /** Whether add/rename/alter/drop-column controls render at all - false for MongoDB (collections
   * have no fixed structure) or a session without `supportsDdl`. */
  canEditColumns: boolean;
  /** Whether create/drop-index controls render - the session's `supportsIndexManagement` flag, a
   * capability independent of `canEditColumns` (F090). */
  canManageIndexes: boolean;
  /** Whether rename/truncate/drop-table controls render - the session's `supportsDdl` flag. */
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

/**
 * The Structure view for a single table/collection (F114) - column and index management plus
 * table-lifecycle actions, permission-gated per docs/product-specs/schema-editing.md. A view,
 * materialized view, or a table/collection with none of the three capabilities renders the existing
 * read-only `TableDetail` instead, so a read-only session (F096/F097) shows zero write affordances,
 * not disabled ones. Never calls the server itself - every `on*` prop is the caller's mutation
 * (packages/ui components don't fetch, per FRONTEND.md); this component owns only which dialog is
 * open and that dialog's own busy/error state, awaiting the caller's promise to know when to close.
 */
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
      // The index list re-renders from the caller's refreshed data either way; a failed drop just
      // leaves the index in place, no separate error surface for this low-risk, immediate action.
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

function ColumnRow({
  column,
  bordered,
  editable,
  onEdit,
  onDrop
}: {
  column: ColumnMetadata;
  bordered: boolean;
  editable: boolean;
  onEdit: () => void;
  onDrop: () => void;
}): ReactNode {
  return (
    <div
      className={
        "flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] hover:bg-accent/50" +
        (bordered ? " border-t border-border-subtle" : "")
      }
    >
      <TypeIcon dataType={column.dataType} />
      <span
        className={column.isPrimaryKey || column.isForeignKey ? "" : "text-foreground/80"}
        style={{
          color: column.isPrimaryKey
            ? "var(--c-amber)"
            : column.isForeignKey
              ? "var(--c-blue)"
              : undefined
        }}
      >
        {column.name}
      </span>
      {column.isPrimaryKey && (
        <span
          className="rounded-[2px] border px-1 text-[8px]"
          style={{
            color: "var(--c-amber)",
            borderColor: "color-mix(in srgb, var(--c-amber) 30%, transparent)"
          }}
        >
          PK
        </span>
      )}
      {column.isForeignKey && (
        <span
          className="flex items-center gap-0.5 rounded-[2px] border px-1 text-[8px]"
          style={{
            color: "var(--c-blue)",
            borderColor: "color-mix(in srgb, var(--c-blue) 30%, transparent)"
          }}
        >
          <Link className="h-2 w-2" />
          FK
        </span>
      )}
      <span className="ml-auto text-[9px] text-muted-foreground/40">{column.dataType}</span>
      {column.nullable && <span className="text-[9px] text-muted-foreground/30">null</span>}
      {editable && (
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit column ${column.name}`}
            className="rounded-[2px] p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-2.5 w-2.5" />
          </button>
          <button
            type="button"
            onClick={onDrop}
            aria-label={`Drop column ${column.name}`}
            className="rounded-[2px] p-1 text-muted-foreground hover:bg-accent"
            style={{ color: "var(--c-red)" }}
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </span>
      )}
    </div>
  );
}

function IndexRow({
  index,
  canManage,
  dropping,
  onDrop
}: {
  index: IndexMetadata;
  canManage: boolean;
  dropping: boolean;
  onDrop: () => void;
}): ReactNode {
  return (
    <li className="flex items-center gap-2">
      <span>
        {index.name} ({index.columns.join(", ")})
        {index.primary ? " · primary key" : index.unique ? " · unique" : ""}
      </span>
      {canManage && !index.primary && (
        <button
          type="button"
          onClick={onDrop}
          disabled={dropping}
          aria-label={`Drop index ${index.name}`}
          className="ml-auto rounded-[2px] p-1 text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          style={{ color: "var(--c-red)" }}
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      )}
    </li>
  );
}
