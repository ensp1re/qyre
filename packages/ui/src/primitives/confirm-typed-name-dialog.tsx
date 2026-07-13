import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "../feedback/spinner.js";
import { useFocusTrap } from "./use-focus-trap.js";

export interface ConfirmTypedNameDialogProps {
  title: string;
  description: ReactNode;
  targetName: string;
  confirmLabel: string;
  busy: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Shared typed-confirmation modal for destructive DDL operations (F114) - the confirm button stays
 * disabled until the caller types the target's exact name, re-derived from `DocumentEditorDrawer`'s
 * hand-rolled `deleteConfirmText` pattern (F125) as a reusable dialog, since F114 needs this same
 * shape three times (dropTable/truncateTable/dropColumn), per docs/product-specs/schema-editing.md's
 * typed-confirmation rule.
 */
export function ConfirmTypedNameDialog({
  title,
  description,
  targetName,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose
}: ConfirmTypedNameDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const confirmed = confirmText === targetName;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-typed-name-dialog-title"
        data-testid="confirm-typed-name-dialog"
        className="fixed left-1/2 top-1/2 z-50 flex w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-[3px] border border-border bg-card p-4 outline-none"
      >
        <h2
          id="confirm-typed-name-dialog-title"
          className="font-mono text-[12px] font-medium text-foreground"
        >
          {title}
        </h2>
        <p className="font-mono text-[11px] text-muted-foreground">{description}</p>
        <input
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          aria-label={`Type "${targetName}" to confirm`}
          placeholder={targetName}
          autoFocus
          className="rounded-[3px] border border-border bg-secondary px-2 py-1 font-mono text-[12px] text-foreground outline-none focus:border-foreground/40"
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
            disabled={busy}
            className="rounded-[3px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!confirmed || busy}
            className="flex items-center gap-1.5 rounded-[3px] border px-3 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40"
            style={{ borderColor: "var(--c-red)", color: "var(--c-red)" }}
          >
            {busy && <Spinner className="h-2.5 w-2.5" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
