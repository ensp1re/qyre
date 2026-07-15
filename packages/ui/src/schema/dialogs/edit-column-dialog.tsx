import { AlertTriangle, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Select } from "../../primitives/controls/select.js";
import { useFocusTrap } from "../../primitives/use-focus-trap.js";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface EditColumnUpdate {
  newName?: string;
  changes?: { dataType?: string; nullable?: boolean };
}

export interface EditColumnDialogProps {
  table: string;
  columnName: string;
  currentDataType: string;
  currentNullable: boolean;
  columnTypes: readonly string[];
  saving: boolean;
  error?: string;
  onSave: (update: EditColumnUpdate) => void;
  onClose: () => void;
}

/**
 * Rename-and/or-alter a column in one submission (F114), matching `PATCH .../ddl/columns/:column`'s
 * combined shape (F111) - only the fields that actually changed are sent, per the route's own "at
 * least one of newName/changes" requirement. Default-value editing is deliberately out of scope
 * here (kept to name/type/nullability), mirroring F113's precedent of narrowing a form's scope
 * rather than exposing every field the API could theoretically accept.
 */
export function EditColumnDialog({
  table,
  columnName,
  currentDataType,
  currentNullable,
  columnTypes,
  saving,
  error,
  onSave,
  onClose
}: EditColumnDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  const [name, setName] = useState(columnName);
  const [dataType, setDataType] = useState(currentDataType);
  const [nullable, setNullable] = useState(currentNullable);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const nameValid = IDENTIFIER_PATTERN.test(name);
  const nameChanged = name !== columnName;
  const typeChanged = dataType !== currentDataType;
  const nullableChanged = nullable !== currentNullable;
  const hasChanges = nameChanged || typeChanged || nullableChanged;
  const canSubmit = !saving && nameValid && hasChanges;

  function handleSubmit(): void {
    if (!canSubmit) return;
    const update: EditColumnUpdate = {};
    if (nameChanged) update.newName = name;
    if (typeChanged || nullableChanged) {
      update.changes = {
        ...(typeChanged ? { dataType } : {}),
        ...(nullableChanged ? { nullable } : {})
      };
    }
    onSave(update);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-column-dialog-title"
        data-testid="edit-column-dialog"
        className="fixed left-1/2 top-1/2 z-50 flex w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-[3px] border border-border bg-card p-4 outline-none"
      >
        <div className="flex items-center gap-2">
          <h2
            id="edit-column-dialog-title"
            className="font-mono text-[12px] font-medium text-foreground"
          >
            Edit {table}.{columnName}
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
            aria-label="Column name"
            autoFocus
            className="rounded-[3px] border border-border bg-secondary px-2 py-1 font-mono text-[12px] text-foreground outline-none focus:border-foreground/40"
          />
          {!nameValid && (
            <span className="font-mono text-[10px]" style={{ color: "var(--c-red)" }}>
              Must start with a letter or underscore, and contain only letters, digits, and
              underscores.
            </span>
          )}
        </label>

        <div className="flex items-center gap-1.5">
          <Select
            value={dataType}
            onValueChange={setDataType}
            label="Column type"
            options={columnTypes.map((type) => ({ value: type, label: type }))}
            className="w-40"
          />
          <label className="flex items-center gap-1 whitespace-nowrap font-mono text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={!nullable}
              onChange={(event) => setNullable(!event.target.checked)}
            />
            Not null
          </label>
        </div>

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
            disabled={saving}
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
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}
