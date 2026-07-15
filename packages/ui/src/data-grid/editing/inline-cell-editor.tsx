import type { ColumnMetadata, DatabaseEngine } from "@qyre/core";
import { mutationEditorCapability } from "@qyre/core/mutation-editor-capabilities";
import { mutationValueText, parseMutationDraft } from "@qyre/core/mutation-editor-values";
import { Calendar } from "lucide-react";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";
import { Select } from "../../primitives/controls/select.js";
import { DateTimeInput } from "../../primitives/date-time-input.js";
import { EditorPopover } from "./editor-popover.js";

export type CommitDirection = "enter" | "tab" | "shiftTab";

/** Compact, borderless input styling shared by every free-text inline widget - the cell's own
 * border (drawn by the caller around the whole editing cell) is the "you're editing this" signal,
 * not a separate box around the text (F146). */
const PLAIN_INPUT_CLASS =
  "min-w-0 flex-1 border-0 bg-transparent px-0 font-mono text-[10px] text-foreground outline-none";

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
 * separate Apply/Cancel row, no NULL button (F146). Covers every widget simple enough to edit
 * directly at the cell's own width: text, decimal, boolean, enum, date, and timestamp/time (the
 * latter two as a plain precise text field with an optional compact picker, never a mandatory
 * large form). Clearing a nullable field's text and leaving it auto-stages NULL - there is no
 * separate toggle to find; a nullable cell can also be cleared without entering edit mode at all
 * via Delete/Backspace on the grid's selection. `TypedValueEditor`/`EditorPopover` remain for JSON/
 * array/set and long text, where an anchored popover is still the right shape.
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
   * discarded). An unchanged draft (e.g. blurring to open the date picker, tabbing through without
   * editing, or clicking away without typing) cancels instead of staging a no-op edit that would
   * mark the cell dirty for nothing. Clearing a nullable field's text stages NULL directly - no
   * separate button to hunt for. */
  function commitDraft(rawDraft: string, direction?: CommitDirection): void {
    if (rawDraft === mutationValueText(originalValue, capability)) {
      cancelKeepingNavigation(direction);
      return;
    }
    if (column.nullable && rawDraft.trim() === "") {
      commit(null, direction);
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

  let control: ReactElement;

  if (capability.widget === "boolean") {
    control = (
      <div
        className="min-w-0 flex-1"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <Select
          autoFocus
          label={column.name}
          value={draft === "true" ? "true" : draft === "false" ? "false" : undefined}
          options={[
            { value: "true", label: "True" },
            { value: "false", label: "False" }
          ]}
          onValueChange={(value) => {
            if (value !== draft) commit(value === "true");
            else cancelKeepingNavigation();
          }}
          className="min-h-0 border-0 bg-transparent px-0 py-0 focus-visible:ring-0"
        />
      </div>
    );
  } else if (capability.widget === "enum") {
    control = (
      <Select
        label={column.name}
        value={draft}
        options={(column.allowedValues ?? []).map((value) => ({ value, label: value }))}
        onValueChange={(value) => {
          if (value !== draft) commit(value);
          else cancelKeepingNavigation();
        }}
      />
    );
  } else if (capability.widget === "date") {
    control = (
      <div
        className="flex min-w-0 items-center"
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
      </div>
    );
  } else if (capability.widget === "timestamp" || capability.widget === "time") {
    control = (
      <div className="flex min-w-0 flex-1 items-center gap-1">
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
          className={PLAIN_INPUT_CLASS}
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
        {pickerOpen && pickerAnchorRef.current && (
          <EditorPopover
            anchorRect={pickerAnchorRef.current.getBoundingClientRect()}
            testId="inline-timestamp-picker"
            width={264}
            onDismiss={() => setPickerOpen(false)}
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
      <div className="flex min-w-0 max-w-[700px] flex-1 items-center gap-1">
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
          className={PLAIN_INPUT_CLASS}
        />
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
