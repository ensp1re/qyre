import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "../cn.js";
import { formatCell } from "../format-cell.js";

function isStructured(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

/** e.g. `{ 3 keys }` / `[ 1 item ]` - exported for unit testing, not meant for reuse elsewhere. */
export function summarizeStructuredValue(value: Record<string, unknown> | unknown[]): string {
  if (Array.isArray(value)) {
    return `[ ${value.length} item${value.length === 1 ? "" : "s"} ]`;
  }
  const count = Object.keys(value).length;
  return `{ ${count} key${count === 1 ? "" : "s"} }`;
}

/**
 * Renders one table cell value: a plain string/number/boolean renders exactly like formatCell's
 * flat text (unchanged); an object/array renders as an expandable summary instead of a flat JSON
 * string - see docs/product-specs/structured-cell-values.md. Recurses into its own nested values
 * so a structured value nested inside another is still explorable, not a text fallback past the
 * first level.
 */
export function CellValue({ value, depth = 0 }: { value: unknown; depth?: number }): ReactNode {
  if (!isStructured(value)) {
    // A real element (not a bare text node) so a primitive nested inside an expanded structured
    // value has its own DOM boundary, distinct from its sibling key label.
    return <span>{formatCell(value)}</span>;
  }
  return <ExpandableCellValue value={value} depth={depth} />;
}

function ExpandableCellValue({
  value,
  depth
}: {
  value: Record<string, unknown> | unknown[];
  depth: number;
}): ReactNode {
  // Local to this render only (not persisted/synced) - collapsed by default so a page full of
  // structured cells never eagerly builds nested views until a developer actually expands one.
  const [expanded, setExpanded] = useState(false);
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);

  return (
    <div className={cn(depth > 0 && "mt-0.5")}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setExpanded((current) => !current);
        }}
        className="flex items-center gap-1 whitespace-nowrap rounded-[2px] text-muted-foreground hover:text-foreground"
      >
        <svg
          viewBox="0 0 24 24"
          className={cn("h-2.5 w-2.5 shrink-0 transition-transform", expanded && "rotate-90")}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {summarizeStructuredValue(value)}
      </button>

      {expanded && (
        <div className="mt-0.5 whitespace-normal border-l border-border-subtle pl-3">
          {entries.map(([key, item]) => (
            <div key={key} className="flex items-start gap-1.5 py-0.5">
              <span className="shrink-0 font-medium" style={{ color: "var(--c-amber)" }}>
                {key}:
              </span>
              <CellValue value={item} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
