import { Binary, Braces, Brackets } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { formatCell } from "../format-cell.js";

/** A non-null object or array cell value - the shape CellValue/CellValueDrawer render as a tree. */
export type StructuredValue = Record<string, unknown> | unknown[];

export function isStructuredValue(value: unknown): value is StructuredValue {
  return typeof value === "object" && value !== null;
}

/**
 * Postgres `bytea`/MySQL `blob`/SQLite `BLOB` columns all arrive over the wire as a plain object
 * shaped like `{ type: "Buffer", data: [...] }` - Node's `Buffer.prototype.toJSON()` runs
 * automatically wherever a driver hands back a real Buffer and the server JSON-encodes the
 * response, so by the time this reaches the browser it's never an actual Buffer instance, just an
 * object with this shape. Rendered distinctly from a generic object/array (a hex viewer, not a
 * `{ 2 keys }` chip that "expands" into `type`/`data` fields, confirmed live to be genuinely
 * confusing) - checked before the generic isStructuredValue branch.
 */
export interface BinaryValue {
  type: "Buffer";
  data: number[];
}

export function isBinaryValue(value: unknown): value is BinaryValue {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "Buffer" &&
    Array.isArray((value as { data?: unknown }).data)
  );
}

/** Anything CellValue can render as an inspectable chip - a plain structured value or a binary one. */
export type InspectableValue = StructuredValue | BinaryValue;

export function toHex(bytes: readonly number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

/** e.g. `binary · 5 bytes` - exported for unit testing, not meant for reuse elsewhere. */
export function summarizeBinaryValue(value: BinaryValue): string {
  const count = value.data.length;
  return `binary · ${count} byte${count === 1 ? "" : "s"}`;
}

/** Truncated hex preview shown next to the chip's summary. Exported for unit testing. */
export function previewBinaryValue(value: BinaryValue, maxBytes = 12): string {
  const hex = toHex(value.data.slice(0, maxBytes));
  return value.data.length > maxBytes ? `${hex}…` : hex;
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

function InspectChip({
  icon: Icon,
  summary,
  preview,
  onClick
}: {
  icon: typeof Braces;
  summary: string;
  preview: string;
  onClick: (event: MouseEvent) => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex max-w-[280px] items-center gap-1 whitespace-nowrap rounded-[2px] border border-border bg-accent/40 px-1.5 py-px text-[10px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
    >
      <Icon className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--c-amber)" }} />
      <span className="shrink-0">{summary}</span>
      <span className="truncate font-mono text-muted-foreground/50">{preview}</span>
    </button>
  );
}

/**
 * Renders one table cell value: a plain string/number/boolean renders exactly like formatCell's
 * flat text (unchanged); a binary value (see BinaryValue) or a plain object/array renders as a
 * compact single-line chip that never grows the row - clicking it reports the value via
 * `onInspect`, and the caller opens a CellValueDrawer to explore it (see
 * docs/product-specs/structured-cell-values.md). An earlier version expanded the tree inline
 * inside the cell, which blew up row heights and broke the table layout - the chip + drawer split
 * is the deliberate replacement.
 */
export function CellValue({
  value,
  onInspect
}: {
  value: unknown;
  onInspect: (value: InspectableValue) => void;
}): ReactNode {
  if (isBinaryValue(value)) {
    return (
      <InspectChip
        icon={Binary}
        summary={summarizeBinaryValue(value)}
        preview={previewBinaryValue(value)}
        onClick={(event) => {
          event.stopPropagation();
          onInspect(value);
        }}
      />
    );
  }
  if (!isStructuredValue(value)) {
    return <span>{formatCell(value)}</span>;
  }
  return (
    <InspectChip
      icon={Array.isArray(value) ? Brackets : Braces}
      summary={summarizeStructuredValue(value)}
      preview={previewStructuredValue(value)}
      onClick={(event) => {
        event.stopPropagation();
        onInspect(value);
      }}
    />
  );
}
