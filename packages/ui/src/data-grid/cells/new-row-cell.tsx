import type { DatabaseEngine } from "@qyre/core";
import { mutationEditorCapability } from "@qyre/core/mutation-editor-capabilities";
import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { cn } from "../../cn.js";
import { formatCell } from "../../primitives/format-cell.js";
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
  onChange
}: NewRowCellProps): ReactNode {
  const [editing, setEditing] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect>();
  const activationRef = useRef<HTMLButtonElement>(null);
  const metadata = { allowedValues, elementDataType };
  const capability = mutationEditorCapability(dataType, engine, metadata);

  if (!capability.editable) {
    return (
      <span className="italic text-quiet-foreground" title={capability.unavailableReason}>
        not editable
      </span>
    );
  }

  if (editing && anchorRect) {
    return (
      <div className="relative h-5 min-w-0" data-testid="new-row-editor-anchor">
        <EditorPopover anchorRect={anchorRect} testId="new-row-cell-editor-surface">
          <TypedValueEditor
            column={{ name: columnName, dataType, nullable, allowedValues, elementDataType }}
            engine={engine}
            originalValue={value}
            controlLabel="New row value"
            onApply={(next) => {
              onChange(next);
              setEditing(false);
              requestAnimationFrame(() => activationRef.current?.focus());
            }}
            onCancel={() => {
              setEditing(false);
              requestAnimationFrame(() => activationRef.current?.focus());
            }}
          />
        </EditorPopover>
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
          setEditing(true);
        }}
        className={cn(
          "min-w-0 flex-1 rounded-[2px] border border-border bg-secondary px-1.5 py-0.5 text-left font-mono text-[10px] outline-none focus-visible:border-primary",
          value === undefined ? "italic text-quiet-foreground" : "text-foreground"
        )}
      >
        {value === undefined ? "Set value..." : value === null ? "null" : formatCell(value)}
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
