import type { ColumnMetadata, DatabaseEngine } from "@qyre/core";
import { mutationEditorCapability } from "@qyre/core/mutation-editor-capabilities";
import {
  mutationValueText,
  parseMutationDraft,
  type MutationValueResult,
  validateMutationValue
} from "@qyre/core/mutation-editor-values";
import { Check, Maximize2 } from "lucide-react";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { useState } from "react";
import { cn } from "../../cn.js";
import { Button } from "../../primitives/controls/button.js";
import { Field } from "../../primitives/controls/field.js";
import { BinaryTextEditor, formatBinaryHex } from "./binary-text-editor.js";
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
  presentation?: "popover" | "drawer";
  onExpand?: () => void;
}

function setInitialValue(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((member): member is string => typeof member === "string");
  if (typeof value === "string" && value.length > 0) return value.split(",");
  return [];
}

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
  const [draft, setDraft] = useState(() =>
    capability.widget === "binary" ? formatBinaryHex(initialText) : initialText
  );
  const [selectedSet, setSelectedSet] = useState(() => setInitialValue(originalValue));
  const [nullDraft, setNullDraft] = useState(originalValue === null);
  const [error, setError] = useState<string>();

  function candidateResult(): MutationValueResult {
    if (nullDraft) return { valid: true, value: null };
    if (capability.widget === "set") {
      return validateMutationValue(capability, selectedSet, engine, metadata);
    }
    return parseMutationDraft(draft, capability, engine, metadata);
  }

  const validation = candidateResult();
  const visibleError = error ?? (validation.valid ? undefined : validation.error);

  function apply(): void {
    if (!validation.valid) {
      setError(validation.error);
      return;
    }
    setError(undefined);
    onApply(validation.value);
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
  const minimalDrawer = presentation === "drawer";

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
        label={minimalDrawer ? "JSON editor" : "New value"}
        error={visibleError}
        autoFocus
        minHeightClassName="min-h-40"
        variant={minimalDrawer ? "minimal" : "full"}
      />
    );
  } else if (capability.widget === "binary") {
    control = (
      <BinaryTextEditor
        text={draft}
        onChange={(value) => {
          setDraft(value);
          setError(undefined);
        }}
        label={controlLabel}
        error={visibleError}
        autoFocus
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
        spellCheck={false}
        className={cn(
          "w-full resize-y overflow-auto rounded-[3px] border border-border bg-secondary p-2 font-mono text-[10px] text-foreground outline-none focus:border-primary",
          minimalDrawer ? "h-full min-h-40 resize-none" : "min-h-32 max-h-72"
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "w-full max-w-full p-2",
        minimalDrawer ? "flex h-full min-h-0 flex-col gap-2" : "grid gap-2"
      )}
      onKeyDown={handleKeyDown}
    >
      {(!minimalDrawer || column.nullable) && (
        <div className="flex items-start gap-2">
          {!minimalDrawer && (
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium text-foreground">{column.name}</p>
              <p className="font-mono text-[9px] text-quiet-foreground">{column.dataType}</p>
            </div>
          )}
          {onExpand && !minimalDrawer && (
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
              className={minimalDrawer ? "ml-auto" : undefined}
            >
              NULL
            </Button>
          )}
        </div>
      )}
      {structured || minimalDrawer ? (
        <div className={minimalDrawer ? "min-h-0 flex-1 overflow-hidden" : undefined}>
          {control}
        </div>
      ) : (
        <Field
          label="New value"
          description="Ctrl/Cmd+Enter applies; Escape cancels."
          error={visibleError}
        >
          {control}
        </Field>
      )}
      {!structured && capability.widget !== "binary" && minimalDrawer && visibleError && (
        <p className="font-mono text-[9px]" style={{ color: "var(--c-red)" }}>
          {visibleError}
        </p>
      )}
      <EditorActions onApply={apply} onCancel={onCancel} applyDisabled={!validation.valid} />
    </div>
  );
}
