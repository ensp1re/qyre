import type { DatabaseEngine } from "@qyre/core";
import type { KeyboardEvent, ReactNode } from "react";
import { useState } from "react";
import { DateTimeInput } from "../primitives/date-time-input.js";
import { widgetFor } from "./editable-cell.js";

export interface NewRowCellProps {
  /** The value currently staged for this column on the draft row, or `undefined` when the user
   * hasn't touched it yet - an untouched column is omitted from the insert payload entirely (F104),
   * letting the engine apply its own default/auto-generated value rather than the UI guessing one. */
  value: unknown;
  dataType: string;
  engine?: DatabaseEngine;
  nullable: boolean;
  /** Stages this column's value on the draft row. `undefined` clears it back to "untouched". */
  onChange: (next: unknown) => void;
}

/**
 * One cell in a staged new-row draft (F104/F105's Add-row and Duplicate-row) - always in an
 * editing state, unlike `EditableCell`, since a fresh draft has no prior value to fall back to or
 * revert toward. Reuses `EditableCell`'s widget selection (`widgetFor`) so a column's insert editor
 * matches its update editor exactly.
 */
export function NewRowCell({
  value,
  dataType,
  engine,
  nullable,
  onChange
}: NewRowCellProps): ReactNode {
  const widget = widgetFor(dataType, engine);
  const [text, setText] = useState(() =>
    value === null || value === undefined ? "" : String(value)
  );

  function commitText(): void {
    if (text === "") {
      onChange(undefined);
      return;
    }
    if (widget === "number") {
      const parsed = Number(text);
      if (!Number.isNaN(parsed)) onChange(parsed);
      return;
    }
    onChange(text);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      commitText();
    }
  }

  if (widget === "boolean") {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(true)}
          aria-pressed={value === true}
          className="rounded-[2px] border border-border bg-secondary px-1.5 py-0.5 text-foreground/80 aria-pressed:border-primary aria-pressed:text-foreground hover:bg-accent"
        >
          true
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          aria-pressed={value === false}
          className="rounded-[2px] border border-border bg-secondary px-1.5 py-0.5 text-foreground/80 aria-pressed:border-primary aria-pressed:text-foreground hover:bg-accent"
        >
          false
        </button>
        {nullable && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-pressed={value === null}
            className="rounded-[2px] border border-border px-1.5 py-0.5 italic text-muted-foreground aria-pressed:border-primary aria-pressed:text-foreground hover:bg-accent"
          >
            null
          </button>
        )}
      </div>
    );
  }

  if (widget === "date" || widget === "time" || widget === "datetime-local") {
    return (
      <div className="flex items-center gap-1">
        <DateTimeInput
          kind={widget}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(next) => onChange(next === "" ? undefined : next)}
        />
        {nullable && (
          <button
            type="button"
            onClick={() => onChange(null)}
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
    <input
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commitText}
      onKeyDown={handleKeyDown}
      type={widget === "number" ? "number" : "text"}
      inputMode={widget === "number" ? "decimal" : undefined}
      aria-label="New row value"
      placeholder={nullable ? "Value... (blank = default/null)" : "Value... (blank = default)"}
      className="w-full min-w-0 rounded-[3px] border border-border bg-secondary px-1.5 py-0.5 text-foreground outline-none focus:border-primary"
    />
  );
}
