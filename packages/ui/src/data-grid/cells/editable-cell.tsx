import type { DatabaseEngine } from "@qyre/core";
import {
  mutationEditorCapability,
  type MutationEditorWidget
} from "@qyre/core/mutation-editor-capabilities";
import { RotateCcw } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../cn.js";
import { DateTimeInput } from "../../primitives/date-time-input.js";
import { formatCell } from "../../primitives/format-cell.js";

/** A whole-number-looking draft whose value exceeds `Number.MAX_SAFE_INTEGER` - `Number(draft)`
 * would silently round it (SQLite `safeIntegers`/Postgres `bigint` deliver exact values beyond
 * 2^53 as strings precisely to avoid this). Only integer-shaped drafts are checked - ordinary
 * fractional precision loss is expected float behavior, not this bug (F140 review finding U5).
 * Exported so `NewRowCell` applies the identical rule to insert drafts. */
export function isUnsafeIntegerDraft(draft: string): boolean {
  return /^-?\d+$/.test(draft) && !Number.isSafeInteger(Number(draft));
}

export type EditWidget = MutationEditorWidget;

/** Returns only mutation-safe widgets. A null result is a fail-closed contract, never a text-input
 * fallback for a type Qyre cannot round-trip exactly. */
export function widgetFor(dataType: string, engine: DatabaseEngine | undefined): EditWidget | null {
  return mutationEditorCapability(dataType, engine).widget;
}

export interface EditableCellProps {
  /** The value currently staged (if dirty) or the row's real value otherwise - what's displayed
   * and what the editor's draft starts from. */
  displayValue: unknown;
  dataType: string;
  engine?: DatabaseEngine;
  nullable: boolean;
  /** Whether this cell has a staged edit differing from the row's original value. */
  dirty: boolean;
  /** Stages `next` as this cell's edit (F103) - never calls the server itself. */
  onCommit: (next: unknown) => void;
  /** Drops this cell's staged edit, reverting the display back to the row's original value. */
  onRevert: () => void;
}

/**
 * One editable grid cell (F103/DF-11): pointer click, Enter, or F2 starts editing with a type-aware
 * mutation widget (`DateTimeInput` for lossless dates, plain text/number inputs, a
 * boolean picker, plus an explicit "set to null" option when the column is nullable). Edits stage
 * into the caller's pending-changes buffer on commit; nothing here ever calls the server. A dirty
 * cell (a staged edit exists) gets a highlighted ring and a revert button restoring the original
 * value without leaving edit mode.
 */
