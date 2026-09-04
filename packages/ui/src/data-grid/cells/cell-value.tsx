import { Binary, Braces, Brackets } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { formatCellDisplay, isClickableDateType } from "../../primitives/format-cell.js";

export type StructuredValue = Record<string, unknown> | unknown[];

export function isStructuredValue(value: unknown): value is StructuredValue {
  return typeof value === "object" && value !== null;
}

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

export type InspectableValue = StructuredValue | BinaryValue | string;

export const LONG_STRING_THRESHOLD = 100;

export function truncateForDisplay(text: string, max = LONG_STRING_THRESHOLD): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
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

/** Only HTTP(S) values become links. */
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

export function summarizeBinaryValue(value: BinaryValue): string {
  const count = value.data.length;
  return `binary · ${count} byte${count === 1 ? "" : "s"}`;
}

export function previewBinaryValue(value: BinaryValue, maxBytes = 12): string {
  const hex = toHex(value.data.slice(0, maxBytes));
  return value.data.length > maxBytes ? `${hex}…` : hex;
}

export function summarizeStructuredValue(value: StructuredValue): string {
  if (Array.isArray(value)) {
    return `[ ${value.length} item${value.length === 1 ? "" : "s"} ]`;
  }
  const count = Object.keys(value).length;
  return `{ ${count} key${count === 1 ? "" : "s"} }`;
}

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
      aria-label={summary}
      title={`Inspect ${summary}`}
      className="flex max-w-[280px] items-center gap-1 whitespace-nowrap rounded-[2px] border border-border bg-accent/40 px-1.5 py-px text-[10px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
    >
      <Icon className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--c-amber)" }} />
      <span className="shrink-0">{summary}</span>
      <span className="truncate font-mono text-quiet-foreground">{preview}</span>
    </button>
  );
}

export function CellValue({
  value,
  dataType,
  onInspect,
  onInspectDate
}: {
  value: unknown;
  dataType?: string;
  onInspect: (value: InspectableValue) => void;
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
        className="block max-w-full truncate underline decoration-dotted underline-offset-2 hover:text-primary"
        style={{ color: "var(--c-purple)" }}
      >
        {formatCellDisplay(value, dataType)}
      </button>
    );
  }
  const text = formatCellDisplay(value, dataType);
  if (typeof value === "string" && text.length > LONG_STRING_THRESHOLD) {
    return (
      <button
        type="button"
        onDoubleClick={(event) => {
          event.stopPropagation();
          onInspect(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "F2") {
            event.preventDefault();
            onInspect(value);
          }
        }}
        title="Double-click to inspect the full value"
        className="block max-w-full truncate text-left"
      >
        {truncateForDisplay(text)}
      </button>
    );
  }
  return <span className="block max-w-full truncate">{text}</span>;
}
