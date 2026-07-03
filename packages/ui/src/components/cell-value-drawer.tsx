import { Braces, Check, Copy, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { StructuredValue } from "./cell-value.js";
import { isStructuredValue, summarizeStructuredValue } from "./cell-value.js";

export interface CellValueDrawerProps {
  /** Column the inspected value came from - shown in the header for orientation. */
  column?: string;
  value: StructuredValue;
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
          <Braces className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
            Cell Value
          </span>
          {column && (
            <span className="truncate font-mono text-[10px] text-foreground/70">{column}</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label="Copy as JSON"
              onClick={() => {
                void navigator.clipboard.writeText(JSON.stringify(value, null, 2));
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
          <TreeNode value={value} depth={0} defaultOpen />
        </div>
      </aside>
    </>
  );
}