export function EditableCell({
  displayValue,
  dataType,
  engine,
  nullable,
  dirty,
  onCommit,
  onRevert
}: EditableCellProps): ReactNode {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // Set only when a number draft is rejected for unsafe-integer precision loss (F140/U5) - never
  // blocks committing, just keeps editing open with feedback instead of silently rounding.
  const [precisionError, setPrecisionError] = useState(false);
  const activationRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const capability = mutationEditorCapability(dataType, engine);
  const widget = widgetFor(dataType, engine);

  useEffect(() => {
    if (!editing && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      activationRef.current?.focus();
    }
  }, [editing]);

  function startEditing(): void {
    if (!widget) return;
    setDraft(displayValue === null || displayValue === undefined ? "" : String(displayValue));
    setPrecisionError(false);
    setEditing(true);
  }

  function closeEditing(restoreFocus: boolean): void {
    restoreFocusRef.current = restoreFocus;
    setEditing(false);
    setPrecisionError(false);
  }

  function commit(next: unknown, restoreFocus = true): void {
    onCommit(next);
    closeEditing(restoreFocus);
  }

  function commitDraft(restoreFocus = true): void {
    if (widget === "number") {
      // Unlike text, an empty number draft has no valid "commit as-is" value (empty string isn't
      // a number) - cancels, same as before; the null button below is the explicit way to clear
      // a nullable numeric column (F140/U2).
      if (draft === "") {
        closeEditing(restoreFocus);
        return;
      }
      if (isUnsafeIntegerDraft(draft)) {
        setPrecisionError(true);
        return;
      }
      const parsed = Number(draft);
      if (!Number.isNaN(parsed)) commit(parsed, restoreFocus);
      else closeEditing(restoreFocus);
      return;
    }
    // Text: an empty draft stages an explicit empty string rather than silently cancelling
    // (F140/U2) - the null button below is the separate, explicit way to stage NULL.
    commit(draft, restoreFocus);
  }

  function handleTextKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeEditing(true);
    }
  }

  /** Cancels the date/time/datetime editor on Escape (F140/U4 - it previously had no cancel path
   * at all). Checked on the wrapping container so it fires regardless of which of
   * `DateTimeInput`'s several internal segment inputs currently has focus. No commit-on-blur
   * counterpart: `DateTimeInput` is a compound multi-input widget, and Safari doesn't focus a
   * `<button>` on click by default, so a naive "focus left the container" blur check can't
   * reliably distinguish a real blur from clicking this editor's own null button - Escape is the
   * unambiguous, cross-browser-safe cancel path this fixes. */
  function handleDateContainerKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeEditing(true);
    }
  }

  function editorSurface(content: ReactNode): ReactNode {
    return (
      <div className="relative h-5 min-w-0" data-testid="cell-editor-anchor">
        <div
          data-testid="cell-editor-surface"
          className="absolute left-0 top-1/2 z-20 min-w-full -translate-y-1/2 rounded-md border border-primary bg-popover p-1 shadow-lg"
        >
          {content}
        </div>
      </div>
    );
  }

  if (!widget) {
    return (
      <span
        title={capability.unavailableReason}
        className={cn(
          displayValue === null || displayValue === undefined
            ? "italic text-quiet-foreground"
            : undefined
        )}
      >
        {displayValue === null || displayValue === undefined ? "null" : formatCell(displayValue)}
      </span>
    );
  }

  if (editing) {
    if (widget === "boolean") {
      return editorSurface(
        <div className="flex items-center gap-1">
          <button
            type="button"
            autoFocus
            onClick={() => commit(true)}
            className="rounded-[2px] border border-border bg-secondary px-1.5 py-0.5 text-foreground/80 hover:bg-accent"
          >
            true
          </button>
          <button
            type="button"
            onClick={() => commit(false)}
            className="rounded-[2px] border border-border bg-secondary px-1.5 py-0.5 text-foreground/80 hover:bg-accent"
          >
            false
          </button>
          {nullable && (
            <button
              type="button"
              onClick={() => commit(null)}
              className="rounded-[2px] border border-border px-1.5 py-0.5 italic text-muted-foreground hover:bg-accent"
            >
              null
            </button>
          )}
          <button
            type="button"
            onClick={() => closeEditing(true)}
            aria-label="Cancel edit"
            className="ml-0.5 text-muted-foreground hover:text-foreground"
          >
            esc
          </button>
        </div>
      );
    }

    if (widget === "date") {
      return editorSurface(
        <div className="flex items-center gap-1" onKeyDown={handleDateContainerKeyDown}>
          <DateTimeInput
            kind={widget}
            value={draft}
            onChange={setDraft}
            onEnter={commitDraft}
            autoFocus
          />
          {nullable && (
            <button
              type="button"
              onClick={() => commit(null)}
              className="shrink-0 rounded-[2px] border border-border px-1.5 py-0.5 italic text-muted-foreground hover:bg-accent"
              title="Set to null"
            >
              null
            </button>
          )}
        </div>
      );
    }

    return editorSurface(
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setPrecisionError(false);
          }}
          onKeyDown={handleTextKeyDown}
          onBlur={() => commitDraft(false)}
          type={widget === "number" ? "number" : "text"}
          inputMode={widget === "number" ? "decimal" : undefined}
          aria-label="Edit cell value"
          aria-invalid={precisionError}
          title={
            precisionError
              ? "This number is too large to edit exactly - it would lose precision."
              : undefined
          }
          placeholder={
            widget === "number"
              ? nullable
                ? "Value... (blank cancels - use null to clear)"
                : "Value..."
              : nullable
                ? "Value... (blank commits empty text - use null to clear)"
                : "Value..."
          }
          className={cn(
            "w-full min-w-0 rounded-[3px] border bg-secondary px-1.5 py-0.5 text-foreground outline-none",
            precisionError ? "border-[var(--c-red)]" : "border-primary"
          )}
        />
        {nullable && (
          <button
            type="button"
            // The adjacent input commits its draft onBlur - without this, clicking null would
            // blur-commit the typed draft first and unmount this very button before its own
            // onClick could fire. preventDefault on mousedown stops the input from ever blurring,
            // so onClick below fires normally against still-editing state (F140/U2).
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commit(null)}
            className="shrink-0 rounded-[2px] border border-border px-1.5 py-0.5 italic text-muted-foreground hover:bg-accent"
            title="Set to null"
          >
            null
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 items-center gap-1 rounded-sm border border-transparent"
      style={
        dirty
          ? {
              backgroundColor: "color-mix(in srgb, var(--c-amber) 12%, transparent)",
              borderColor: "var(--c-amber)"
            }
          : undefined
      }
    >
      <button
        ref={activationRef}
        type="button"
        onClick={startEditing}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "F2") {
            event.preventDefault();
            startEditing();
          }
        }}
        title={
          dirty ? "Edited - click, Enter, or F2 to change again" : "Click, Enter, or F2 to edit"
        }
        className={cn(
          "min-w-0 flex-1 rounded-sm px-0.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-primary",
          displayValue === null || displayValue === undefined
            ? "italic text-quiet-foreground"
            : "text-foreground"
        )}
      >
        {displayValue === null || displayValue === undefined ? "null" : formatCell(displayValue)}
      </button>
      {dirty && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRevert();
          }}
          aria-label="Revert cell to original value"
          title="Revert to original value"
          className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}
