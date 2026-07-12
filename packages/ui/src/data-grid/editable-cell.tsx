import type { DatabaseEngine } from "@qyre/core";
import { classifyFilterColumnKind } from "@qyre/core/filter-capabilities";
import { RotateCcw } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useState } from "react";
import { cn } from "../cn.js";
import { DateTimeInput, type DateTimeInputKind } from "../primitives/date-time-input.js";
import { formatCell } from "../primitives/format-cell.js";

export type EditWidget = "text" | "number" | "boolean" | DateTimeInputKind;

/** Maps a column's `FilterColumnKind` (F082/F089) to the inline editor widget it gets - the same
 * kind classification `RowsTable`'s caller already used to decide whether this column is editable
 * at all, so a column that reaches this component always has a defined widget. Exported so
 * `NewRowCell` (F104) can pick the identical widget for a column's insert editor. */
export function widgetFor(dataType: string, engine: DatabaseEngine | undefined): EditWidget {
  switch (classifyFilterColumnKind(dataType, engine)) {
    case "numeric":
      return "number";
    case "boolean":
      return "boolean";
    case "date":
      return "date";
    case "time":
      return "time";
    case "datetime":
      return "datetime-local";
    default:
      return "text";
  }
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
 * One editable grid cell (F103): double-click or Enter starts inline editing with a type-aware
 * widget (reusing F082/F089's filter value controls - `DateTimeInput`, plain text/number inputs, a
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
  const widget = widgetFor(dataType, engine);

  function startEditing(): void {
    setDraft(displayValue === null || displayValue === undefined ? "" : String(displayValue));
    setEditing(true);
  }

  function commit(next: unknown): void {
    onCommit(next);
    setEditing(false);
  }

  function commitDraft(): void {
    if (draft === "") {
      setEditing(false);
      return;
    }
    if (widget === "number") {
      const parsed = Number(draft);
      if (!Number.isNaN(parsed)) commit(parsed);
      else setEditing(false);
      return;
    }
    commit(draft);
  }

  function handleTextKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
    }
  }

  if (editing) {
    if (widget === "boolean") {
      return (
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
            onClick={() => setEditing(false)}
            aria-label="Cancel edit"
            className="ml-0.5 text-muted-foreground hover:text-foreground"
          >
            esc
          </button>
        </div>
      );
    }

    if (widget === "date" || widget === "time" || widget === "datetime-local") {
      return (
        <div className="flex items-center gap-1">
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

    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleTextKeyDown}
        onBlur={commitDraft}
        type={widget === "number" ? "number" : "text"}
        inputMode={widget === "number" ? "decimal" : undefined}
        aria-label="Edit cell value"
        placeholder={
          nullable ? "Value... (empty cancels, use null button below to clear)" : "Value..."
        }
        className="w-full min-w-0 rounded-[3px] border border-primary bg-secondary px-1.5 py-0.5 text-foreground outline-none"
      />
    );
  }

  return (
    <div
      tabIndex={0}
      role="button"
      onDoubleClick={startEditing}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          startEditing();
        }
      }}
      title={dirty ? "Edited - double-click to change again" : "Double-click to edit"}
      className="flex items-center gap-1 rounded-[2px] border border-transparent px-0.5 outline-none focus-visible:ring-1 focus-visible:ring-primary"
      style={
        dirty
          ? {
              backgroundColor: "color-mix(in srgb, var(--c-amber) 12%, transparent)",
              borderColor: "var(--c-amber)"
            }
          : undefined
      }
    >
      <span
        className={cn(
          displayValue === null || displayValue === undefined
            ? "italic text-muted-foreground/30"
            : undefined
        )}
      >
        {displayValue === null || displayValue === undefined ? "null" : formatCell(displayValue)}
      </span>
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
