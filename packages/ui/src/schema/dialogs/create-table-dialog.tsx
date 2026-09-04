import { Plus, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Select } from "../../primitives/controls/select.js";
import { useFocusTrap } from "../../primitives/use-focus-trap.js";
import { classifyColumnKind } from "../../primitives/type-icon.js";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface ColumnDraft {
  key: string;
  name: string;
  dataType: string;
  nullable: boolean;
  defaultText: string;
}

export interface CreateTableColumnInput {
  readonly name: string;
  readonly dataType: string;
  readonly nullable: boolean;
  readonly default: string | number | boolean | null;
}

export interface CreateTableDialogProps {
  schema: string;
  schemas?: readonly string[];
  onSchemaChange?: (schema: string) => void;
  columnTypes: readonly string[];
  creating: boolean;
  error?: string;
  onCreate: (table: string, columns: CreateTableColumnInput[]) => void;
  onClose: () => void;
}

export function coerceDefaultValue(
  text: string,
  dataType: string
): string | number | boolean | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const kind = classifyColumnKind(dataType);
  if (kind === "numeric") {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  } else if (kind === "boolean") {
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
  }
  return trimmed;
}

function formatDefaultPreview(value: string | number | boolean | null): string {
  if (value === null) return "";
  if (typeof value === "string") return ` DEFAULT '${value.replace(/'/g, "''")}'`;
  return ` DEFAULT ${value}`;
}

function buildPreview(schema: string, table: string, columns: ColumnDraft[]): string {
  if (columns.length === 0) return `CREATE TABLE "${schema}"."${table || "..."}" ()`;
  const lines = columns.map((column) => {
    const parts = [column.name || "...", column.dataType];
    if (!column.nullable) parts.push("NOT NULL");
    return `  ${parts.join(" ")}${formatDefaultPreview(coerceDefaultValue(column.defaultText, column.dataType))}`;
  });
  return `CREATE TABLE "${schema}"."${table || "..."}" (\n${lines.join(",\n")}\n)`;
}

function buildCollectionPreview(table: string): string {
  return `db.createCollection("${table || "..."}")`;
}

let nextColumnKey = 0;
function makeColumnDraft(dataType: string): ColumnDraft {
  nextColumnKey += 1;
  return { key: `col-${nextColumnKey}`, name: "", dataType, nullable: true, defaultText: "" };
}

