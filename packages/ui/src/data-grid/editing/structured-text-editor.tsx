import { jsonErrorWithLocation } from "@qyre/core/mutation-editor-values";
import { Braces } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../../primitives/controls/button.js";
import { Field } from "../../primitives/controls/field.js";

export function structuredTextError(text: string): string | undefined {
  if (text.trim().length === 0) return "A JSON value is required.";
  try {
    JSON.parse(text);
    return undefined;
  } catch (error) {
    return jsonErrorWithLocation(error, text);
  }
}

export interface StructuredTextEditorProps {
  text: string;
  onChange: (text: string) => void;
  label: string;
  error?: string;
  autoFocus?: boolean;
  minHeightClassName?: string;
}

export function StructuredTextEditor({
  text,
  onChange,
  label,
  error,
  autoFocus,
  minHeightClassName = "min-h-32"
}: StructuredTextEditorProps): ReactNode {
  const syntaxError = structuredTextError(text);

  function format(): void {
    if (syntaxError) return;
    onChange(JSON.stringify(JSON.parse(text), null, 2));
  }

  return (
    <div className="grid gap-1.5">
      <Field
        label={label}
        description="JSON is validated before Apply. Formatting changes presentation only."
        error={error ?? syntaxError}
      >
        <textarea
          autoFocus={autoFocus}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className={`${minHeightClassName} w-full resize-y rounded-[3px] border border-border bg-secondary p-2 font-mono text-[10px] text-foreground outline-none focus:border-primary`}
        />
      </Field>
      <Button
        variant="ghost"
        size="sm"
        onClick={format}
        disabled={Boolean(syntaxError)}
        className="justify-self-start"
      >
        <Braces className="h-2.5 w-2.5" />
        Format JSON
      </Button>
    </div>
  );
}
