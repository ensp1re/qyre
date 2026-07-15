import type { ColumnMetadata, DatabaseEngine } from "@qyre/core";
import { mutationEditorCapability } from "@qyre/core/mutation-editor-capabilities";
import { mutationValueText, parseMutationDraft } from "@qyre/core/mutation-editor-values";
import { Calendar, Check, X } from "lucide-react";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";
import { cn } from "../../cn.js";
import { Select } from "../../primitives/controls/select.js";
import { DateTimeInput } from "../../primitives/date-time-input.js";
import { EditorPopover } from "./editor-popover.js";

export type CommitDirection = "enter" | "tab" | "shiftTab";

export interface InlineCellEditorProps {
  column: Pick<
    ColumnMetadata,
    "name" | "dataType" | "nullable" | "allowedValues" | "elementDataType"
  >;
  engine?: DatabaseEngine;
  originalValue: unknown;
  onApply: (value: unknown) => void;
  onCancel: () => void;
  /** Fired right after a successful `onApply` triggered by Enter/Tab/Shift+Tab, so the caller can
   * move the grid's selection - spreadsheet-style "commit and advance" instead of a dead end after
   * every edit (F146's answer to "difficult to quickly edit several rows"). */
  onCommitKey?: (direction: CommitDirection) => void;
}

/**
 * A cell editor that replaces the cell's own display in place - no popover chrome, no header, no
 * separate Apply/Cancel row (F146). Covers every widget simple enough to edit directly at
 * roughly the cell's width: text, decimal, boolean, enum, date, and timestamp/time (the latter two
 * as a plain precise text field with an optional compact picker, never a mandatory large form).
 * `TypedValueEditor`/`EditorPopover` remain for JSON/array/set and long text, where an anchored
 * popover is still the right shape.
 */
