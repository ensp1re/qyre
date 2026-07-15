import { Binary, Braces, Brackets, Image, Link, Type } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { formatCell, isClickableDateType } from "../../primitives/format-cell.js";

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

/** Anything CellValue can render as an inspectable chip - a structured value, binary, or a long string. */
export type InspectableValue = StructuredValue | BinaryValue | string;

/** Above this length a plain string cell truncates to one line instead of stretching its row (F069). */
export const LONG_STRING_THRESHOLD = 120;

export function isLongString(value: unknown): value is string {
  return typeof value === "string" && value.length > LONG_STRING_THRESHOLD;
}

export interface UrlPreview {
  href: string;
  label: string;
  kind: "image" | "link";
}

const IMAGE_URL_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp"
]);

/** Strict http(s) URL detection for table cells; other URL-like schemes are data, not safe links. */
export function classifyUrlValue(value: unknown): UrlPreview | null {
  if (typeof value !== "string" || value.trim() !== value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const extension = url.pathname.split(".").pop()?.toLowerCase();
  const kind = extension && IMAGE_URL_EXTENSIONS.has(extension) ? "image" : "link";
  const label = `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;

  return { href: url.href, label, kind };
}

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

function UrlChip({
  preview,
  onClick
}: {
  preview: UrlPreview;
  onClick: (event: MouseEvent) => void;
}): ReactNode {
  const Icon = preview.kind === "image" ? Image : Link;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Inspect ${preview.kind} URL ${preview.label}`}
      title="Click to inspect URL"
      className="flex max-w-[360px] items-center gap-1.5 rounded-[2px] border border-border bg-accent/30 px-1.5 py-0.5 text-left font-mono text-[10px] text-foreground/80 hover:border-primary/50 hover:bg-accent/60"
    >
      {preview.kind === "image" ? (
        <img
          src={preview.href}
          alt=""
          loading="lazy"
          className="h-7 w-9 shrink-0 rounded-[2px] border border-border bg-background object-cover"
        />
      ) : (
        <Icon className="h-3 w-3 shrink-0" style={{ color: "var(--c-blue)" }} />
      )}
      <span className="truncate" style={{ color: "var(--c-blue)" }}>
        {preview.label}
      </span>
    </button>
  );
}

/**
 * Renders one table cell value: a short plain string/number/boolean renders exactly like
 * formatCell's flat text (unchanged); a binary value (see BinaryValue) or a plain object/array
 * renders as a compact single-line chip that never grows the row; a string past
 * LONG_STRING_THRESHOLD truncates to one line instead (F069); a value in a date/timestamp column
 * (see `dataType`) renders as a clickable underlined date instead (F070). All click-to-inspect
 * cases report the value via `onInspect`/`onInspectDate`; the caller opens a CellValueDrawer or
 * DateDetailPopover to show it in full (see docs/product-specs/structured-cell-values.md). An
 * earlier version expanded structured values inline inside the cell, which blew up row heights and
 * broke the table layout - the chip/truncated-text/date-link + drawer/popover split is the
 * deliberate replacement.
 */
export function CellValue({
  value,
  dataType,
  onInspect,
  onInspectDate
}: {
  value: unknown;
  /** The column's `ColumnMetadata.dataType`, if known - drives the date click affordance (F070).
   * Omitted (e.g. QueryRunner's untyped SQL result columns) simply disables it. */
  dataType?: string;
  onInspect: (value: InspectableValue) => void;
  /** Reports a date/timestamp cell click, with the clicked element's `getBoundingClientRect()` so
   * the caller can anchor a DateDetailPopover at the click site (F070). Omitted disables the date
   * affordance even for a date-typed column, falling back to plain text. */
  onInspectDate?: (value: unknown, anchorRect: DOMRect) => void;
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
  if (isStructuredValue(value)) {
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
  if (onInspectDate && dataType && isClickableDateType(dataType) && typeof value === "string") {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onInspectDate(value, event.currentTarget.getBoundingClientRect());
        }}
        title="Click for UTC, local time, and more"
        className="underline decoration-dotted underline-offset-2 hover:text-primary"
        style={{ color: "var(--c-purple)" }}
      >
        {formatCell(value)}
      </button>
    );
  }
  const urlValue = typeof value === "string" ? value : null;
  const urlPreview = classifyUrlValue(urlValue);
  if (urlPreview && urlValue !== null) {
    return (
      <UrlChip
        preview={urlPreview}
        onClick={(event) => {
          event.stopPropagation();
          onInspect(urlValue);
        }}
      />
    );
  }
  if (isLongString(value)) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onInspect(value);
        }}
        title="Click to view full value"
        className="block max-w-[360px] truncate rounded-[2px] border border-border bg-muted/40 px-1.5 py-0.5 text-left font-mono text-[10px] text-foreground/80 hover:border-primary/50 hover:bg-accent/50"
      >
        <span className="inline-flex max-w-full items-center gap-1.5">
          <Type className="h-3 w-3 shrink-0" style={{ color: "var(--c-blue)" }} />
          <span className="truncate">{value}</span>
        </span>
      </button>
    );
  }
  return <span>{formatCell(value)}</span>;
}
