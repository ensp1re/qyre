import { Check, Copy, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export interface DateDetailPopoverProps {
  value: unknown;
  anchorRect: DOMRect;
  onClose: () => void;
}

const POPOVER_WIDTH = 320;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function formatUtcOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1]
  ];
  for (const [unit, secondsInUnit] of units) {
    if (Math.abs(diffSeconds) >= secondsInUnit || unit === "second") {
      return rtf.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }
  return rtf.format(0, "second");
}

function DetailRow({
  label,
  text,
  copiedLabel,
  onCopy
}: {
  label: string;
  text: string;
  copiedLabel: string | null;
  onCopy: (label: string, text: string) => void;
}): ReactNode {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="shrink-0 text-quiet-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate text-foreground/80">{text}</span>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          onClick={() => onCopy(label, text)}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          {copiedLabel === label ? (
            <Check className="h-2.5 w-2.5" style={{ color: "var(--c-green)" }} />
          ) : (
            <Copy className="h-2.5 w-2.5" />
          )}
        </button>
      </div>
    </div>
  );
}

export function DateDetailPopover({
  value,
  anchorRect,
  onClose
}: DateDetailPopoverProps): ReactNode {
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const date = value instanceof Date ? value : new Date(String(value));
  const valid = !Number.isNaN(date.getTime());

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function copy(label: string, text: string): void {
    void navigator.clipboard.writeText(text);
    setCopiedLabel(label);
    setTimeout(() => setCopiedLabel(null), 1200);
  }

  const left =
    typeof window === "undefined"
      ? anchorRect.left
      : Math.max(8, Math.min(anchorRect.left, window.innerWidth - POPOVER_WIDTH - 8));
  const top = anchorRect.bottom + 4;

  const zoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localText = valid
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "long" }).format(date)
    : "";

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label="Date value details"
        data-testid="date-detail-popover"
        style={{ left, top, width: POPOVER_WIDTH }}
        className="fixed z-50 rounded-[3px] border border-border bg-card p-2 font-mono text-[11px] shadow-lg"
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-widest text-quiet-foreground">
            Date Value
          </span>
          <button
            type="button"
            aria-label="Close date detail"
            onClick={onClose}
            className="rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        {valid ? (
          <div>
            <DetailRow label="Raw" text={String(value)} copiedLabel={copiedLabel} onCopy={copy} />
            <DetailRow
              label="UTC"
              text={date.toISOString()}
              copiedLabel={copiedLabel}
              onCopy={copy}
            />
            <DetailRow
              label={`Local (${zoneName}, ${formatUtcOffset(date)})`}
              text={localText}
              copiedLabel={copiedLabel}
              onCopy={copy}
            />
            <DetailRow
              label="Relative"
              text={formatRelativeTime(date)}
              copiedLabel={copiedLabel}
              onCopy={copy}
            />
            <DetailRow
              label="Unix epoch"
              text={`${Math.floor(date.getTime() / 1000)}s / ${date.getTime()}ms`}
              copiedLabel={copiedLabel}
              onCopy={copy}
            />
          </div>
        ) : (
          <p className="text-quiet-foreground">
            Could not parse &quot;{String(value)}&quot; as a date.
          </p>
        )}
      </div>
    </>
  );
}