export function CreateTableDialog({
  schema,
  schemas = [schema],
  onSchemaChange,
  columnTypes,
  creating,
  error,
  onCreate,
  onClose
}: CreateTableDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  const isMongo = columnTypes.length === 0;
  const [table, setTable] = useState("");
  const [columns, setColumns] = useState<ColumnDraft[]>(() =>
    isMongo ? [] : [makeColumnDraft(columnTypes[0] ?? "")]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const tableNameValid = IDENTIFIER_PATTERN.test(table);
  const columnNamesValid =
    isMongo ||
    (columns.length > 0 && columns.every((column) => IDENTIFIER_PATTERN.test(column.name)));
  const canSubmit = !creating && tableNameValid && columnNamesValid;

  function updateColumn(key: string, patch: Partial<ColumnDraft>): void {
    setColumns((current) =>
      current.map((column) => (column.key === key ? { ...column, ...patch } : column))
    );
  }

  function addColumn(): void {
    setColumns((current) => [...current, makeColumnDraft(columnTypes[0] ?? "")]);
  }

  function removeColumn(key: string): void {
    setColumns((current) => current.filter((column) => column.key !== key));
  }

  function handleSubmit(): void {
    if (!canSubmit) return;
    const submittedColumns: CreateTableColumnInput[] = columns.map((column) => ({
      name: column.name,
      dataType: column.dataType,
      nullable: column.nullable,
      default: coerceDefaultValue(column.defaultText, column.dataType)
    }));
    onCreate(table, submittedColumns);
  }

  const previewText = isMongo
    ? buildCollectionPreview(table)
    : buildPreview(schema, table, columns);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-table-dialog-title"
        data-testid="create-table-dialog"
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-4rem)] w-[36rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-hidden rounded-[3px] border border-border bg-card p-4 outline-none"
      >
        <div className="flex shrink-0 items-center gap-2">
          <h2
            id="create-table-dialog-title"
            className="font-mono text-[12px] font-medium text-foreground"
          >
            {isMongo ? "New collection" : "New table"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-[2px] p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {isMongo ? "Collection name" : "Table name"}
            </span>
            <input
              value={table}
              onChange={(event) => setTable(event.target.value)}
              placeholder="my_table"
              autoFocus
              className="rounded-[3px] border border-border bg-secondary px-2 py-1 font-mono text-[12px] text-foreground outline-none focus:border-foreground/40"
            />
            {table.length > 0 && !tableNameValid && (
              <span className="font-mono text-[10px]" style={{ color: "var(--c-red)" }}>
                Must start with a letter or underscore, and contain only letters, digits, and
                underscores.
              </span>
            )}
          </label>

          {!isMongo && (
            <>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  Schema
                </span>
                <Select
                  value={schema}
                  onValueChange={(value) => onSchemaChange?.(value)}
                  label="Schema"
                  options={schemas.map((schemaName) => ({
                    value: schemaName,
                    label: schemaName
                  }))}
                />
              </label>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    Columns
                  </span>
                  <button
                    type="button"
                    onClick={addColumn}
                    className="flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" /> Add column
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {columns.map((column) => (
                    <ColumnRow
                      key={column.key}
                      column={column}
                      columnTypes={columnTypes}
                      removable={columns.length > 1}
                      onChange={(patch) => updateColumn(column.key, patch)}
                      onRemove={() => removeColumn(column.key)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              Preview
            </span>
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-[3px] border border-border bg-secondary p-2 font-mono text-[11px] text-foreground">
              {previewText}
            </pre>
          </div>

          {error && (
            <p className="font-mono text-[11px]" style={{ color: "var(--c-red)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="rounded-[3px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-[3px] border border-foreground/20 bg-accent px-3 py-1 text-[11px] font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating..." : isMongo ? "Create collection" : "Create table"}
          </button>
        </div>
      </div>
    </>
  );
}

function ColumnRow({
  column,
  columnTypes,
  removable,
  onChange,
  onRemove
}: {
  column: ColumnDraft;
  columnTypes: readonly string[];
  removable: boolean;
  onChange: (patch: Partial<ColumnDraft>) => void;
  onRemove: () => void;
}): ReactNode {
  const nameValid = column.name.length === 0 || IDENTIFIER_PATTERN.test(column.name);

  return (
    <div className="flex flex-col gap-1 rounded-[3px] border border-border p-2">
      <div className="flex items-center gap-1.5">
        <input
          value={column.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="column_name"
          aria-label="Column name"
          className="min-w-0 flex-1 rounded-[2px] border border-border bg-secondary px-1.5 py-1 font-mono text-[11px] text-foreground outline-none focus:border-foreground/40"
        />
        <Select
          value={column.dataType}
          onValueChange={(value) => onChange({ dataType: value })}
          label="Column type"
          options={columnTypes.map((dataType) => ({ value: dataType, label: dataType }))}
          className="w-40"
        />
        <label className="flex items-center gap-1 whitespace-nowrap font-mono text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            checked={!column.nullable}
            onChange={(event) => onChange({ nullable: !event.target.checked })}
          />
          Not null
        </label>
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove column"
            className="shrink-0 rounded-[2px] p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <input
        value={column.defaultText}
        onChange={(event) => onChange({ defaultText: event.target.value })}
        placeholder="Default value (optional)"
        aria-label="Default value"
        className="rounded-[2px] border border-border bg-secondary px-1.5 py-1 font-mono text-[10px] text-foreground outline-none focus:border-foreground/40"
      />
      {!nameValid && (
        <span className="font-mono text-[10px]" style={{ color: "var(--c-red)" }}>
          Must start with a letter or underscore, and contain only letters, digits, and underscores.
        </span>
      )}
    </div>
  );
}