export function InlineCellEditor({
  column,
  engine,
  originalValue,
  onApply,
  onCancel,
  onCommitKey
}: InlineCellEditorProps): ReactNode {
  const metadata = { allowedValues: column.allowedValues, elementDataType: column.elementDataType };
  const capability = mutationEditorCapability(column.dataType, engine, metadata);
  const [draft, setDraft] = useState(() => mutationValueText(originalValue, capability));
  const [nullDraft, setNullDraft] = useState(originalValue === null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string>();
  const pickerAnchorRef = useRef<HTMLButtonElement>(null);

  function commit(value: unknown, direction?: CommitDirection): void {
    onApply(value);
    if (direction) onCommitKey?.(direction);
  }

  /** Closes without staging anything, but still advances the grid's selection on Enter/Tab so
   * tabbing through unchanged cells keeps moving instead of getting stuck. */
  function cancelKeepingNavigation(direction?: CommitDirection): void {
    onCancel();
    if (direction) onCommitKey?.(direction);
  }

  /** Invalid input keeps the draft and stays open with a compact message (never silently
   * discarded) - the caller decides via `direction`/blur whether that means "stay focused" or
   * "the input just lost focus but the invalid draft is still here to fix". An unchanged draft
   * (e.g. blurring to open the date picker, tabbing through without editing, or clicking away
   * without typing) cancels instead of staging a no-op edit that would mark the cell dirty for
   * nothing. */
  function commitDraft(rawDraft: string, direction?: CommitDirection): void {
    if (nullDraft) {
      if (originalValue === null) {
        cancelKeepingNavigation(direction);
        return;
      }
      commit(null, direction);
      return;
    }
    if (rawDraft === mutationValueText(originalValue, capability)) {
      cancelKeepingNavigation(direction);
      return;
    }
    const result = parseMutationDraft(rawDraft, capability, engine, metadata);
    if (!result.valid) {
      setError(result.error);
      return;
    }
    setError(undefined);
    commit(result.value, direction);
  }

  function handleTextKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    } else if (event.key === "Enter") {
      event.preventDefault();
      commitDraft(draft, "enter");
    } else if (event.key === "Tab") {
      event.preventDefault();
      commitDraft(draft, event.shiftKey ? "shiftTab" : "tab");
    }
  }

  if (column.nullable && nullDraft) {
    return (
      <div
        className="flex h-5 min-w-0 items-center gap-1 rounded-sm border border-primary bg-secondary px-1.5 font-mono text-[10px] italic text-muted-foreground"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          } else if (event.key === "Enter") {
            event.preventDefault();
            commit(null);
          }
        }}
      >
        <span className="flex-1">NULL</span>
        <button
          type="button"
          autoFocus
          aria-label="Clear NULL"
          onClick={() => setNullDraft(false)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-2.5 w-2.5" />
        </button>
        <button
          type="button"
          aria-label="Apply NULL"
          onClick={() => commit(null)}
          className="shrink-0 text-primary hover:text-foreground"
        >
          <Check className="h-2.5 w-2.5" />
        </button>
      </div>
    );
  }

  const nullToggle = column.nullable && (
    <button
      type="button"
      tabIndex={-1}
      title="Set to NULL (Delete)"
      // See the date/time picker button's comment: avoids blurring (and thus committing) the
      // text/number input before this click sets nullDraft.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => setNullDraft(true)}
      className="shrink-0 rounded-[2px] px-1 font-mono text-[9px] italic text-quiet-foreground hover:bg-accent hover:text-foreground"
    >
      NULL
    </button>
  );

  let control: ReactElement;

  if (capability.widget === "boolean") {
    const current = draft === "true";
    control = (
      <div className="flex h-5 items-center gap-1">
        <button
          type="button"
          autoFocus
          role="switch"
          aria-checked={current}
          aria-label={column.name}
          onClick={() => commit(!current)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancel();
          }}
          className={cn(
            "flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px]",
            current
              ? "border-primary text-foreground"
              : "border-border text-muted-foreground hover:bg-accent"
          )}
        >
          <Check className={cn("h-2.5 w-2.5", current ? "opacity-100" : "opacity-0")} />
          {String(current)}
        </button>
        {nullToggle}
      </div>
    );
  } else if (capability.widget === "enum") {
    control = (
      <div className="flex h-5 items-center gap-1">
        <Select
          label={column.name}
          value={draft}
          options={(column.allowedValues ?? []).map((value) => ({ value, label: value }))}
          onValueChange={(value) => commit(value)}
        />
        {nullToggle}
      </div>
    );
  } else if (capability.widget === "date") {
    control = (
      <div
        className="flex h-5 items-center gap-1"
        data-testid="inline-date-editor"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <DateTimeInput
          kind="date"
          value={draft}
          onChange={(value) => {
            setDraft(value);
            commitDraft(value);
          }}
          onEnter={() => commitDraft(draft, "enter")}
          autoFocus
        />
        {nullToggle}
      </div>
    );
  } else if (capability.widget === "timestamp" || capability.widget === "time") {
    control = (
      <div className="flex h-5 min-w-0 items-center gap-1">
        <input
          autoFocus
          aria-label={column.name}
          aria-invalid={Boolean(error)}
          title={error}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(undefined);
          }}
          onKeyDown={handleTextKeyDown}
          onBlur={() => {
            if (!pickerOpen) commitDraft(draft);
          }}
          onFocus={(event) => event.currentTarget.select()}
          spellCheck={false}
          className={cn(
            "min-w-0 flex-1 rounded-sm border bg-secondary px-1 font-mono text-[10px] text-foreground outline-none",
            error ? "border-destructive" : "border-primary"
          )}
        />
        {capability.widget === "timestamp" && (
          <button
            ref={pickerAnchorRef}
            type="button"
            tabIndex={-1}
            aria-label="Open date/time picker"
            title="Open date/time picker"
            // Keeps focus on the text input instead of blurring it - a plain onClick would blur
            // (and thus commit) the input before this button's own click updates `pickerOpen`,
            // staging a spurious no-op edit just from opening the picker.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setPickerOpen((open) => !open)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <Calendar className="h-3 w-3" />
          </button>
        )}
        {nullToggle}
        {pickerOpen && pickerAnchorRef.current && (
          <EditorPopover
            anchorRect={pickerAnchorRef.current.getBoundingClientRect()}
            testId="inline-timestamp-picker"
          >
            <div className="p-2">
              <DateTimeInput
                kind="datetime-local"
                value={draft.replace(" ", "T").slice(0, 16)}
                onChange={(value) => {
                  // The picker only ever edits the "date + HH:MM" prefix - splice it back onto the
                  // existing draft so any seconds/fraction/offset tail is preserved exactly.
                  const tail = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(.*)$/.exec(draft)?.[1] ?? "";
                  setDraft(`${value}${tail}`);
                }}
              />
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="mt-1.5 w-full rounded-[3px] bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground hover:opacity-90"
              >
                Done
              </button>
            </div>
          </EditorPopover>
        )}
      </div>
    );
  } else {
    control = (
      <div className="flex h-5 min-w-0 items-center gap-1">
        <input
          autoFocus
          aria-label={column.name}
          aria-invalid={Boolean(error)}
          title={error}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(undefined);
          }}
          onKeyDown={handleTextKeyDown}
          onBlur={() => commitDraft(draft)}
          onFocus={(event) => event.currentTarget.select()}
          inputMode={capability.widget === "decimal" ? "decimal" : undefined}
          spellCheck={false}
          className={cn(
            "min-w-0 flex-1 rounded-sm border bg-secondary px-1 font-mono text-[10px] text-foreground outline-none",
            error ? "border-destructive" : "border-primary"
          )}
        />
        {nullToggle}
        {error && (
          <span className="shrink-0 font-mono text-[9px]" style={{ color: "var(--c-red)" }}>
            {error}
          </span>
        )}
      </div>
    );
  }

  return control;
}
