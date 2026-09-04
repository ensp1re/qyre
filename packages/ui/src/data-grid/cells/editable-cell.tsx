import type { DatabaseEngine } from "@qyre/core";
import { mutationEditorCapability } from "@qyre/core/mutation-editor-capabilities";
import { Pencil, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../cn.js";
import { formatCellDisplay, isClickableDateType } from "../../primitives/format-cell.js";
import {
  CellValue,
  isBinaryValue,
  isStructuredValue,
  truncateForDisplay,
  type InspectableValue
} from "./cell-value.js";
import { CellEditorDrawer } from "../editing/cell-editor-drawer.js";
import { EditorPopover } from "../editing/editor-popover.js";
import { type CommitDirection, InlineCellEditor } from "../editing/inline-cell-editor.js";
import { TypedValueEditor } from "../editing/typed-value-editor.js";

function hasInspectAffordance(
  displayValue: unknown,
  dataType: string,
  hasDateInspect: boolean
): boolean {
  return (
    isBinaryValue(displayValue) ||
    isStructuredValue(displayValue) ||
    (hasDateInspect && isClickableDateType(dataType) && typeof displayValue === "string")
  );
}

export interface EditableCellProps {
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
  onInspectDate?: (value: unknown, anchorRect: DOMRect) => void;
  onCommit: (next: unknown) => void;
  onRevert: () => void;
  isActive?: boolean;
  onActivate?: () => void;
  onDeactivate?: () => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onCommitKey?: (direction: CommitDirection) => void;
}

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
  const structured = capability.widget === "json" || capability.widget === "array";
  const drawer =
    structured ||
    capability.widget === "binary" ||
    capability.widget === "xml" ||
    capability.widget === "interval";
  const wide = drawer || capability.widget === "set";

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
        {displayValue === null || displayValue === undefined
          ? "null"
          : truncateForDisplay(formatCellDisplay(displayValue, dataType))}
      </span>
    );
  }

  const cellDisplayText =
    displayValue === null || displayValue === undefined
      ? "null"
      : displayValue === ""
        ? '""'
        : truncateForDisplay(formatCellDisplay(displayValue, dataType));

  if (isActive && !wide) {
    return (
      <>
        <div
          aria-hidden="true"
          data-testid="cell-editor-width-reserve"
          className="invisible flex w-max items-center gap-1 whitespace-nowrap border-l-2 border-transparent pl-1"
        >
          <span className="rounded-sm px-0.5">{cellDisplayText}</span>
        </div>
        <div
          data-testid="cell-editor-anchor"
          data-cell-id={cellId}
          className="absolute inset-0 flex items-center gap-1 bg-background px-1.5"
        >
          <InlineCellEditor
            column={{ name: columnName, dataType, nullable, allowedValues, elementDataType }}
            engine={engine}
            originalValue={displayValue}
            onApply={(next) => {
              onCommit(next);
              closeEditing();
            }}
            onCancel={closeEditing}
            onCommitKey={(direction) => {
              closeEditing();
              onCommitKey?.(direction);
            }}
          />
        </div>
      </>
    );
  }

  let wideEditor: ReactNode = null;
  if (isActive && wide && anchorRect) {
    const editor = (
      <TypedValueEditor
        column={{ name: columnName, dataType, nullable, allowedValues, elementDataType }}
        engine={engine}
        originalValue={displayValue}
        presentation={drawer ? "drawer" : "popover"}
        onExpand={!drawer && !expanded ? () => setExpanded(true) : undefined}
        onApply={(next) => {
          onCommit(next);
          closeEditing();
        }}
        onCancel={closeEditing}
      />
    );
    wideEditor =
      drawer || expanded ? (
        <CellEditorDrawer title={columnName} onClose={closeEditing}>
          {editor}
        </CellEditorDrawer>
      ) : (
        <EditorPopover
          anchorRect={anchorRect}
          testId="cell-editor-surface"
          onDismiss={closeEditing}
        >
          {editor}
        </EditorPopover>
      );
  }

  return (
    <div
      data-selected={isSelected || undefined}
      className="group flex min-w-0 items-center gap-1 border-l-2 border-transparent pl-1"
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
          {cellDisplayText}
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
      {wideEditor}
    </div>
  );
}
