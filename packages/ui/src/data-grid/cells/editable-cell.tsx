import type { DatabaseEngine } from "@qyre/core";
import { mutationEditorCapability } from "@qyre/core/mutation-editor-capabilities";
import { Pencil, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../cn.js";
import { formatCell, isClickableDateType } from "../../primitives/format-cell.js";
import {
  CellValue,
  classifyUrlValue,
  isBinaryValue,
  isLongString,
  isStructuredValue,
  LONG_STRING_THRESHOLD,
  type InspectableValue
} from "./cell-value.js";
import { CellEditorDrawer } from "../editing/cell-editor-drawer.js";
import { EditorPopover } from "../editing/editor-popover.js";
import { type CommitDirection, InlineCellEditor } from "../editing/inline-cell-editor.js";
import { TypedValueEditor } from "../editing/typed-value-editor.js";

/** Whether CellValue would render `displayValue` as an interactive inspect chip/link (long string,
 * structured, binary, URL, or a clickable date) rather than plain text - determines whether editing
 * needs its own separate activation control alongside the chip, instead of the chip/value itself
 * doubling as the edit button. */
function hasInspectAffordance(
  displayValue: unknown,
  dataType: string,
  hasDateInspect: boolean
): boolean {
  return (
    isBinaryValue(displayValue) ||
    isStructuredValue(displayValue) ||
    isLongString(displayValue) ||
    Boolean(classifyUrlValue(displayValue)) ||
    (hasDateInspect && isClickableDateType(dataType) && typeof displayValue === "string")
  );
}

export interface EditableCellProps {
  /** A stable id for this cell (e.g. `${rowKey}:${column}`) - lets the grid find and focus this
   * cell's DOM node for keyboard navigation (F146). */
  cellId?: string;
  columnName?: string;
  displayValue: unknown;
  dataType: string;
  allowedValues?: readonly string[];
  elementDataType?: string;
  engine?: DatabaseEngine;
  nullable: boolean;
  dirty: boolean;
  onInspect?: (value: InspectableValue) => void;
  /** Reports a date/timestamp cell click for DateDetailPopover (F070) - passed through to CellValue
   * exactly like the read-only/non-editable path so editable date columns keep the same UTC/local/
   * relative-time detail affordance instead of losing it once a column becomes editable. */
  onInspectDate?: (value: unknown, anchorRect: DOMRect) => void;
  onCommit: (next: unknown) => void;
  onRevert: () => void;
  /** Whether this cell is the table's current single active editor (F146) - only one cell editor
   * may be open across the whole grid at a time, so opening another closes this one. Optional:
   * omitting all three falls back to self-managed local open/close state, so a cell can still be
   * used standalone (e.g. in isolation tests) without a coordinating parent. */
  isActive?: boolean;
  onActivate?: () => void;
  onDeactivate?: () => void;
  /** Whether this cell is the grid's current selection (F146) - a single click selects without
   * editing; double-click, Enter, or F2 then starts editing. Optional, same self-managed fallback
   * as `isActive`. */
  isSelected?: boolean;
  onSelect?: () => void;
  /** Fired after a successful commit triggered by Enter/Tab/Shift+Tab, so the grid can advance
   * selection to the next cell (F146). */
  onCommitKey?: (direction: CommitDirection) => void;
}

/** One mutation-safe grid cell (F146): single click selects, double-click/Enter/F2 edits. Simple
 * types (text, numbers, booleans, enums, dates, timestamps) edit directly in place; JSON/array/set
 * and long text (over `LONG_STRING_THRESHOLD`) use a small anchored popover instead, with an
 * explicit Expand action for the full right-side drawer. Nothing here ever resizes the table or
 * moves the row. */
export function EditableCell({
  cellId,
  columnName = "value",
  displayValue,
  dataType,
  allowedValues,
  elementDataType,
  engine,
  nullable,
  dirty,
  onInspect,
  onInspectDate,
  onCommit,
  onRevert,
  isActive: isActiveProp,
  onActivate: onActivateProp,
  onDeactivate: onDeactivateProp,
  isSelected: isSelectedProp,
  onSelect: onSelectProp,
  onCommitKey
}: EditableCellProps): ReactNode {
  const [uncontrolledActive, setUncontrolledActive] = useState(false);
  const [uncontrolledSelected, setUncontrolledSelected] = useState(false);
  const isActive = isActiveProp ?? uncontrolledActive;
  const isSelected = isSelectedProp ?? uncontrolledSelected;
  const onActivate = onActivateProp ?? (() => setUncontrolledActive(true));
  const onDeactivate = onDeactivateProp ?? (() => setUncontrolledActive(false));
  const onSelect = onSelectProp ?? (() => setUncontrolledSelected(true));
  const [anchorRect, setAnchorRect] = useState<DOMRect>();
  const [expanded, setExpanded] = useState(false);
  const activationRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const metadata = { allowedValues, elementDataType };
  const capability = mutationEditorCapability(dataType, engine, metadata);
  const inspectable = hasInspectAffordance(displayValue, dataType, Boolean(onInspectDate));
  const valueLength =
    typeof displayValue === "string" ? displayValue.length : String(displayValue ?? "").length;
  const wide =
    capability.widget === "json" ||
    capability.widget === "array" ||
    capability.widget === "set" ||
    valueLength > LONG_STRING_THRESHOLD;

  useEffect(() => {
    if (!isActive && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      activationRef.current?.focus();
    }
  }, [isActive]);

  function startEditing(): void {
    if (!capability.editable) return;
    const rect = activationRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchorRect(rect);
    onActivate();
  }

  function closeEditing(): void {
    restoreFocusRef.current = true;
    setExpanded(false);
    onDeactivate();
  }

  if (!capability.editable) {
    return (
      <span
        title={capability.unavailableReason}
        className={cn(
          "block max-w-full truncate",
          displayValue === null || displayValue === undefined
            ? "italic text-quiet-foreground"
            : undefined
        )}
      >
        {displayValue === null || displayValue === undefined ? "null" : formatCell(displayValue)}
      </span>
    );
  }

  if (isActive) {
    if (wide) {
      if (!anchorRect) return null;
      const editor = (
        <TypedValueEditor
          column={{ name: columnName, dataType, nullable, allowedValues, elementDataType }}
          engine={engine}
          originalValue={displayValue}
          onExpand={!expanded ? () => setExpanded(true) : undefined}
          onApply={(next) => {
            onCommit(next);
            closeEditing();
          }}
          onCancel={closeEditing}
        />
      );

      return (
        <div className="relative h-5 min-w-0" data-testid="cell-editor-anchor">
          {expanded ? (
            <CellEditorDrawer title={columnName} onClose={closeEditing}>
              {editor}
            </CellEditorDrawer>
          ) : (
            <EditorPopover anchorRect={anchorRect} testId="cell-editor-surface">
              {editor}
            </EditorPopover>
          )}
        </div>
      );
    }

    return (
      <div data-testid="cell-editor-anchor" data-cell-id={cellId}>
        <InlineCellEditor
          column={{ name: columnName, dataType, nullable, allowedValues, elementDataType }}
          engine={engine}
          originalValue={displayValue}
          onApply={(next) => onCommit(next)}
          onCancel={closeEditing}
          onCommitKey={(direction) => {
            closeEditing();
            onCommitKey?.(direction);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex min-w-0 items-center gap-1 rounded-sm border-l-2 border-transparent pl-1",
        isSelected && "ring-1 ring-inset ring-primary"
      )}
      style={dirty ? { borderLeftColor: "var(--c-amber)" } : undefined}
    >
      {inspectable ? (
        <>
          <div
            className="min-w-0 flex-1"
            data-cell-id={cellId}
            onDoubleClick={(event) => {
              event.stopPropagation();
              startEditing();
            }}
          >
            <CellValue
              value={displayValue}
              dataType={dataType}
              onInspect={(value) => onInspect?.(value)}
              onInspectDate={onInspectDate}
            />
          </div>
          <button
            ref={activationRef}
            type="button"
            aria-label={`Edit ${columnName}`}
            title="Edit"
            onClick={(event) => {
              event.stopPropagation();
              startEditing();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "F2") {
                event.preventDefault();
                startEditing();
              }
            }}
            className="shrink-0 rounded-[2px] p-0.5 text-quiet-foreground opacity-0 outline-none focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-primary group-hover:opacity-100 hover:text-foreground"
          >
            <Pencil className="h-2.5 w-2.5" />
          </button>
        </>
      ) : (
        <button
          ref={activationRef}
          type="button"
          data-cell-id={cellId}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            startEditing();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "F2") {
              event.preventDefault();
              startEditing();
            } else if ((event.key === "Delete" || event.key === "Backspace") && nullable) {
              event.preventDefault();
              onCommit(null);
            }
          }}
          title={
            dirty
              ? "Edited - double-click or Enter to change again"
              : "Double-click or Enter to edit"
          }
          className={cn(
            "min-w-0 flex-1 truncate rounded-sm px-0.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-primary",
            displayValue === null || displayValue === undefined || displayValue === ""
              ? "italic text-quiet-foreground"
              : "text-foreground"
          )}
        >
          {displayValue === null || displayValue === undefined
            ? "null"
            : displayValue === ""
              ? '""'
              : formatCell(displayValue)}
        </button>
      )}
      {dirty && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRevert();
          }}
          aria-label="Revert cell to original value"
          title="Revert to original value (Ctrl/Cmd+Z)"
          className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}
