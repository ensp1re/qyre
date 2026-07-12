import type { StatementClassification } from "@qyre/core";
import { History, X } from "lucide-react";
import type { ReactNode } from "react";
import { useRef } from "react";
import { cn } from "../cn.js";
import { useFocusTrap } from "../primitives/use-focus-trap.js";

/** One past successful SQL Editor query (F012). Persisted by the caller (apps/web), not this
 * package - packages/ui stays presentation-only per FRONTEND.md. `classification` (F108) is
 * absent for a query recorded before this field existed, or for a read-only session (which never
 * computes one, per docs/product-specs/sql-editor.md's "read-only sessions keep today's editor
 * exactly"). */
export interface QueryHistoryEntry {
  readonly sql: string;
  readonly ranAt: number;
  readonly classification?: StatementClassification;
}

export interface QueryHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: QueryHistoryEntry[];
  onSelect: (sql: string) => void;
}

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${Math.round(diffHour / 24)}d ago`;
}

/**
 * A right-anchored slide-in drawer listing past successful queries, most recent first (F012).
 * Clicking a card only reports the selection via `onSelect` - the caller decides what that means
 * (prefill the editor and close), same division of responsibility as Sidebar's `onSelect`.
 */
export function QueryHistoryDrawer({
  open,
  onOpenChange,
  entries,
  onSelect
}: QueryHistoryDrawerProps): ReactNode {
  const asideRef = useRef<HTMLElement | null>(null);
  useFocusTrap(asideRef, open);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
        />
      )}

      <aside
        ref={asideRef}
        tabIndex={-1}
        data-testid="query-history-drawer"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-border bg-card outline-none transition-transform duration-150",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <History className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
            Query History
          </span>
          <button
            type="button"
            aria-label="Close history"
            onClick={() => onOpenChange(false)}
            className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {entries.length === 0 ? (
            <p className="p-2 font-mono text-[11px] text-muted-foreground">
              No queries yet - successful queries you run will show up here.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {entries.map((entry) => (
                <li key={`${entry.ranAt}-${entry.sql}`}>
                  <button
                    type="button"
                    data-testid="query-history-card"
                    onClick={() => onSelect(entry.sql)}
                    className="w-full rounded-[3px] border border-border bg-background p-2 text-left transition-colors hover:border-primary/50"
                  >
                    <p className="line-clamp-3 whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/80">
                      {entry.sql}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                      {formatRelativeTime(entry.ranAt)}
                      {entry.classification && entry.classification !== "read" && (
                        <span
                          data-testid="query-history-classification"
                          className="rounded-[2px] border px-1 py-0.5 uppercase tracking-wide"
                          style={{ borderColor: "var(--c-red)", color: "var(--c-red)" }}
                        >
                          {entry.classification}
                        </span>
                      )}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
