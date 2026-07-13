import { AlertTriangle, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../primitives/use-focus-trap.js";
import { coerceDefaultValue, type CreateTableColumnInput } from "./create-table-dialog.js";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface AddColumnDialogProps {
  table: string;
  columnTypes: readonly string[];
  creating: boolean;
  error?: string;
  onCreate: (column: CreateTableColumnInput) => void;
  onClose: () => void;
}

/**
 * Add-column flow for F114's Structure view (F111's `POST .../ddl/columns`) - a single-column subset
 * of F113's `CreateTableDialog` form (name, type, nullability, default), reusing its
 * `coerceDefaultValue` coercion so a value like "5" submits as a number the same way it would inside
 * a brand-new table's column list.
 */
export function AddColumnDialog({
  table,
  columnTypes,
  creating,
  error,
  onCreate,
  onClose
}: AddColumnDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  const [name, setName] = useState("");
  const [dataType, setDataType] = useState(columnTypes[0] ?? "");
  const [nullable, setNullable] = useState(true);
  const [defaultText, setDefaultText] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const nameValid = IDENTIFIER_PATTERN.test(name);
  const canSubmit = !creating && nameValid;

  function handleSubmit(): void {
    if (!canSubmit) return;
    onCreate({ name, dataType, nullable, default: coerceDefaultValue(defaultText, dataType) });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-column-dialog-title"
        data-testid="add-column-dialog"
        className="fixed left-1/2 top-1/2 z-50 flex w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-[3px] border border-border bg-card p-4 outline-none"
      >
        <div className="flex items-center gap-2">
          <h2
            id="add-column-dialog-title"
            className="font-mono text-[12px] font-medium text-foreground"
          >
            Add column to {table}
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

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            Column name
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="column_name"
            autoFocus
            aria-label="Column name"
            className="rounded-[3px] border border-border bg-secondary px-2 py-1 font-mono text-[12px] text-foreground outline-none focus:border-foreground/40"
          />
          {name.length > 0 && !nameValid && (
            <span className="font-mono text-[10px]" style={{ color: "var(--c-red)" }}>
              Must start with a letter or underscore, and contain only letters, digits, and
              underscores.
            </span>
          )}
        </label>

        <div className="flex items-center gap-1.5">
          <select
            value={dataType}
            onChange={(event) => setDataType(event.target.value)}
            aria-label="Column type"
            className="rounded-[2px] border border-border bg-secondary px-1.5 py-1 font-mono text-[11px] text-foreground outline-none"
          >
            {columnTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 whitespace-nowrap font-mono text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={!nullable}
              onChange={(event) => setNullable(!event.target.checked)}
            />
            Not null
          </label>
        </div>

        <input
          value={defaultText}
          onChange={(event) => setDefaultText(event.target.value)}
          placeholder="Default value (optional)"
          aria-label="Default value"
          className="rounded-[2px] border border-border bg-secondary px-1.5 py-1 font-mono text-[10px] text-foreground outline-none focus:border-foreground/40"
        />

        {error && (
          <p
            className="flex items-start gap-1.5 font-mono text-[10px]"
            style={{ color: "var(--c-red)" }}
          >
            <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
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
            {creating ? "Adding..." : "Add column"}
          </button>
        </div>
      </div>
    </>
  );
}
