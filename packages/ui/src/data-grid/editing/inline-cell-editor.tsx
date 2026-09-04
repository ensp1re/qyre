import type { ColumnMetadata, DatabaseEngine } from "@qyre/core";
import { mutationEditorCapability } from "@qyre/core/mutation-editor-capabilities";
import { mutationValueText, parseMutationDraft } from "@qyre/core/mutation-editor-values";
import { Calendar } from "lucide-react";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";
import { Select } from "../../primitives/controls/select.js";
import { CalendarPicker } from "../../primitives/date-time-input.js";
import { EditorPopover } from "./editor-popover.js";

export type CommitDirection = "enter" | "tab" | "shiftTab";

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
  onCommitKey?: (direction: CommitDirection) => void;
}

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
  const draftInputRef = useRef<HTMLInputElement>(null);

  function commit(value: unknown, direction?: CommitDirection): void {
    onApply(value);
    if (direction) onCommitKey?.(direction);
  }

  function cancelKeepingNavigation(direction?: CommitDirection): void {
    onCancel();
    if (direction) onCommitKey?.(direction);
  }

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
      commitDraft(event.currentTarget.value, "enter");
    } else if (event.key === "Tab") {
      event.preventDefault();
      commitDraft(event.currentTarget.value, event.shiftKey ? "shiftTab" : "tab");
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
  } else if (
    capability.widget === "date" ||
    capability.widget === "timestamp" ||
    capability.widget === "time"
  ) {
    const hasCalendar = capability.widget === "date" || capability.widget === "timestamp";
    control = (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <input
          ref={draftInputRef}
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
          onBlur={(event) => {
            // Blur can precede React's final onChange render; use the live input value.
            if (!pickerOpen) commitDraft(event.currentTarget.value);
          }}
          onFocus={(event) => event.currentTarget.select()}
          spellCheck={false}
          className={PLAIN_INPUT_CLASS}
        />
        {hasCalendar && (
          <button
            ref={pickerAnchorRef}
            type="button"
            tabIndex={-1}
            aria-label={capability.widget === "date" ? "Open date picker" : "Open date/time picker"}
            title={capability.widget === "date" ? "Open date picker" : "Open date/time picker"}
            // Keep opening the picker from blurring and committing the draft.
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
            width={256}
            onDismiss={() => setPickerOpen(false)}
          >
            <CalendarPicker
              value={draft.slice(0, 10)}
              onChange={(date) => {
                const next =
                  capability.widget === "date"
                    ? date
                    : `${date}${/^\d{4}-\d{2}-\d{2}(.*)$/.exec(draft)?.[1] ?? " 00:00"}`;
                setDraft(next);
                setError(undefined);
                setPickerOpen(false);
                requestAnimationFrame(() => draftInputRef.current?.focus());
              }}
            />
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
          onBlur={(event) => commitDraft(event.currentTarget.value)}
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
