import type { ColumnMetadata, DatabaseEngine } from "@qyre/core";
import { mutationEditorCapability } from "@qyre/core/mutation-editor-capabilities";
import {
  mutationValueText,
  parseMutationDraft,
  validateMutationValue
} from "@qyre/core/mutation-editor-values";
import { Check, Maximize2 } from "lucide-react";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { useState } from "react";
import { cn } from "../../cn.js";
import { Button } from "../../primitives/controls/button.js";
import { Field } from "../../primitives/controls/field.js";
import { EditorActions } from "./editor-actions.js";
import { StructuredTextEditor } from "./structured-text-editor.js";

export interface TypedValueEditorProps {
  column: Pick<
    ColumnMetadata,
    "name" | "dataType" | "nullable" | "allowedValues" | "elementDataType"
  >;
  engine?: DatabaseEngine;
  originalValue: unknown;
  controlLabel?: string;
  onApply: (value: unknown) => void;
  onCancel: () => void;
  /** The drawer already names the edited column, so structured editors can omit duplicate
   * metadata and explanatory chrome. */
  presentation?: "popover" | "drawer";
  /** Reveals a small "Expand" action opening the same value in the full right-side drawer instead
   * of this anchored popover (F146) - an explicit, occasional escape hatch, never the default. */
  onExpand?: () => void;
}

function setInitialValue(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((member): member is string => typeof member === "string");
  if (typeof value === "string" && value.length > 0) return value.split(",");
  return [];
}

/**
 * The full-value editor for widgets too large for in-place editing (F146). JSON/arrays use its
 * streamlined drawer presentation; SET retains the anchored popover and optional drawer expansion.
 */
export function TypedValueEditor({
  column,
  engine,
  originalValue,
  controlLabel = "Edit cell value",
  onApply,
  onCancel,
  presentation = "popover",
  onExpand
}: TypedValueEditorProps): ReactNode {
  const metadata = {
    allowedValues: column.allowedValues,
    elementDataType: column.elementDataType
  };
  const capability = mutationEditorCapability(column.dataType, engine, metadata);
  const initialText = mutationValueText(originalValue, capability);
  const [draft, setDraft] = useState(initialText);
  const [selectedSet, setSelectedSet] = useState(() => setInitialValue(originalValue));
  const [nullDraft, setNullDraft] = useState(originalValue === null);
  const [error, setError] = useState<string>();

  function candidate(): unknown {
    if (nullDraft) return null;
    if (capability.widget === "set") return selectedSet;
    const result = parseMutationDraft(draft, capability, engine, metadata);
    if (!result.valid) throw new Error(result.error);
    return result.value;
  }

  function apply(): void {
    if (nullDraft) {
      onApply(null);
      return;
    }
    try {
      const value = candidate();
      const result = validateMutationValue(capability, value, engine, metadata);
      if (!result.valid) {
        setError(result.error);
        return;
      }
      setError(undefined);
      onApply(result.value);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invalid value.");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      apply();
    }
  }

  const structured = capability.widget === "json" || capability.widget === "array";
  const minimalStructuredDrawer = structured && presentation === "drawer";

  let control: ReactElement;
  if (nullDraft) {
    control = (
      <div className="rounded-[3px] border border-border bg-secondary px-2 py-2 font-mono text-[10px] italic text-muted-foreground">
        NULL will be staged.
      </div>
    );
  } else if (capability.widget === "set") {
    control = (
      <div
        className="grid max-h-40 gap-1 overflow-auto rounded-[3px] border border-border bg-secondary p-1"
        role="group"
        aria-label={controlLabel}
      >
        {(column.allowedValues ?? []).map((value) => {
          const selected = selectedSet.includes(value);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setSelectedSet((current) =>
                  current.includes(value)
                    ? current.filter((member) => member !== value)
                    : [...current, value]
                );
                setError(undefined);
              }}
              className={cn(
                "flex items-center gap-2 rounded-[2px] px-2 py-1 text-left font-mono text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-primary",
                selected ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent"
              )}
            >
              <Check className={cn("h-2.5 w-2.5", selected ? "opacity-100" : "opacity-0")} />
              {value}
            </button>
          );
        })}
      </div>
    );
  } else if (structured) {
    control = (
      <StructuredTextEditor
        text={draft}
        onChange={(value) => {
          setDraft(value);
          setError(undefined);
        }}
        label={minimalStructuredDrawer ? "JSON editor" : "New value"}
        error={error}
        autoFocus
        minHeightClassName={minimalStructuredDrawer ? "min-h-[calc(100vh-9rem)]" : "min-h-40"}
        variant={minimalStructuredDrawer ? "minimal" : "full"}
      />
    );
  } else {
    control = (
      <textarea
        autoFocus
        aria-label={controlLabel}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(undefined);
        }}
        spellCheck
        className="min-h-32 max-h-72 w-full resize-y overflow-auto rounded-[3px] border border-border bg-secondary p-2 font-mono text-[10px] text-foreground outline-none focus:border-primary"
      />
    );
  }

  return (
    <div className="grid w-full max-w-full gap-2 p-2" onKeyDown={handleKeyDown}>
      {(!minimalStructuredDrawer || column.nullable) && (
        <div className="flex items-start gap-2">
          {!minimalStructuredDrawer && (
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium text-foreground">{column.name}</p>
              <p className="font-mono text-[9px] text-quiet-foreground">{column.dataType}</p>
            </div>
          )}
          {onExpand && !minimalStructuredDrawer && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onExpand}
              aria-label="Expand to full panel"
              title="Expand to full panel"
            >
              <Maximize2 className="h-2.5 w-2.5" />
            </Button>
          )}
          {column.nullable && (
            <Button
              variant={nullDraft ? "primary" : "outline"}
              size="sm"
              aria-pressed={nullDraft}
              onClick={() => {
                setNullDraft((current) => !current);
                setError(undefined);
              }}
              className={minimalStructuredDrawer ? "ml-auto" : undefined}
            >
              NULL
            </Button>
          )}
        </div>
      )}
      {structured ? (
        control
      ) : (
        <Field
          label="New value"
          description="Ctrl/Cmd+Enter applies; Escape cancels."
          error={error}
        >
          {control}
        </Field>
      )}
      <EditorActions onApply={apply} onCancel={onCancel} />
    </div>
  );
}
