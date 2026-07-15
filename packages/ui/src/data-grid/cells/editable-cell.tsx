import type { DatabaseEngine } from "@qyre/core";
import { mutationEditorCapability } from "@qyre/core/mutation-editor-capabilities";
import { Pencil, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../cn.js";
import { IconButton } from "../../primitives/controls/icon-button.js";
import { formatCell } from "../../primitives/format-cell.js";
import { CellValue, isStructuredValue, type InspectableValue } from "./cell-value.js";
import { EditorPopover } from "../editing/editor-popover.js";
import { TypedValueEditor } from "../editing/typed-value-editor.js";

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
  onCommit: (next: unknown) => void;
  onRevert: () => void;
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
  onCommit,
  onRevert
}: EditableCellProps): ReactNode {
  const [editing, setEditing] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect>();
  const activationRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const metadata = { allowedValues, elementDataType };
  const capability = mutationEditorCapability(dataType, engine, metadata);
  const inspectableStructured = isStructuredValue(displayValue) && Boolean(onInspect);

  useEffect(() => {
    if (!editing && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      activationRef.current?.focus();
    }
  }, [editing]);

  function startEditing(): void {
    if (!capability.editable) return;
    const rect = activationRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchorRect(rect);
    setEditing(true);
  }

  function closeEditing(): void {
    restoreFocusRef.current = true;
    setEditing(false);
  }

  if (!capability.editable) {
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

  if (editing && anchorRect) {
    return (
      <div className="relative h-5 min-w-0" data-testid="cell-editor-anchor">
        <EditorPopover anchorRect={anchorRect} testId="cell-editor-surface">
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
        </EditorPopover>
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
      {inspectableStructured ? (
        <>
          <div className="min-w-0 flex-1">
            <CellValue
              value={displayValue}
              dataType={dataType}
              onInspect={(value) => onInspect?.(value)}
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
            "min-w-0 flex-1 rounded-sm px-0.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-primary",
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
