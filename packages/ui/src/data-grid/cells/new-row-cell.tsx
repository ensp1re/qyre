import type { DatabaseEngine } from "@qyre/core";
import { mutationEditorCapability } from "@qyre/core/mutation-editor-capabilities";
import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { cn } from "../../cn.js";
import { formatCell } from "../../primitives/format-cell.js";
import { LONG_STRING_THRESHOLD, truncateForDisplay } from "./cell-value.js";
import { CellEditorDrawer } from "../editing/cell-editor-drawer.js";
import { InlineCellEditor } from "../editing/inline-cell-editor.js";
import { TypedValueEditor } from "../editing/typed-value-editor.js";
import { EditorPopover } from "../editing/editor-popover.js";

export interface NewRowCellProps {
  columnName?: string;
  value: unknown;
  dataType: string;
  allowedValues?: readonly string[];
  elementDataType?: string;
  engine?: DatabaseEngine;
  nullable: boolean;
  onChange: (next: unknown) => void;
  /** Whether this cell is the table's current single active editor (F146). Optional: omitting all
   * three falls back to self-managed local open/close state (e.g. for standalone/test usage). */
  isActive?: boolean;
  onActivate?: () => void;
  onDeactivate?: () => void;
}

/** Temporary grid-hosted insert cell. It uses the same typed editor registry as updates; DF-13
 * moves this activation into the dedicated row composer without changing the value contract. */
export function NewRowCell({
  columnName = "value",
  value,
  dataType,
  allowedValues,
  elementDataType,
  engine,
  nullable,
  onChange,
  isActive: isActiveProp,
  onActivate: onActivateProp,
  onDeactivate: onDeactivateProp
}: NewRowCellProps): ReactNode {
  const [uncontrolledActive, setUncontrolledActive] = useState(false);
  const isActive = isActiveProp ?? uncontrolledActive;
  const onActivate = onActivateProp ?? (() => setUncontrolledActive(true));
  const onDeactivate = onDeactivateProp ?? (() => setUncontrolledActive(false));
  const [anchorRect, setAnchorRect] = useState<DOMRect>();
  const [expanded, setExpanded] = useState(false);
  const activationRef = useRef<HTMLButtonElement>(null);
  const metadata = { allowedValues, elementDataType };
  const capability = mutationEditorCapability(dataType, engine, metadata);
  const valueLength = typeof value === "string" ? value.length : String(value ?? "").length;
  const wide =
    capability.widget === "json" ||
    capability.widget === "array" ||
    capability.widget === "set" ||
    valueLength > LONG_STRING_THRESHOLD;

  if (!capability.editable) {
    return (
      <span className="italic text-quiet-foreground" title={capability.unavailableReason}>
        not editable
      </span>
    );
  }

  function close(): void {
    setExpanded(false);
    onDeactivate();
    requestAnimationFrame(() => activationRef.current?.focus());
  }

  if (isActive && wide) {
    if (!anchorRect) return null;
    const editor = (
      <TypedValueEditor
        column={{ name: columnName, dataType, nullable, allowedValues, elementDataType }}
        engine={engine}
        originalValue={value}
        controlLabel="New row value"
        onExpand={!expanded ? () => setExpanded(true) : undefined}
        onApply={(next) => {
          onChange(next);
          close();
        }}
        onCancel={close}
      />
    );

    return (
      <div className="relative h-5 min-w-0" data-testid="new-row-editor-anchor">
        {expanded ? (
          <CellEditorDrawer title={columnName} onClose={close}>
            {editor}
          </CellEditorDrawer>
        ) : (
          <EditorPopover anchorRect={anchorRect} testId="new-row-cell-editor-surface">
            {editor}
          </EditorPopover>
        )}
      </div>
    );
  }

  if (isActive) {
    return (
      <div data-testid="new-row-editor-anchor">
        <InlineCellEditor
          column={{ name: columnName, dataType, nullable, allowedValues, elementDataType }}
          engine={engine}
          originalValue={value}
          onApply={(next) => onChange(next)}
          onCancel={close}
          onCommitKey={close}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <button
        ref={activationRef}
        type="button"
        aria-label={value === undefined ? `Set ${columnName}` : `Edit ${columnName}`}
        onClick={() => {
          const rect = activationRef.current?.getBoundingClientRect();
          if (!rect) return;
          setAnchorRect(rect);
          onActivate();
        }}
        className={cn(
          "min-w-0 flex-1 truncate rounded-[2px] border border-border bg-secondary px-1.5 py-0.5 text-left font-mono text-[10px] outline-none focus-visible:border-primary",
          value === undefined ? "italic text-quiet-foreground" : "text-foreground"
        )}
      >
        {value === undefined
          ? "Set value..."
          : value === null
            ? "null"
            : truncateForDisplay(formatCell(value))}
      </button>
      {value !== undefined && (
        <button
          type="button"
          aria-label={`Use default for ${columnName}`}
          title="Leave untouched and use the database default"
          onClick={() => onChange(undefined)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}
