import type { DatabaseEngine } from "@qyre/core";
import { mutationEditorCapability } from "@qyre/core/mutation-editor-capabilities";
import { Pencil, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../cn.js";
import { IconButton } from "../../primitives/controls/icon-button.js";
import { formatCell, isClickableDateType } from "../../primitives/format-cell.js";
import {
  CellValue,
  classifyUrlValue,
  isBinaryValue,
  isLongString,
  isStructuredValue,
  type InspectableValue
} from "./cell-value.js";
import { CellEditorDrawer } from "../editing/cell-editor-drawer.js";
import { EditorPopover } from "../editing/editor-popover.js";
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
}

/** One mutation-safe grid cell. The display control is the stable focus/activation target; the
 * shared typed editor is overlaid from an invariant-height anchor and stages only after Apply. */
export function EditableCell({
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
  onDeactivate: onDeactivateProp
}: EditableCellProps): ReactNode {
  const [uncontrolledActive, setUncontrolledActive] = useState(false);
  const isActive = isActiveProp ?? uncontrolledActive;
  const onActivate = onActivateProp ?? (() => setUncontrolledActive(true));
  const onDeactivate = onDeactivateProp ?? (() => setUncontrolledActive(false));
  const [anchorRect, setAnchorRect] = useState<DOMRect>();
  const activationRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const metadata = { allowedValues, elementDataType };
  const capability = mutationEditorCapability(dataType, engine, metadata);
  const inspectable = hasInspectAffordance(displayValue, dataType, Boolean(onInspectDate));
  const wide =
    capability.widget === "json" ||
    capability.widget === "array" ||
    capability.widget === "multiline";

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

  if (isActive && anchorRect) {
    const editor = (
      <TypedValueEditor
        column={{ name: columnName, dataType, nullable, allowedValues, elementDataType }}
        engine={engine}
        originalValue={displayValue}
        onApply={(next) => {
          onCommit(next);
          closeEditing();
        }}
        onCancel={closeEditing}
      />
    );

    return (
      <div className="relative h-5 min-w-0" data-testid="cell-editor-anchor">
        {wide ? (
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
      {inspectable ? (
        <>
          <div className="min-w-0 flex-1">
            <CellValue
              value={displayValue}
              dataType={dataType}
              onInspect={(value) => onInspect?.(value)}
              onInspectDate={onInspectDate}
            />
          </div>
          <IconButton
            ref={activationRef}
            label={`Edit ${columnName}`}
            icon={<Pencil className="h-2.5 w-2.5" />}
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              startEditing();
            }}
            onKeyDown={(event) => {
              if (event.key === "F2") {
                event.preventDefault();
                startEditing();
              }
            }}
          />
        </>
      ) : (
        <button
          ref={activationRef}
          type="button"
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
          title={
            dirty ? "Edited - click, Enter, or F2 to change again" : "Click, Enter, or F2 to edit"
          }
          className={cn(
            "min-w-0 flex-1 truncate rounded-sm px-0.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-primary",
            displayValue === null || displayValue === undefined
              ? "italic text-quiet-foreground"
              : "text-foreground"
          )}
        >
          {displayValue === null || displayValue === undefined ? "null" : formatCell(displayValue)}
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
          title="Revert to original value"
          className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}
