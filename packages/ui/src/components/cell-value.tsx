import { Braces, Brackets } from "lucide-react";
import type { ReactNode } from "react";
import { formatCell } from "../format-cell.js";

/** A non-null object or array cell value - the shape CellValue/CellValueDrawer render as a tree. */
export type StructuredValue = Record<string, unknown> | unknown[];

export function isStructuredValue(value: unknown): value is StructuredValue {
  return typeof value === "object" && value !== null;
}

/** e.g. `{ 3 keys }` / `[ 1 item ]` - exported for unit testing, not meant for reuse elsewhere. */
export function summarizeStructuredValue(value: StructuredValue): string {
  if (Array.isArray(value)) {
    return `[ ${value.length} item${value.length === 1 ? "" : "s"} ]`;
  }
  const count = Object.keys(value).length;
  return `{ ${count} key${count === 1 ? "" : "s"} }`;
}

/**
 * One-line truncated JSON preview shown next to the chip's count, so rows with different content
 * are distinguishable at a glance without opening the drawer. Exported for unit testing.
 */
export function previewStructuredValue(value: StructuredValue, maxChars = 80): string {
  const json = JSON.stringify(value);
  return json.length <= maxChars ? json : `${json.slice(0, maxChars - 1)}…`;
}

/**
 * Renders one table cell value: a plain string/number/boolean renders exactly like formatCell's
 * flat text (unchanged); an object/array renders as a compact single-line chip that never grows
 * the row - clicking it reports the value via `onInspect`, and the caller opens a
 * CellValueDrawer to explore it (see docs/product-specs/structured-cell-values.md). An earlier
 * version expanded the tree inline inside the cell, which blew up row heights and broke the
 * table layout - the chip + drawer split is the deliberate replacement.
 */
export function CellValue({
  value,
  onInspect
}: {
  value: unknown;
  onInspect: (value: StructuredValue) => void;
}): ReactNode {
  if (!isStructuredValue(value)) {
    return <span>{formatCell(value)}</span>;
  }
  const Icon = Array.isArray(value) ? Brackets : Braces;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onInspect(value);
      }}
      className="flex max-w-[280px] items-center gap-1 whitespace-nowrap rounded-[2px] border border-border bg-accent/40 px-1.5 py-px text-[10px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
    >
      <Icon className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--c-amber)" }} />
      <span className="shrink-0">{summarizeStructuredValue(value)}</span>
      <span className="truncate text-muted-foreground/50">{previewStructuredValue(value)}</span>
    </button>
  );
}
