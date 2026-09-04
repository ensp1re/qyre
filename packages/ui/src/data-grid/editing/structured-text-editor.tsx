import { jsonErrorWithLocation } from "@qyre/core/mutation-editor-values";
import { Braces, Check, Copy, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";
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
  variant?: "full" | "minimal";
}

export function StructuredTextEditor({
  text,
  onChange,
  label,
  error,
  autoFocus,
  minHeightClassName = "min-h-32",
  variant = "full"
}: StructuredTextEditorProps): ReactNode {
  const syntaxError = structuredTextError(text);
  const visibleError = error ?? syntaxError;
  const controlId = useId();
  const errorId = `${controlId}-error`;
  const [copied, setCopied] = useState(false);

  function format(): void {
    if (syntaxError) return;
    onChange(JSON.stringify(JSON.parse(text), null, 2));
  }

  function minify(): void {
    if (syntaxError) return;
    onChange(JSON.stringify(JSON.parse(text)));
  }

  function copy(): void {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  const control = (
    <textarea
      id={controlId}
      aria-label={variant === "minimal" ? label : undefined}
      aria-describedby={variant === "minimal" && visibleError ? errorId : undefined}
      aria-invalid={variant === "minimal" ? Boolean(visibleError) : undefined}
      autoFocus={autoFocus}
      value={text}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
      className={`${minHeightClassName} w-full rounded-[3px] border border-border bg-secondary p-2 font-mono text-[10px] text-foreground outline-none focus:border-primary ${variant === "minimal" ? "min-h-0 flex-1 resize-none" : "resize-y"}`}
    />
  );

  return (
    <div
      className={variant === "minimal" ? "flex h-full min-h-0 flex-col gap-1.5" : "grid gap-1.5"}
    >
      {variant === "minimal" ? (
        <>
          {control}
          {visibleError && (
            <p id={errorId} className="font-mono text-[9px]" style={{ color: "var(--c-red)" }}>
              {visibleError}
            </p>
          )}
        </>
      ) : (
        <Field
          label={label}
          description="JSON is validated before Apply. Formatting changes presentation only."
          error={visibleError}
        >
          {control}
        </Field>
      )}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={format} disabled={Boolean(syntaxError)}>
          <Braces className="h-2.5 w-2.5" />
          Format
        </Button>
        <Button variant="ghost" size="sm" onClick={minify} disabled={Boolean(syntaxError)}>
          <Minus className="h-2.5 w-2.5" />
          Minify
        </Button>
        <Button variant="ghost" size="sm" onClick={copy}>
          {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
