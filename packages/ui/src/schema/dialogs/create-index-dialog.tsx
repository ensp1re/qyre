import { AlertTriangle, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../../primitives/use-focus-trap.js";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface CreateIndexInput {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface CreateIndexDialogProps {
  table: string;
  availableColumns: string[];
  creating: boolean;
  error?: string;
  onCreate: (index: CreateIndexInput) => void;
  onClose: () => void;
}

export function CreateIndexDialog({
  table,
  availableColumns,
  creating,
  error,
  onCreate,
  onClose
}: CreateIndexDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  const [name, setName] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [unique, setUnique] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function toggleColumn(column: string): void {
    setSelectedColumns((current) =>
      current.includes(column) ? current.filter((c) => c !== column) : [...current, column]
    );
  }

  const nameValid = IDENTIFIER_PATTERN.test(name);
  const canSubmit = !creating && nameValid && selectedColumns.length > 0;

  function handleSubmit(): void {
    if (!canSubmit) return;
    onCreate({ name, columns: selectedColumns, unique });
  }

  const previewText = `CREATE ${unique ? "UNIQUE " : ""}INDEX "${name || "..."}" ON "${table}" (${
    selectedColumns.join(", ") || "..."
  })`;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-index-dialog-title"
        data-testid="create-index-dialog"
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-4rem)] w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-hidden rounded-[3px] border border-border bg-card p-4 outline-none"
      >
        <div className="flex shrink-0 items-center gap-2">
          <h2
            id="create-index-dialog-title"
            className="font-mono text-[12px] font-medium text-foreground"
          >
            New index on {table}
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
              Index name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="my_table_col_idx"
              autoFocus
              aria-label="Index name"
              className="rounded-[3px] border border-border bg-secondary px-2 py-1 font-mono text-[12px] text-foreground outline-none focus:border-foreground/40"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              Columns
            </span>
            <div className="flex flex-col gap-1 rounded-[3px] border border-border p-2">
              {availableColumns.map((column) => (
                <label
                  key={column}
                  className="flex items-center gap-1.5 font-mono text-[11px] text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(column)}
                    onChange={() => toggleColumn(column)}
                  />
                  {column}
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-1.5 font-mono text-[11px] text-foreground">
            <input
              type="checkbox"
              checked={unique}
              onChange={(event) => setUnique(event.target.checked)}
            />
            Unique
          </label>

          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              Preview
            </span>
            <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-[3px] border border-border bg-secondary p-2 font-mono text-[11px] text-foreground">
              {previewText}
            </pre>
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
            {creating ? "Creating..." : "Create index"}
          </button>
        </div>
      </div>
    </>
  );
}
