import type { StatementClassification } from "@qyre/core";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useFocusTrap } from "../primitives/use-focus-trap.js";

export interface ConfirmDestructiveStatementDialogProps {
  sql: string;
  classification: StatementClassification;
  running: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A blocking confirmation dialog before a destructive SQL statement runs (F108,
 * docs/product-specs/sql-editor.md's "Write-capable SQL execution") - the client-side half of the
 * server-enforced round-trip `POST /api/query`'s `confirmed` flag requires (F107): confirming here
 * resubmits the exact same statement with `confirmed: true`, never a client-only bypass. Shows the
 * classification and the exact statement text, not a generic "are you sure?" - the whole point is
 * the developer sees precisely what's about to run.
 */
export function ConfirmDestructiveStatementDialog({
  sql,
  classification,
  running,
  onConfirm,
  onCancel
}: ConfirmDestructiveStatementDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onCancel} aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-destructive-statement-title"
        data-testid="confirm-destructive-statement-dialog"
        className="fixed left-1/2 top-1/2 z-50 flex w-[32rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-[3px] border border-border bg-card p-4 outline-none"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--c-red)" }} />
          <h2
            id="confirm-destructive-statement-title"
            className="font-mono text-[12px] font-medium text-foreground"
          >
            Confirm destructive statement
          </h2>
          <span
            data-testid="statement-classification"
            className="ml-auto rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide"
            style={{ borderColor: "var(--c-red)", color: "var(--c-red)" }}
          >
            {classification}
          </span>
        </div>

        <p className="font-mono text-[11px] text-muted-foreground">
          This statement will run against the connected database and cannot be undone. Review it
          before confirming.
        </p>

        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-[3px] border border-border bg-secondary p-2 font-mono text-[11px] text-foreground">
          {sql}
        </pre>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={running}
            className="rounded-[3px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={running}
            className="rounded-[3px] border px-3 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: "var(--c-red)", color: "var(--c-red)" }}
          >
            {running ? "Running..." : "Run anyway"}
          </button>
        </div>
      </div>
    </>
  );
}
