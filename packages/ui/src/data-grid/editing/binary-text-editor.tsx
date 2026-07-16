import { Check, Copy, Rows3 } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { Button } from "../../primitives/controls/button.js";

function normalizedHex(text: string): string {
  return text
    .trim()
    .replace(/^(?:\\x|0x)/i, "")
    .replace(/\s+/g, "");
}

export function formatBinaryHex(text: string): string {
  const hex = normalizedHex(text);
  if (!/^[0-9a-f]*$/i.test(hex)) return text;
  const bytes = hex.match(/.{1,2}/g) ?? [];
  return Array.from({ length: Math.ceil(bytes.length / 16) }, (_, index) =>
    bytes.slice(index * 16, index * 16 + 16).join(" ")
  ).join("\n");
}

function binarySummary(text: string): { byteCount?: number; preview?: string; error?: string } {
  const hex = normalizedHex(text);
  if (!/^[0-9a-f]*$/i.test(hex)) return { error: "Use hexadecimal digits 0-9 and A-F." };
  if (hex.length % 2 !== 0) return { error: "Complete the final byte with a second hex digit." };
  const bytes = hex.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? [];
  return {
    byteCount: bytes.length,
    preview: bytes
      .slice(0, 96)
      .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."))
      .join("")
  };
}

export function BinaryTextEditor({
  text,
  onChange,
  label,
  error,
  autoFocus
}: {
  text: string;
  onChange: (text: string) => void;
  label: string;
  error?: string;
  autoFocus?: boolean;
}): ReactNode {
  const controlId = useId();
  const errorId = `${controlId}-error`;
  const [copied, setCopied] = useState(false);
  const summary = binarySummary(text);
  const visibleError = error ?? summary.error;

  function copy(): void {
    void navigator.clipboard.writeText(normalizedHex(text).toLowerCase());
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <textarea
        id={controlId}
        aria-label={label}
        aria-describedby={visibleError ? errorId : undefined}
        aria-invalid={Boolean(visibleError)}
        autoFocus={autoFocus}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        className="min-h-40 flex-1 resize-none overflow-auto rounded-[3px] border border-border bg-secondary p-2 font-mono text-[10px] text-foreground outline-none focus:border-primary"
      />
      <div className="flex min-w-0 items-center gap-2 font-mono text-[9px] text-quiet-foreground">
        {summary.byteCount !== undefined && (
          <span>
            {summary.byteCount} byte{summary.byteCount === 1 ? "" : "s"}
          </span>
        )}
        {summary.preview && <span className="truncate">ASCII {summary.preview}</span>}
      </div>
      {visibleError && (
        <p id={errorId} className="font-mono text-[9px]" style={{ color: "var(--c-red)" }}>
          {visibleError}
        </p>
      )}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(formatBinaryHex(text))}
          disabled={Boolean(summary.error)}
        >
          <Rows3 className="h-2.5 w-2.5" />
          Format hex
        </Button>
        <Button variant="ghost" size="sm" onClick={copy} disabled={Boolean(summary.error)}>
          {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
          {copied ? "Copied" : "Copy hex"}
        </Button>
      </div>
    </div>
  );
}
