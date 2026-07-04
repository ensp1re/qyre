import { Binary, Braces, Check, Copy, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { BinaryValue, InspectableValue } from "./cell-value.js";
import { isBinaryValue, isStructuredValue, summarizeStructuredValue } from "./cell-value.js";

const HEX_DUMP_BYTE_LIMIT = 1024;

/**
 * Attempts a strict UTF-8 decode of raw bytes, rejecting anything that isn't valid UTF-8 or
 * contains non-whitespace control characters - both strong signals the data is genuinely binary,
 * not text stored in a blob/bytea column (a common real-world case this makes readable instead of
 * showing only a hex dump).
 */
function decodeUtf8Printable(bytes: readonly number[]): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      // Reject non-whitespace control characters (tab/newline/CR at 9/10/13 stay allowed) - a
      // strong signal this is genuinely binary data, not text, even though it decoded as valid
      // UTF-8.
      const isControlChar = code <= 0x1f && code !== 9 && code !== 10 && code !== 13;
      if (isControlChar) return null;
    }
    return text;
  } catch {
    return null;
  }
}

function HexDump({ value }: { value: BinaryValue }): ReactNode {
  const bytes = value.data;
  const shown = bytes.slice(0, HEX_DUMP_BYTE_LIMIT);
  const rows: number[][] = [];
  for (let i = 0; i < shown.length; i += 16) rows.push(shown.slice(i, i + 16));
  const text = decodeUtf8Printable(bytes);

  return (
    <div>
      {text !== null && (
        <div className="mb-3">
          <p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
            Text (UTF-8)
          </p>
          <p className="whitespace-pre-wrap break-all" style={{ color: "var(--c-blue)" }}>
            {text}
          </p>
        </div>
      )}
      <p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
        Hex
      </p>
      <div className="space-y-0.5 overflow-x-auto whitespace-pre">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-3">
            <span className="text-muted-foreground/40">
              {(rowIndex * 16).toString(16).padStart(6, "0")}
            </span>
            <span className="text-foreground/80">
              {row.map((byte) => byte.toString(16).padStart(2, "0")).join(" ")}
            </span>
            <span className="text-muted-foreground/60">
              {row
                .map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : "."))
                .join("")}
            </span>
          </div>
        ))}
      </div>
      {bytes.length > HEX_DUMP_BYTE_LIMIT && (
        <p className="mt-1 text-muted-foreground/50">
          Showing the first {HEX_DUMP_BYTE_LIMIT} of {bytes.length} bytes.
        </p>
      )}
    </div>
  );
}

export interface CellValueDrawerProps {
  /** Column the inspected value came from - shown in the header for orientation. */
  column?: string;
  value: InspectableValue;
  onClose: () => void;
}

function PrimitiveValue({ value }: { value: unknown }): ReactNode {
  if (value === null || value === undefined) {
    return <span className="italic text-muted-foreground/50">null</span>;
  }
  if (typeof value === "string") {
    // JSON.stringify keeps the quotes, so "3" stays visually distinct from the number 3.
    return (
      <span className="whitespace-pre-wrap break-all" style={{ color: "var(--c-blue)" }}>
        {JSON.stringify(value)}
      </span>
    );
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span style={{ color: "var(--c-green)" }}>{String(value)}</span>;
  }
  return <span className="break-all">{String(value)}</span>;
}

function TreeNode({
  name,
  value,
  depth,
  defaultOpen = false
}: {
  name?: string;
  value: unknown;
  depth: number;
  defaultOpen?: boolean;
}): ReactNode {
  // Local to this drawer instance only - collapsed by default so a huge nested document never
  // builds its deeper levels until the developer actually expands them.
  const [open, setOpen] = useState(defaultOpen);
  const indent = { paddingLeft: `${depth * 14}px` };

  if (!isStructuredValue(value)) {
    return (
      <div className="flex items-baseline gap-1.5 py-0.5" style={indent}>
        <span className="w-2.5 shrink-0" />
        {name !== undefined && (
          <span className="shrink-0" style={{ color: "var(--c-amber)" }}>
            {name}:
          </span>
        )}
        <PrimitiveValue value={value} />
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-1.5 rounded-[2px] py-0.5 text-left hover:bg-accent/50"
        style={indent}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-2.5 w-2.5 shrink-0 text-muted-foreground/60 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {name !== undefined && (
          <span className="shrink-0" style={{ color: "var(--c-amber)" }}>
            {name}:
          </span>
        )}
        <span className="text-muted-foreground">{summarizeStructuredValue(value)}</span>
      </button>
      {open &&
        entries.map(([key, item]) => (
          <TreeNode key={key} name={key} value={item} depth={depth + 1} />
        ))}
    </div>
  );
}

/**
 * A right-anchored drawer for exploring one structured cell value as an expandable tree
 * (see docs/product-specs/structured-cell-values.md) - the counterpart to CellValue's compact
 * in-table chip, following QueryHistoryDrawer's drawer pattern. The root level is expanded on
 * open; deeper levels expand on click, built lazily.
 */
export function CellValueDrawer({ column, value, onClose }: CellValueDrawerProps): ReactNode {
  const [copied, setCopied] = useState(false);
  const binary = isBinaryValue(value) ? value : null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />

      <aside
        data-testid="cell-value-drawer"
        className="fixed inset-y-0 right-0 z-50 flex w-96 max-w-full flex-col border-l border-border bg-card"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          {binary ? (
            <Binary className="h-3 w-3 text-muted-foreground" />
          ) : (
            <Braces className="h-3 w-3 text-muted-foreground" />
          )}
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
            Cell Value
          </span>
          {column && (
            <span className="truncate font-mono text-[10px] text-foreground/70">{column}</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label={binary ? "Copy as hex" : "Copy as JSON"}
              onClick={() => {
                const text = binary
                  ? binary.data.map((byte) => byte.toString(16).padStart(2, "0")).join("")
                  : JSON.stringify(value, null, 2);
                void navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              {copied ? (
                <Check className="h-3 w-3" style={{ color: "var(--c-green)" }} />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
            <button
              type="button"
              aria-label="Close cell value"
              onClick={onClose}
              className="rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11px] text-foreground/80">
          {binary ? <HexDump value={binary} /> : <TreeNode value={value} depth={0} defaultOpen />}
        </div>
      </aside>
    </>
  );
}
