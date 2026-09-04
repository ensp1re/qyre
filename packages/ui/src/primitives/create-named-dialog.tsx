import { AlertTriangle, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "./use-focus-trap.js";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface CreateNamedDialogProps {
  title: string;
  label: string;
  placeholder?: string;
  creating: boolean;
  error?: string;
  onCreate: (name: string) => void;
  onClose: () => void;
}

export function CreateNamedDialog({
  title,
  label,
  placeholder,
  creating,
  error,
  onCreate,
  onClose
}: CreateNamedDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  const [name, setName] = useState("");

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
    onCreate(name);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-named-dialog-title"
        data-testid="create-named-dialog"
        className="fixed left-1/2 top-1/2 z-50 flex w-[24rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-[3px] border border-border bg-card p-4 outline-none"
      >
        <div className="flex items-center gap-2">
          <h2
            id="create-named-dialog-title"
            className="font-mono text-[12px] font-medium text-foreground"
          >
            {title}
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
            {label}
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={placeholder}
            autoFocus
            aria-label={label}
            className="rounded-[3px] border border-border bg-secondary px-2 py-1 font-mono text-[12px] text-foreground outline-none focus:border-foreground/40"
          />
          {name.length > 0 && !nameValid && (
            <span className="font-mono text-[10px]" style={{ color: "var(--c-red)" }}>
              Must start with a letter or underscore, and contain only letters, digits, and
              underscores.
            </span>
          )}
        </label>

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
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </>
  );
}
